import { prisma } from "../../lib/prisma.js";
import { ESTADO } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos, validarOpcion } from "../../utils/validar.js";

const CALIFICACIONES = [1, 2, 3, 4, 5];

/**
 * POST /api/valoraciones — quien hizo la reserva.
 * Body: { id_reserva, calificacion: 1..5, comentario? }
 * - 404 si la reserva no existe; 403 si no es de quien valora.
 * - La reserva debe estar COMPLETADA (409). Una sola valoración por reserva (409).
 */
export async function crear(idUsuario, datos) {
  requerirCampos(datos, ["id_reserva", "calificacion"]);
  const idReserva = aEntero(datos.id_reserva, "id_reserva");
  const calificacion = Number(datos.calificacion);
  validarOpcion(calificacion, CALIFICACIONES, "calificacion");
  const comentario = datos.comentario ? String(datos.comentario).trim() || null : null;

  const reserva = await prisma.reserva.findUnique({
    where: { id: idReserva },
    include: { valoracion: { select: { id: true } } },
  });
  if (!reserva) throw new AppError(404, "Reserva no encontrada");
  if (reserva.id_usuario_estudiante !== idUsuario) {
    throw new AppError(403, "Solo quien hizo la reserva puede valorarla");
  }
  if (reserva.id_estado !== ESTADO.COMPLETADO) {
    throw new AppError(409, "Solo se pueden valorar sesiones completadas");
  }
  if (reserva.valoracion) throw new AppError(409, "Esta reserva ya fue valorada");

  return prisma.valoracion.create({
    data: { id_reserva: idReserva, calificacion, comentario, id_usuario_evaluador: idUsuario },
  });
}

/**
 * GET /api/valoraciones/tutoria/:idTutoria — público.
 * Devuelve { promedio, total, valoraciones: [{ calificacion, comentario, fecha, evaluador: { nombre } }] }
 * promedio redondeado a 1 decimal; null si no hay valoraciones.
 */
export async function listarPorTutoria(idTutoria) {
  const tutoria = await prisma.tutoria.findUnique({ where: { id: idTutoria }, select: { id: true } });
  if (!tutoria) throw new AppError(404, "Tutoría no encontrada");

  const where = { reserva: { horario: { id_tutoria: idTutoria } } };
  const [resumen, valoraciones] = await Promise.all([
    prisma.valoracion.aggregate({ where, _avg: { calificacion: true }, _count: true }),
    prisma.valoracion.findMany({
      where,
      select: {
        id: true,
        calificacion: true,
        comentario: true,
        fecha: true,
        evaluador: { select: { nombre: true } },
      },
      orderBy: { fecha: "desc" },
    }),
  ]);

  const promedio = resumen._avg.calificacion;
  return {
    promedio: promedio === null ? null : Math.round(promedio * 10) / 10,
    total: resumen._count,
    valoraciones,
  };
}
