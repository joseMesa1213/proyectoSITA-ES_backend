import { prisma } from "../../lib/prisma.js";
import { DIAS, ESTADO } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos } from "../../utils/validar.js";
import { dateAHora, esFechaValida, fechaATexto, hoy, textoAFecha } from "../../utils/fechas.js";

// Estados de una reserva en el MVP:  ACTIVO → COMPLETADO  |  ACTIVO → CANCELADO

// Tipo de recurso que acepta cada modalidad (Híbrida o sin modalidad: cualquiera)
const RECURSO_POR_MODALIDAD = { Presencial: "Físico", Virtual: "Virtual" };

const incluirDetalle = {
  estado: true,
  recurso: { select: { id: true, nombre: true, tipo: true, ubicacion: true } },
  valoracion: { select: { id: true, calificacion: true } },
  horario: {
    include: {
      tutoria: {
        select: {
          id: true,
          titulo: true,
          nivel: true,
          modalidad: true,
          id_tutor: true,
          materia: { select: { id: true, nombre: true, codigo: true } },
          tutor: { select: { id: true, nombre: true, apellido: true } },
        },
      },
    },
  },
};

// Respuesta plana: la tutoría sale al primer nivel y fechas/horas como texto
const formatear = ({ horario, estado, valoracion, fecha_sesion, ...reserva }) => ({
  ...reserva,
  fecha_sesion: fechaATexto(fecha_sesion),
  estado: estado.nombre,
  horario: {
    id: horario.id,
    dia: horario.dia,
    hora_inicio: dateAHora(horario.hora_inicio),
    hora_fin: dateAHora(horario.hora_fin),
  },
  tutoria: horario.tutoria,
  valoracion: valoracion ?? null,
});

// Busca la reserva con su tutoría; 404 si no existe
async function obtenerReserva(id) {
  const reserva = await prisma.reserva.findUnique({
    where: { id },
    include: { horario: { include: { tutoria: { select: { id_tutor: true } } } } },
  });
  if (!reserva) throw new AppError(404, "Reserva no encontrada");
  return reserva;
}

const cambiarEstado = async (id, id_estado) =>
  formatear(
    await prisma.reserva.update({ where: { id }, data: { id_estado }, include: incluirDetalle })
  );

/**
 * POST /api/reservas — estudiante o tutor.
 * Body: { id_horario, id_recurso, fecha_sesion: "YYYY-MM-DD" }
 * Validaciones:
 * - Horario ACTIVO y su tutoría ACTIVA (no existe → 404, inactivo → 409).
 * - No reservar una tutoría propia → 409.
 * - fecha_sesion >= hoy y cae en el día de la semana del horario → 400.
 * - Recurso ACTIVO y compatible con la modalidad (Virtual→Virtual, Presencial→Físico).
 * - Sin duplicado: otra reserva ACTIVA del usuario en ese horario y fecha → 409.
 * - Cupo: reservas ACTIVAS de (horario, fecha) < tutoria.cupo → 409.
 * - Capacidad: reservas ACTIVAS de (recurso, horario, fecha) < recurso.capacidad → 409.
 * Concurrencia: la fila del horario se bloquea con SELECT ... FOR UPDATE dentro de la
 * transacción; las reservas simultáneas del mismo horario se atienden de a una, así que
 * los conteos de cupo y capacidad no pueden quedar desactualizados.
 */
export async function crear(idUsuario, datos) {
  requerirCampos(datos, ["id_horario", "id_recurso", "fecha_sesion"]);
  const idHorario = aEntero(datos.id_horario, "id_horario");
  const idRecurso = aEntero(datos.id_recurso, "id_recurso");
  const { fecha_sesion } = datos;
  if (!esFechaValida(fecha_sesion)) {
    throw new AppError(400, "fecha_sesion debe ser una fecha válida con formato YYYY-MM-DD");
  }
  if (fecha_sesion < hoy()) {
    throw new AppError(400, "No se puede reservar una fecha pasada");
  }
  const fechaSesion = textoAFecha(fecha_sesion);

  const reserva = await prisma.$transaction(
    async (tx) => {
      // Bloqueo: otra reserva de este horario espera aquí hasta que esta transacción termine
      const bloqueado = await tx.$queryRaw`SELECT id FROM tbl_horario WHERE id = ${idHorario} FOR UPDATE`;
      if (bloqueado.length === 0) throw new AppError(404, "Horario no encontrado");

      const horario = await tx.horario.findUnique({
        where: { id: idHorario },
        include: { tutoria: true },
      });
      const { tutoria } = horario;
      if (horario.id_estado !== ESTADO.ACTIVO || tutoria.id_estado !== ESTADO.ACTIVO) {
        throw new AppError(409, "Este horario no está disponible para reservas");
      }
      if (tutoria.id_tutor === idUsuario) {
        throw new AppError(409, "No puede reservar su propia tutoría");
      }
      const diaFecha = DIAS[fechaSesion.getUTCDay()];
      if (diaFecha !== horario.dia) {
        throw new AppError(400, `La fecha ${fecha_sesion} es ${diaFecha}, pero el horario es los ${horario.dia}`);
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

      const activasSesion = { id_horario: idHorario, fecha_sesion: fechaSesion, id_estado: ESTADO.ACTIVO };
      // Secuenciales: Prisma no admite consultas en paralelo dentro de una transacción
      const propias = await tx.reserva.count({
        where: { ...activasSesion, id_usuario_estudiante: idUsuario },
      });
      if (propias > 0) throw new AppError(409, "Ya tiene una reserva activa para esta sesión");
      const ocupados = await tx.reserva.count({ where: activasSesion });
      if (ocupados >= tutoria.cupo) throw new AppError(409, "No quedan cupos para esta sesión");
      const enRecurso = await tx.reserva.count({ where: { ...activasSesion, id_recurso: idRecurso } });
      if (enRecurso >= recurso.capacidad) {
        throw new AppError(409, "El recurso alcanzó su capacidad para esta sesión");
      }

      return tx.reserva.create({
        data: {
          id_usuario_estudiante: idUsuario,
          id_horario: idHorario,
          id_recurso: idRecurso,
          fecha_sesion: fechaSesion,
          id_estado: ESTADO.ACTIVO,
        },
        include: incluirDetalle,
      });
    },
    { timeout: 10000 }
  );

  return formatear(reserva);
}

/**
 * GET /api/reservas/mias — estudiante o tutor.
 * Reservas hechas por el usuario, más recientes primero.
 */
export async function listarMias(idUsuario) {
  const reservas = await prisma.reserva.findMany({
    where: { id_usuario_estudiante: idUsuario },
    include: incluirDetalle,
    orderBy: [{ fecha_sesion: "desc" }, { fecha: "desc" }],
  });
  return reservas.map(formatear);
}

/**
 * GET /api/reservas/tutor?fecha_sesion=YYYY-MM-DD — tutor.
 * Reservas en las tutorías del tutor, con datos básicos del estudiante.
 */
export async function listarDelTutor(idTutor, { fecha_sesion } = {}) {
  const where = { horario: { tutoria: { id_tutor: idTutor } } };
  if (fecha_sesion) {
    if (!esFechaValida(fecha_sesion)) {
      throw new AppError(400, "fecha_sesion debe tener formato YYYY-MM-DD");
    }
    where.fecha_sesion = textoAFecha(fecha_sesion);
  }

  const reservas = await prisma.reserva.findMany({
    where,
    include: {
      ...incluirDetalle,
      estudiante: { select: { id: true, nombre: true, apellido: true, correo: true } },
    },
    orderBy: [{ fecha_sesion: "desc" }, { fecha: "desc" }],
  });
  return reservas.map(formatear);
}

/**
 * PATCH /api/reservas/:id/cancelar — quien reservó o el tutor de la tutoría.
 * Solo reservas ACTIVAS (409). Pasa a CANCELADO.
 */
export async function cancelar(id, idUsuario) {
  const reserva = await obtenerReserva(id);
  const esQuienReservo = reserva.id_usuario_estudiante === idUsuario;
  const esElTutor = reserva.horario.tutoria.id_tutor === idUsuario;
  if (!esQuienReservo && !esElTutor) {
    throw new AppError(403, "Solo quien reservó o el tutor pueden cancelar esta reserva");
  }
  if (reserva.id_estado !== ESTADO.ACTIVO) {
    throw new AppError(409, "Solo se pueden cancelar reservas activas");
  }
  return cambiarEstado(id, ESTADO.CANCELADO);
}

/**
 * PATCH /api/reservas/:id/completar — tutor de la tutoría.
 * Debe estar ACTIVA y fecha_sesion <= hoy (409). Pasa a COMPLETADO (habilita la valoración).
 */
export async function completar(id, idTutor) {
  const reserva = await obtenerReserva(id);
  if (reserva.horario.tutoria.id_tutor !== idTutor) {
    throw new AppError(403, "Solo el tutor de la tutoría puede completar la reserva");
  }
  if (reserva.id_estado !== ESTADO.ACTIVO) {
    throw new AppError(409, "Solo se pueden completar reservas activas");
  }
  if (fechaATexto(reserva.fecha_sesion) > hoy()) {
    throw new AppError(409, "No se puede completar una sesión que aún no ha ocurrido");
  }
  return cambiarEstado(id, ESTADO.COMPLETADO);
}
