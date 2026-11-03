import { prisma } from "../../lib/prisma.js";
import { DIAS, ESTADO, MODALIDADES, NIVELES, RECURSO_POR_MODALIDAD } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos, validarOpcion } from "../../utils/validar.js";
import { ahora, dateAHora, esHoraValida, fechaATexto, horaADate, hoy, textoAFecha } from "../../utils/fechas.js";

// Concurrencia: las transacciones que bloquean filas (SELECT ... FOR UPDATE) lo hacen
// SIEMPRE en este orden para no caer en deadlocks: usuario → tutoría → horario → recurso.

// Datos públicos del tutor: nunca correo ni documento
const tutorPublico = { select: { id: true, nombre: true, apellido: true } };
const materiaResumen = { select: { id: true, nombre: true, codigo: true } };
// La ubicación (salón o enlace) solo la ve quien reserva, no la divulgación pública
const recursoResumen = { select: { id: true, nombre: true, tipo: true } };

const incluir = (soloHorariosActivos) => ({
  materia: materiaResumen,
  tutor: tutorPublico,
  horarios: {
    ...(soloHorariosActivos && { where: { id_estado: ESTADO.ACTIVO } }),
    include: { recurso: recursoResumen },
  },
});

const formatearHorario = (h) => ({
  id: h.id,
  id_tutoria: h.id_tutoria,
  id_estado: h.id_estado,
  dia: h.dia,
  hora_inicio: dateAHora(h.hora_inicio),
  hora_fin: dateAHora(h.hora_fin),
  recurso: h.recurso,
});

// Lunes primero, Domingo al final; dentro del día, por hora de inicio
const ordenDia = (dia) => (DIAS.indexOf(dia) + 6) % 7;
const compararHorarios = (a, b) =>
  ordenDia(a.dia) - ordenDia(b.dia) || a.hora_inicio.localeCompare(b.hora_inicio);

const formatear = (t) => ({
  ...t,
  horarios: t.horarios.map(formatearHorario).sort(compararHorarios),
});

// Busca la tutoría y verifica que sea del tutor autenticado
async function obtenerPropia(id, idTutor) {
  const tutoria = await prisma.tutoria.findUnique({ where: { id } });
  if (!tutoria) throw new AppError(404, "Tutoría no encontrada");
  if (tutoria.id_tutor !== idTutor) {
    throw new AppError(403, "Solo el tutor dueño puede modificar esta tutoría");
  }
  return tutoria;
}

// Cancela las reservas ACTIVAS de esos horarios cuya sesión aún no empieza; las ya
// ocurridas se dejan para que el tutor las complete. Devuelve cuántas canceló.
async function cancelarSesionesPendientes(tx, horarios) {
  if (horarios.length === 0) return 0;
  const fechaHoy = textoAFecha(hoy());
  const horaActual = ahora();
  const { count } = await tx.reserva.updateMany({
    where: {
      id_estado: ESTADO.ACTIVO,
      OR: horarios.map((h) => ({
        id_horario: h.id,
        // La sesión de hoy cuenta como pendiente solo si todavía no empieza
        fecha_sesion: dateAHora(h.hora_inicio) > horaActual ? { gte: fechaHoy } : { gt: fechaHoy },
      })),
    },
    data: { id_estado: ESTADO.CANCELADO },
  });
  return count;
}

// Toma solo los campos enviados y los valida. Se usa en crear y actualizar.
function datosTutoria({ titulo, descripcion, nivel, modalidad, cupo }) {
  const data = {};
  if (titulo !== undefined) {
    data.titulo = String(titulo).trim();
    if (!data.titulo) throw new AppError(400, "El título no puede estar vacío");
  }
  if (descripcion !== undefined) data.descripcion = descripcion ? String(descripcion) : null;
  if (nivel !== undefined) {
    validarOpcion(nivel, NIVELES, "nivel");
    data.nivel = nivel;
  }
  if (modalidad !== undefined) {
    validarOpcion(modalidad, MODALIDADES, "modalidad");
    data.modalidad = modalidad;
  }
  if (cupo !== undefined) data.cupo = aEntero(cupo, "cupo");
  return data;
}

/**
 * GET /api/tutorias?id_materia=&nivel=&modalidad= — público (divulgación).
 * Tutorías ACTIVAS con sus horarios ACTIVOS, más recientes primero.
 */
export async function listar({ id_materia, nivel, modalidad } = {}) {
  const where = { id_estado: ESTADO.ACTIVO };
  if (id_materia) where.id_materia = aEntero(id_materia, "id_materia");
  if (nivel) {
    validarOpcion(nivel, NIVELES, "nivel");
    where.nivel = nivel;
  }
  if (modalidad) {
    validarOpcion(modalidad, MODALIDADES, "modalidad");
    where.modalidad = modalidad;
  }

  const tutorias = await prisma.tutoria.findMany({
    where,
    include: incluir(true),
    orderBy: { fecha: "desc" },
  });
  return tutorias.map(formatear);
}

/**
 * GET /api/tutorias/mias — tutor.
 * Tutorías del tutor (activas e inactivas) con todos sus horarios.
 */
export async function listarDelTutor(idTutor) {
  const tutorias = await prisma.tutoria.findMany({
    where: { id_tutor: idTutor },
    include: incluir(false),
    orderBy: { fecha: "desc" },
  });
  return tutorias.map(formatear);
}

/**
 * GET /api/tutorias/:id — público.
 * Detalle con materia, tutor (datos públicos) y horarios activos. 404 si no existe.
 */
export async function obtener(id) {
  const tutoria = await prisma.tutoria.findUnique({ where: { id }, include: incluir(true) });
  if (!tutoria) throw new AppError(404, "Tutoría no encontrada");
  return formatear(tutoria);
}

/**
 * POST /api/tutorias — tutor.
 * Body: { id_materia, titulo, descripcion?, nivel, modalidad, cupo }
 * El tutor debe tener la materia asociada (si no → 403).
 */
export async function crear(idTutor, datos) {
  requerirCampos(datos, ["id_materia", "titulo", "nivel", "modalidad", "cupo"]);
  const idMateria = aEntero(datos.id_materia, "id_materia");
  const data = datosTutoria(datos);

  const asociada = await prisma.materiaTutor.findUnique({
    where: { id_tutor_id_materia: { id_tutor: idTutor, id_materia: idMateria } },
  });
  if (!asociada) {
    throw new AppError(403, "Debe asociarse a la materia antes de publicar tutorías de ella");
  }

  const tutoria = await prisma.tutoria.create({
    data: { ...data, id_tutor: idTutor, id_materia: idMateria, id_estado: ESTADO.ACTIVO },
    include: incluir(false),
  });
  return formatear(tutoria);
}

/**
 * PUT /api/tutorias/:id — tutor dueño.
 * Body: { titulo?, descripcion?, nivel?, modalidad?, cupo?, id_estado? }
 * id_estado solo ACTIVO o INACTIVO. No se cambia id_materia.
 * - cupo: no puede superar la capacidad del recurso de algún horario activo (409) ni
 *   quedar por debajo de las reservas activas de una sesión futura (409).
 * - modalidad: los recursos de los horarios activos deben ser compatibles (409).
 * - Inactivar: sus horarios pasan a INACTIVO y las reservas de sesiones que aún no
 *   empiezan, a CANCELADO. La respuesta incluye reservas_canceladas.
 * Concurrencia: bloquea la tutoría, sus horarios activos y sus recursos; una reserva o
 * un cambio de capacidad simultáneos esperan y ven el cupo ya validado.
 */
export async function actualizar(id, idTutor, datos = {}) {
  await obtenerPropia(id, idTutor);

  const data = datosTutoria(datos);
  if (datos.id_estado !== undefined) {
    data.id_estado = Number(datos.id_estado);
    validarOpcion(data.id_estado, [ESTADO.ACTIVO, ESTADO.INACTIVO], "id_estado");
  }
  if (Object.keys(data).length === 0) {
    throw new AppError(
      400,
      "Envíe al menos uno de: titulo, descripcion, nivel, modalidad, cupo, id_estado"
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tbl_tutoria WHERE id = ${id} FOR UPDATE`;
    await tx.$queryRaw`
      SELECT id FROM tbl_horario
      WHERE id_tutoria = ${id} AND id_estado = ${ESTADO.ACTIVO} ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`
      SELECT id FROM tbl_recurso WHERE id IN (
        SELECT id_recurso FROM tbl_horario WHERE id_tutoria = ${id} AND id_estado = ${ESTADO.ACTIVO}
      ) ORDER BY id FOR UPDATE`;

    const horarios = await tx.horario.findMany({
      where: { id_tutoria: id, id_estado: ESTADO.ACTIVO },
      include: { recurso: true },
    });

    let reservasCanceladas = 0;
    if (data.id_estado === ESTADO.INACTIVO) {
      reservasCanceladas = await cancelarSesionesPendientes(tx, horarios);
      await tx.horario.updateMany({
        where: { id_tutoria: id, id_estado: ESTADO.ACTIVO },
        data: { id_estado: ESTADO.INACTIVO },
      });
    } else {
      if (data.cupo !== undefined) await validarCupo(tx, horarios, data.cupo);
      const tipoRequerido = RECURSO_POR_MODALIDAD[data.modalidad];
      const incompatible = tipoRequerido && horarios.find((h) => h.recurso.tipo !== tipoRequerido);
      if (incompatible) {
        throw new AppError(
          409,
          `Una tutoría ${data.modalidad} requiere recursos ${tipoRequerido}; desactive primero los horarios que usan otro tipo`,
          { recurso: incompatible.recurso.nombre, dia: incompatible.dia }
        );
      }
    }

    const tutoria = await tx.tutoria.update({ where: { id }, data, include: incluir(false) });
    return { ...formatear(tutoria), reservas_canceladas: reservasCanceladas };
  });
}

// El nuevo cupo debe caber en cada recurso y no dejar sesiones futuras sobrevendidas
async function validarCupo(tx, horarios, cupo) {
  const pequeno = horarios.find((h) => h.recurso.capacidad < cupo);
  if (pequeno) {
    throw new AppError(409, "El cupo supera la capacidad del recurso de uno de sus horarios", {
      recurso: pequeno.recurso.nombre,
      capacidad: pequeno.recurso.capacidad,
    });
  }
  const sesiones = await tx.reserva.groupBy({
    by: ["id_horario", "fecha_sesion"],
    where: {
      id_horario: { in: horarios.map((h) => h.id) },
      id_estado: ESTADO.ACTIVO,
      fecha_sesion: { gte: textoAFecha(hoy()) },
    },
    _count: { _all: true },
  });
  const maximo = Math.max(0, ...sesiones.map((s) => s._count._all));
  if (cupo < maximo) {
    throw new AppError(409, `Ya hay una sesión futura con ${maximo} reservas activas; el cupo no puede ser menor`);
  }
}

/**
 * POST /api/tutorias/:id/horarios — tutor dueño.
 * Body: { dia, hora_inicio: "HH:MM", hora_fin: "HH:MM", id_recurso }
 * - La tutoría debe estar ACTIVA (409).
 * - Recurso: existe (404), ACTIVO, compatible con la modalidad y con capacidad >= cupo (409).
 * - Sin cruces (409) en ese día y franja con:
 *   · otro horario ACTIVO del mismo tutor,
 *   · otro horario ACTIVO de cualquier tutor en el mismo recurso (salón o enlace),
 *   · una reserva ACTIVA futura que el tutor hizo como estudiante.
 * Concurrencia: bloquea al tutor (sus cambios de agenda van de a uno) y al recurso
 * (dos tutores no pueden tomar el mismo salón a la vez).
 */
export async function agregarHorario(idTutoria, idTutor, datos) {
  await obtenerPropia(idTutoria, idTutor);

  requerirCampos(datos, ["dia", "hora_inicio", "hora_fin", "id_recurso"]);
  const { dia, hora_inicio, hora_fin } = datos;
  const idRecurso = aEntero(datos.id_recurso, "id_recurso");
  validarOpcion(dia, DIAS, "dia");
  if (!esHoraValida(hora_inicio) || !esHoraValida(hora_fin)) {
    throw new AppError(400, "Las horas deben tener formato HH:MM (24 horas)");
  }
  if (hora_fin <= hora_inicio) {
    throw new AppError(400, "hora_fin debe ser posterior a hora_inicio");
  }

  const inicio = horaADate(hora_inicio);
  const fin = horaADate(hora_fin);
  // Se cruzan si uno empieza antes de que el otro termine y viceversa
  const cruzaCon = { dia, id_estado: ESTADO.ACTIVO, hora_inicio: { lt: fin }, hora_fin: { gt: inicio } };
  const conTitulo = { include: { tutoria: { select: { titulo: true } } } };
  const detalleCruce = (h) => ({
    tutoria: h.tutoria.titulo,
    dia: h.dia,
    hora_inicio: dateAHora(h.hora_inicio),
    hora_fin: dateAHora(h.hora_fin),
  });

  const horario = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tbl_usuario WHERE id = ${idTutor} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM tbl_tutoria WHERE id = ${idTutoria} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM tbl_recurso WHERE id = ${idRecurso} FOR UPDATE`;

    const tutoria = await tx.tutoria.findUnique({ where: { id: idTutoria } });
    if (tutoria.id_estado !== ESTADO.ACTIVO) {
      throw new AppError(409, "Active la tutoría antes de agregarle horarios");
    }

    const recurso = await tx.recurso.findUnique({ where: { id: idRecurso } });
    if (!recurso) throw new AppError(404, "Recurso no encontrado");
    if (recurso.id_estado !== ESTADO.ACTIVO) {
      throw new AppError(409, "El recurso no está disponible");
    }
    const tipoRequerido = RECURSO_POR_MODALIDAD[tutoria.modalidad];
    if (tipoRequerido && recurso.tipo !== tipoRequerido) {
      throw new AppError(409, `Una tutoría ${tutoria.modalidad} requiere un recurso ${tipoRequerido}`);
    }
    if (recurso.capacidad < tutoria.cupo) {
      throw new AppError(
        409,
        `El recurso tiene capacidad para ${recurso.capacidad} y la tutoría tiene cupo ${tutoria.cupo}`
      );
    }

    // Secuenciales: Prisma no admite consultas en paralelo dentro de una transacción
    const propio = await tx.horario.findFirst({
      where: { ...cruzaCon, tutoria: { id_tutor: idTutor } },
      ...conTitulo,
    });
    if (propio) {
      throw new AppError(409, "El horario se cruza con otro horario activo suyo", detalleCruce(propio));
    }
    const enRecurso = await tx.horario.findFirst({
      where: { ...cruzaCon, id_recurso: idRecurso },
      ...conTitulo,
    });
    if (enRecurso) {
      throw new AppError(409, `${recurso.nombre} ya está ocupado en esa franja`, detalleCruce(enRecurso));
    }
    const comoEstudiante = await tx.reserva.findFirst({
      where: {
        id_usuario_estudiante: idTutor,
        id_estado: ESTADO.ACTIVO,
        fecha_sesion: { gte: textoAFecha(hoy()) },
        horario: cruzaCon,
      },
      include: { horario: conTitulo },
    });
    if (comoEstudiante) {
      throw new AppError(409, "En esa franja tiene una tutoría reservada como estudiante", {
        ...detalleCruce(comoEstudiante.horario),
        fecha_sesion: fechaATexto(comoEstudiante.fecha_sesion),
      });
    }

    return tx.horario.create({
      data: {
        id_tutoria: idTutoria,
        id_recurso: idRecurso,
        dia,
        hora_inicio: inicio,
        hora_fin: fin,
        id_estado: ESTADO.ACTIVO,
      },
      include: { recurso: recursoResumen },
    });
  });
  return formatearHorario(horario);
}

/**
 * PATCH /api/tutorias/:id/horarios/:idHorario/desactivar — tutor dueño.
 * Pone el horario en INACTIVO (no se borra: puede tener reservas) y cancela las
 * reservas de sesiones que aún no empiezan. La respuesta incluye reservas_canceladas.
 * 404 si el horario no pertenece a esa tutoría.
 * Concurrencia: bloquea el horario; una reserva simultánea espera y lo ve INACTIVO.
 */
export async function desactivarHorario(idTutoria, idHorario, idTutor) {
  await obtenerPropia(idTutoria, idTutor);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tbl_horario WHERE id = ${idHorario} FOR UPDATE`;
    const horario = await tx.horario.findFirst({
      where: { id: idHorario, id_tutoria: idTutoria },
    });
    if (!horario) throw new AppError(404, "Horario no encontrado en esta tutoría");

    const reservasCanceladas = await cancelarSesionesPendientes(tx, [horario]);
    const actualizado = await tx.horario.update({
      where: { id: idHorario },
      data: { id_estado: ESTADO.INACTIVO },
      include: { recurso: recursoResumen },
    });
    return { ...formatearHorario(actualizado), reservas_canceladas: reservasCanceladas };
  });
}
