import { prisma } from "../../lib/prisma.js";
import { ESTADO, ROL } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos, textoOpcional } from "../../utils/validar.js";
import { avisarSinFallar, notificar, TIPO } from "../notificaciones/notificaciones.service.js";

// Solicitudes de tutoría: un estudiante (o un tutor, en otra materia) pide una tutoría que no
// encuentra en el catálogo; los tutores de esa materia la ven y la atienden con una tutoría suya
// (nueva o existente). Estados del catálogo existente:
export const SOLICITUD = Object.freeze({
  ABIERTA: ESTADO.PENDIENTE, // 3
  ATENDIDA: ESTADO.COMPLETADO, // 5
  RETIRADA: ESTADO.CANCELADO, // 4: la retiró quien la pidió
  VENCIDA: ESTADO.INACTIVO, // 2: pasaron DIAS_VIGENCIA días sin respuesta
});
export const MAXIMO_ABIERTAS = 3;
export const DIAS_VIGENCIA = 30;

const incluir = {
  estado: { select: { nombre: true } },
  materia: { select: { id: true, nombre: true, codigo: true } },
  // Al tutor solo se le muestran nombre y apellido de quien pide (nunca correo ni documento)
  estudiante: { select: { id: true, nombre: true, apellido: true } },
  tutor: { select: { id: true, nombre: true, apellido: true } },
  tutoria: { select: { id: true, titulo: true, id_estado: true } },
};
const formatear = ({ estado, ...solicitud }) => ({ ...solicitud, estado: estado.nombre });

function texto(valor, campo, maximo) {
  const limpio = textoOpcional(valor);
  if (limpio && limpio.length > maximo) throw new AppError(400, `${campo} admite máximo ${maximo} caracteres`);
  return limpio;
}

/**
 * Vence las abiertas con más de DIAS_VIGENCIA días y avisa a quien las pidió.
 * Sin tareas programadas: se ejecuta al consultar, como mucho una vez por hora; si falla, no rompe nada.
 */
let ultimoVencimiento = 0;
export async function vencerAntiguas({ forzar = false } = {}) {
  const momento = Date.now();
  if (!forzar && momento - ultimoVencimiento < 60 * 60 * 1000) return 0;
  ultimoVencimiento = momento;
  let vencidas = 0;
  await avisarSinFallar(() =>
    prisma.$transaction(async (tx) => {
      const limite = new Date(momento - DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
      const antiguas = await tx.solicitudTutoria.findMany({
        where: { id_estado: SOLICITUD.ABIERTA, fecha: { lt: limite } },
        select: { id: true, id_estudiante: true, tema: true },
      });
      if (antiguas.length === 0) return;
      ({ count: vencidas } = await tx.solicitudTutoria.updateMany({
        where: { id: { in: antiguas.map((s) => s.id) }, id_estado: SOLICITUD.ABIERTA },
        data: { id_estado: SOLICITUD.VENCIDA },
      }));
      await notificar(tx, antiguas.map((s) => ({
        id_usuario: s.id_estudiante,
        tipo: TIPO.SOLICITUD_TUTORIA_VENCIDA,
        titulo: `Su solicitud «${s.tema}» venció sin respuesta`,
        mensaje: `Pasaron ${DIAS_VIGENCIA} días sin que un tutor la atendiera. Puede publicarla de nuevo o buscar en el catálogo.`,
        enlace: "/solicitudes",
      })));
    })
  );
  return vencidas;
}

/**
 * POST /api/solicitudes-tutoria — estudiante o tutor.
 * Body: { id_materia, tema, descripcion?, disponibilidad? }
 * - Materia inexistente → 404. Máximo MAXIMO_ABIERTAS abiertas por persona → 409.
 * - Avisa a los tutores activos de esa materia (menos a quien la pide).
 * Concurrencia: bloquea al usuario; dos envíos simultáneos no pasan el límite.
 */
export async function crear(usuario, datos = {}) {
  requerirCampos(datos, ["id_materia", "tema"]);
  const idMateria = aEntero(datos.id_materia, "id_materia");
  const tema = texto(datos.tema, "tema", 200);
  if (!tema) throw new AppError(400, "El tema no puede estar vacío");
  const descripcion = texto(datos.descripcion, "descripcion", 2000);
  const disponibilidad = texto(datos.disponibilidad, "disponibilidad", 300);

  const materia = await prisma.materia.findUnique({ where: { id: idMateria }, select: { id: true, nombre: true } });
  if (!materia) throw new AppError(404, "Materia no encontrada");

  const solicitud = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tbl_usuario WHERE id = ${usuario.id} FOR UPDATE`;
    const abiertas = await tx.solicitudTutoria.count({
      where: { id_estudiante: usuario.id, id_estado: SOLICITUD.ABIERTA },
    });
    if (abiertas >= MAXIMO_ABIERTAS) {
      throw new AppError(409, `Ya tiene ${MAXIMO_ABIERTAS} solicitudes abiertas; espere respuesta o retire una`);
    }
    const creada = await tx.solicitudTutoria.create({
      data: { id_estudiante: usuario.id, id_materia: idMateria, tema, descripcion, disponibilidad, id_estado: SOLICITUD.ABIERTA },
      include: incluir,
    });
    const tutores = await tx.materiaTutor.findMany({
      where: {
        id_materia: idMateria,
        id_tutor: { not: usuario.id },
        tutor: { id_rol: ROL.TUTOR, id_estado: ESTADO.ACTIVO },
      },
      select: { id_tutor: true },
    });
    await notificar(tx, tutores.map((t) => ({
      id_usuario: t.id_tutor,
      tipo: TIPO.SOLICITUD_TUTORIA_NUEVA,
      titulo: `Piden una tutoría de ${materia.nombre}: «${tema}»`,
      mensaje: disponibilidad ? `Disponibilidad: ${disponibilidad}` : "Revise la solicitud y atiéndala con una de sus tutorías.",
      enlace: "/tutor/solicitudes",
    })));
    return creada;
  });
  return formatear(solicitud);
}

/** GET /api/solicitudes-tutoria/mias — las de quien pregunta (todas), más recientes primero. */
export async function listarMias(idUsuario) {
  await vencerAntiguas();
  const solicitudes = await prisma.solicitudTutoria.findMany({
    where: { id_estudiante: idUsuario },
    include: incluir,
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
  });
  return solicitudes.map(formatear);
}

/**
 * GET /api/solicitudes-tutoria/para-mi — tutor.
 * Abiertas de las materias que tiene asociadas (sin las propias), de la más antigua a la más nueva:
 * las que más llevan esperando, primero.
 */
export async function listarParaTutor(idTutor) {
  await vencerAntiguas();
  const materias = await prisma.materiaTutor.findMany({ where: { id_tutor: idTutor }, select: { id_materia: true } });
  if (materias.length === 0) return [];
  const solicitudes = await prisma.solicitudTutoria.findMany({
    where: {
      id_estado: SOLICITUD.ABIERTA,
      id_materia: { in: materias.map((m) => m.id_materia) },
      id_estudiante: { not: idTutor },
    },
    include: incluir,
    orderBy: [{ fecha: "asc" }, { id: "asc" }],
  });
  return solicitudes.map(formatear);
}

/**
 * PATCH /api/solicitudes-tutoria/:id/retirar — quien la pidió. Solo abiertas (409).
 * Ajena o inexistente → 404.
 */
export async function retirar(id, idUsuario) {
  const { count } = await prisma.solicitudTutoria.updateMany({
    where: { id, id_estudiante: idUsuario, id_estado: SOLICITUD.ABIERTA },
    data: { id_estado: SOLICITUD.RETIRADA },
  });
  if (count === 0) {
    const propia = await prisma.solicitudTutoria.findFirst({ where: { id, id_estudiante: idUsuario }, select: { id: true } });
    if (!propia) throw new AppError(404, "Solicitud no encontrada");
    throw new AppError(409, "Solo se pueden retirar solicitudes abiertas");
  }
  return formatear(await prisma.solicitudTutoria.findUnique({ where: { id }, include: incluir }));
}

/**
 * Marca la solicitud como atendida con `tutoria` (dentro de la transacción tx) y avisa a quien la
 * pidió. Validaciones: existe (404), no es propia (409), misma materia que la tutoría (400).
 * Devuelve false si ya no estaba abierta (otro tutor se adelantó, la retiraron o venció).
 * La usan atender() y la creación de tutorías ("Publicar una tutoría nueva" desde la solicitud).
 */
export async function atenderEnTx(tx, idSolicitud, idTutor, tutoria) {
  const solicitud = await tx.solicitudTutoria.findUnique({ where: { id: idSolicitud } });
  if (!solicitud) throw new AppError(404, "Solicitud no encontrada");
  if (solicitud.id_estudiante === idTutor) throw new AppError(409, "No puede atender su propia solicitud");
  if (solicitud.id_materia !== tutoria.id_materia) {
    throw new AppError(400, "La tutoría debe ser de la misma materia que la solicitud");
  }
  // UPDATE ... WHERE abierta: si dos tutores la atienden a la vez, solo uno lo logra
  const { count } = await tx.solicitudTutoria.updateMany({
    where: { id: idSolicitud, id_estado: SOLICITUD.ABIERTA },
    data: { id_estado: SOLICITUD.ATENDIDA, id_tutor: idTutor, id_tutoria: tutoria.id, fecha_atencion: new Date() },
  });
  if (count === 0) return false;
  const tutor = await tx.usuario.findUnique({ where: { id: idTutor }, select: { nombre: true, apellido: true } });
  await notificar(tx, [{
    id_usuario: solicitud.id_estudiante,
    tipo: TIPO.SOLICITUD_TUTORIA_ATENDIDA,
    titulo: `Un tutor atendió su solicitud «${solicitud.tema}»`,
    mensaje: `${tutor.nombre} ${tutor.apellido} ofrece «${tutoria.titulo}». Reserve uno de sus horarios.`,
    enlace: `/tutorias/${tutoria.id}`,
  }]);
  return true;
}

/**
 * PATCH /api/solicitudes-tutoria/:id/atender — tutor. Body: { id_tutoria }
 * Atiende con una tutoría propia y ACTIVA de la misma materia.
 * Tutoría inexistente o ajena → 404; inactiva → 409; solicitud ya no abierta → 409.
 */
export async function atender(id, idTutor, datos = {}) {
  requerirCampos(datos, ["id_tutoria"]);
  const idTutoria = aEntero(datos.id_tutoria, "id_tutoria");
  return prisma.$transaction(async (tx) => {
    const tutoria = await tx.tutoria.findUnique({ where: { id: idTutoria } });
    if (!tutoria || tutoria.id_tutor !== idTutor) throw new AppError(404, "Tutoría no encontrada entre las suyas");
    if (tutoria.id_estado !== ESTADO.ACTIVO) throw new AppError(409, "Active la tutoría antes de ofrecerla");
    const atendida = await atenderEnTx(tx, id, idTutor, tutoria);
    if (!atendida) throw new AppError(409, "Esta solicitud ya no está abierta (otro tutor la atendió, la retiraron o venció)");
    return formatear(await tx.solicitudTutoria.findUnique({ where: { id }, include: incluir }));
  });
}
