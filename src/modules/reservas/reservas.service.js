import { prisma } from "../../lib/prisma.js";
import { noImplementado } from "../../utils/AppError.js";

// Estados de una reserva en el MVP:  ACTIVO → COMPLETADO  |  ACTIVO → CANCELADO
// Fechas: recibir/devolver "YYYY-MM-DD" con utils/fechas.js (textoAFecha / fechaATexto).

/**
 * POST /api/reservas — estudiante o tutor.
 * Body: { id_horario, id_recurso, fecha_sesion: "YYYY-MM-DD" }
 * Validaciones:
 * - Horario ACTIVO y su tutoría ACTIVA (si no → 404/409).
 * - No reservar una tutoría propia (tutoria.id_tutor ≠ usuario) → 409.
 * - fecha_sesion >= hoy y DIAS[fecha.getUTCDay()] === horario.dia → 400.
 * - Recurso ACTIVO. Si modalidad es Virtual el recurso debe ser tipo Virtual,
 *   si es Presencial debe ser Físico (Híbrida acepta ambos).
 * - Sin duplicado: el usuario no puede tener otra reserva ACTIVA en ese horario y fecha → 409.
 * - Cupo: reservas ACTIVAS de (id_horario, fecha_sesion) < tutoria.cupo → 409.
 * - Capacidad: reservas ACTIVAS de (id_recurso, fecha_sesion, mismo horario) < recurso.capacidad → 409.
 * Concurrencia: contar y crear dentro de prisma.$transaction(..., { isolationLevel: "Serializable" })
 * para que dos usuarios no tomen el último cupo a la vez.
 * Se crea con id_estado = ESTADO.ACTIVO.
 */
export async function crear(idUsuario, datos) {
  noImplementado();
}

/**
 * GET /api/reservas/mias — estudiante o tutor.
 * Reservas hechas por el usuario, más recientes primero, con horario → tutoría → materia/tutor,
 * recurso, estado y si ya tiene valoración.
 */
export async function listarMias(idUsuario) {
  noImplementado();
}

/**
 * GET /api/reservas/tutor?fecha_sesion=YYYY-MM-DD — tutor.
 * Reservas de los horarios de las tutorías del tutor, con datos básicos del estudiante
 * (nombre, apellido, correo). Filtro opcional por fecha_sesion.
 */
export async function listarDelTutor(idTutor, filtros = {}) {
  noImplementado();
}

/**
 * PATCH /api/reservas/:id/cancelar — quien reservó o el tutor de la tutoría.
 * - 403 si no es ninguno de los dos. Solo se cancela si está ACTIVA (si no → 409).
 * - Pasa a ESTADO.CANCELADO.
 */
export async function cancelar(id, idUsuario) {
  noImplementado();
}

/**
 * PATCH /api/reservas/:id/completar — tutor de la tutoría.
 * - 403 si no es el tutor. Debe estar ACTIVA y fecha_sesion <= hoy (409).
 * - Pasa a ESTADO.COMPLETADO (habilita la valoración).
 */
export async function completar(id, idTutor) {
  noImplementado();
}
