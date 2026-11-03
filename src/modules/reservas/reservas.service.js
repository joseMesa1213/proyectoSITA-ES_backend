import { prisma } from "../../lib/prisma.js";
import { DIAS, ESTADO } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos } from "../../utils/validar.js";
import { ahora, dateAHora, esFechaValida, fechaATexto, hoy, textoAFecha } from "../../utils/fechas.js";

// Estados de una reserva en el MVP:  ACTIVO → COMPLETADO  |  ACTIVO → CANCELADO
// Orden de bloqueo de filas: usuario → tutoría → horario → recurso (ver tutorias.service)

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

// Solo cambia el estado si la reserva sigue ACTIVA (UPDATE ... WHERE id_estado = ACTIVO):
// si cancelar y completar llegan a la vez, gana una y la otra recibe 409.
async function cambiarEstado(id, id_estado, mensajeSiNoActiva) {
  const { count } = await prisma.reserva.updateMany({
    where: { id, id_estado: ESTADO.ACTIVO },
    data: { id_estado },
  });
  if (count === 0) throw new AppError(409, mensajeSiNoActiva);
  return formatear(await prisma.reserva.findUnique({ where: { id }, include: incluirDetalle }));
}

/**
 * POST /api/reservas — estudiante o tutor.
 * Body: { id_horario, fecha_sesion: "YYYY-MM-DD" }
 * El recurso (salón o enlace) es el del horario; se copia en la reserva.
 * Validaciones:
 * - Horario ACTIVO y su tutoría ACTIVA (no existe → 404, inactivo → 409).
 * - No reservar una tutoría propia → 409.
 * - fecha_sesion >= hoy y cae en el día de la semana del horario → 400.
 *   Si es hoy, la sesión no debe haber empezado → 409.
 * - Sin duplicado: otra reserva ACTIVA del usuario en ese horario y fecha → 409.
 * - Sin cruce: otra reserva ACTIVA del usuario ese día que se solape en horas → 409.
 * - Si quien reserva es tutor, no puede estar dictando un horario suyo a esa hora → 409.
 * - Cupo: reservas ACTIVAS de (horario, fecha) < tutoria.cupo → 409. La capacidad del
 *   recurso ya se garantiza al crear el horario (capacidad >= cupo).
 * Concurrencia: dentro de la transacción se bloquean (SELECT ... FOR UPDATE)
 * - la fila del usuario: sus reservas simultáneas van de a una (no se cruzan entre sí);
 * - la fila del horario: las reservas simultáneas del mismo horario van de a una, así que
 *   el conteo del cupo no puede quedar desactualizado.
 */
export async function crear(idUsuario, datos) {
  requerirCampos(datos, ["id_horario", "fecha_sesion"]);
  const idHorario = aEntero(datos.id_horario, "id_horario");
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
      // Bloqueos: otra reserva del mismo usuario o del mismo horario espera aquí
      await tx.$queryRaw`SELECT id FROM tbl_usuario WHERE id = ${idUsuario} FOR UPDATE`;
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
      if (fecha_sesion === hoy() && dateAHora(horario.hora_inicio) <= ahora()) {
        throw new AppError(409, "Esta sesión ya empezó; elija una fecha posterior");
      }

      // Horarios ACTIVOS que se solapan en horas con el que se reserva
      const cruzaCon = {
        id_estado: ESTADO.ACTIVO,
        hora_inicio: { lt: horario.hora_fin },
        hora_fin: { gt: horario.hora_inicio },
      };
      const conTitulo = { include: { tutoria: { select: { titulo: true } } } };
      const detalleCruce = (h) => ({
        tutoria: h.tutoria.titulo,
        hora_inicio: dateAHora(h.hora_inicio),
        hora_fin: dateAHora(h.hora_fin),
      });

      // Secuenciales: Prisma no admite consultas en paralelo dentro de una transacción
      const otra = await tx.reserva.findFirst({
        where: {
          id_usuario_estudiante: idUsuario,
          id_estado: ESTADO.ACTIVO,
          fecha_sesion: fechaSesion,
          horario: cruzaCon,
        },
        include: { horario: conTitulo },
      });
      if (otra?.id_horario === idHorario) {
        throw new AppError(409, "Ya tiene una reserva activa para esta sesión");
      }
      if (otra) {
        throw new AppError(409, "Ya tiene otra sesión reservada en esa franja", detalleCruce(otra.horario));
      }
      const dicta = await tx.horario.findFirst({
        where: { ...cruzaCon, dia: horario.dia, tutoria: { id_tutor: idUsuario } },
        ...conTitulo,
      });
      if (dicta) {
        throw new AppError(409, "En esa franja usted dicta una de sus tutorías", detalleCruce(dicta));
      }

      const ocupados = await tx.reserva.count({
        where: { id_horario: idHorario, fecha_sesion: fechaSesion, id_estado: ESTADO.ACTIVO },
      });
      if (ocupados >= tutoria.cupo) throw new AppError(409, "No quedan cupos para esta sesión");

      return tx.reserva.create({
        data: {
          id_usuario_estudiante: idUsuario,
          id_horario: idHorario,
          id_recurso: horario.id_recurso,
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
 * Solo reservas ACTIVAS (409, también si otra petición la cambió primero). Pasa a CANCELADO.
 */
export async function cancelar(id, idUsuario) {
  const reserva = await obtenerReserva(id);
  const esQuienReservo = reserva.id_usuario_estudiante === idUsuario;
  const esElTutor = reserva.horario.tutoria.id_tutor === idUsuario;
  if (!esQuienReservo && !esElTutor) {
    throw new AppError(403, "Solo quien reservó o el tutor pueden cancelar esta reserva");
  }
  return cambiarEstado(id, ESTADO.CANCELADO, "Solo se pueden cancelar reservas activas");
}

/**
 * PATCH /api/reservas/:id/completar — tutor de la tutoría.
 * La sesión debe haber terminado: fecha_sesion < hoy, o hoy con hora_fin ya pasada (409).
 * Solo reservas ACTIVAS (409). Pasa a COMPLETADO (habilita la valoración).
 */
export async function completar(id, idTutor) {
  const reserva = await obtenerReserva(id);
  if (reserva.horario.tutoria.id_tutor !== idTutor) {
    throw new AppError(403, "Solo el tutor de la tutoría puede completar la reserva");
  }
  const fecha = fechaATexto(reserva.fecha_sesion);
  const fechaHoy = hoy();
  if (fecha > fechaHoy || (fecha === fechaHoy && dateAHora(reserva.horario.hora_fin) > ahora())) {
    throw new AppError(409, "No se puede completar una sesión que aún no ha terminado");
  }
  return cambiarEstado(id, ESTADO.COMPLETADO, "Solo se pueden completar reservas activas");
}
