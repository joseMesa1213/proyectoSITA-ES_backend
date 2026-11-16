import { prisma } from "../../lib/prisma.js";
import { ESTADO, ROL } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { requerirCampos, textoOpcional, validarOpcion } from "../../utils/validar.js";

// Solicitudes para ser tutor:  PENDIENTE → APROBADO (id_rol sube de 1 a 2)  |  PENDIENTE → RECHAZADO
// Se guarda el historial: quien fue rechazado puede volver a solicitar.

const incluir = {
  estado: { select: { nombre: true } },
  usuario: {
    select: {
      id: true, nombre: true, apellido: true, correo: true, id_rol: true,
      estudiante: { select: { nombre_programa: true, semestre: true } },
    },
  },
  revisor: { select: { id: true, nombre: true, apellido: true } },
};

// El estado sale como texto ("Pendiente", "Aprobado"...) además de id_estado
const formatear = ({ estado, ...solicitud }) => ({ ...solicitud, estado: estado.nombre });

const FILTROS = {
  pendientes: { where: { id_estado: ESTADO.PENDIENTE }, orderBy: [{ fecha_solicitud: "asc" }, { id: "asc" }] },
  historial: {
    where: { id_estado: { in: [ESTADO.APROBADO, ESTADO.RECHAZADO] } },
    orderBy: [{ fecha_revision: "desc" }, { id: "desc" }],
  },
};

/**
 * POST /api/solicitudes-tutor — estudiante (o tutor, que recibe 409). Body: { motivo? }
 * - Ya es tutor → 409. Ya tiene una solicitud pendiente → 409 (el índice único parcial de la BD lo
 *   garantiza aunque lleguen dos peticiones a la vez).
 */
export async function crear(usuario, { motivo } = {}) {
  if (usuario.rol === ROL.TUTOR) throw new AppError(409, "Usted ya es tutor");
  try {
    const solicitud = await prisma.solicitudTutor.create({
      data: { id_usuario: usuario.id, id_estado: ESTADO.PENDIENTE, motivo: textoOpcional(motivo) },
      include: incluir,
    });
    return formatear(solicitud);
  } catch (error) {
    if (error.code === "P2002") throw new AppError(409, "Ya tiene una solicitud pendiente de revisión");
    throw error;
  }
}

/**
 * GET /api/solicitudes-tutor/mia — autenticado.
 * Última solicitud del usuario (o null si nunca ha solicitado).
 */
export async function obtenerMia(idUsuario) {
  const solicitud = await prisma.solicitudTutor.findFirst({
    where: { id_usuario: idUsuario },
    include: incluir,
    orderBy: [{ fecha_solicitud: "desc" }, { id: "desc" }],
  });
  return solicitud ? formatear(solicitud) : null;
}

/**
 * GET /api/solicitudes-tutor?estado=pendientes|historial — administrador.
 * Pendientes de la más antigua a la más nueva (orden de llegada); historial de la revisión más reciente.
 */
export async function listar({ estado = "pendientes" } = {}) {
  validarOpcion(estado, Object.keys(FILTROS), "estado");
  const solicitudes = await prisma.solicitudTutor.findMany({ ...FILTROS[estado], include: incluir });
  return solicitudes.map(formatear);
}

/**
 * Cambia una solicitud PENDIENTE a aprobada o rechazada, en una transacción.
 * El UPDATE ... WHERE id_estado = PENDIENTE es atómico: si dos administradores revisan a la vez,
 * solo uno lo logra y el otro recibe 409.
 * Al aprobar, id_rol sube de 1 (Estudiante) a 2 (Tutor). Como autenticar lee el rol de la BD,
 * el usuario puede publicar tutorías desde su siguiente petición, sin volver a iniciar sesión.
 */
async function revisar(id, idAdmin, nuevoEstado, observacion) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.solicitudTutor.updateMany({
      where: { id, id_estado: ESTADO.PENDIENTE },
      data: { id_estado: nuevoEstado, id_revisor: idAdmin, fecha_revision: new Date(), observacion },
    });
    if (count === 0) {
      const existe = await tx.solicitudTutor.findUnique({ where: { id }, select: { id: true } });
      throw existe
        ? new AppError(409, "Esta solicitud ya fue revisada")
        : new AppError(404, "Solicitud no encontrada");
    }

    if (nuevoEstado === ESTADO.APROBADO) {
      const { id_usuario } = await tx.solicitudTutor.findUnique({ where: { id }, select: { id_usuario: true } });
      // Solo sube a quien sigue siendo estudiante: a un administrador no se le cambia el nivel
      await tx.usuario.updateMany({
        where: { id: id_usuario, id_rol: ROL.ESTUDIANTE },
        data: { id_rol: ROL.TUTOR },
      });
    }

    return formatear(await tx.solicitudTutor.findUnique({ where: { id }, include: incluir }));
  });
}

/**
 * PATCH /api/solicitudes-tutor/:id/aprobar — administrador. Body: { observacion? }
 * No pendiente → 409. No existe → 404.
 */
export const aprobar = (id, idAdmin, { observacion } = {}) =>
  revisar(id, idAdmin, ESTADO.APROBADO, textoOpcional(observacion));

/**
 * PATCH /api/solicitudes-tutor/:id/rechazar — administrador. Body: { observacion } (obligatoria:
 * el usuario la ve en su perfil para saber por qué). No pendiente → 409. No existe → 404.
 */
export async function rechazar(id, idAdmin, { observacion } = {}) {
  requerirCampos({ observacion: textoOpcional(observacion) }, ["observacion"]);
  return revisar(id, idAdmin, ESTADO.RECHAZADO, textoOpcional(observacion));
}
