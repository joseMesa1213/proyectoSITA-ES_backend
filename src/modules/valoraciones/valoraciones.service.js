import { prisma } from "../../lib/prisma.js";
import { noImplementado } from "../../utils/AppError.js";

/**
 * POST /api/valoraciones — quien hizo la reserva.
 * Body: { id_reserva, calificacion: 1..5, comentario? }
 * - 404 si la reserva no existe; 403 si reserva.id_usuario_estudiante ≠ usuario.
 * - La reserva debe estar COMPLETADA (409).
 * - Una sola valoración por reserva (id_reserva UNIQUE → 409 automático).
 * - id_usuario_evaluador = usuario autenticado.
 */
export async function crear(idUsuario, datos) {
  noImplementado();
}

/**
 * GET /api/valoraciones/tutoria/:idTutoria — público.
 * Devuelve { promedio, total, valoraciones: [{ calificacion, comentario, fecha, evaluador: { nombre } }] }
 * Valoraciones de reservas cuyos horarios pertenecen a la tutoría. promedio con aggregate _avg.
 */
export async function listarPorTutoria(idTutoria) {
  noImplementado();
}
