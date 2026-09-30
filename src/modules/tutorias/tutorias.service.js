import { prisma } from "../../lib/prisma.js";
import { noImplementado } from "../../utils/AppError.js";

// Horas: recibir/devolver "HH:MM" con utils/fechas.js (horaADate / dateAHora).

/**
 * GET /api/tutorias?id_materia=&nivel=&modalidad= — público (divulgación).
 * - Solo tutorías ACTIVAS con sus horarios ACTIVOS.
 * - Incluir: materia (nombre, codigo), tutor (id, nombre, apellido) — nunca correo/documento.
 * - Filtros opcionales por id_materia, nivel, modalidad.
 */
export async function listar(filtros = {}) {
  noImplementado();
}

/**
 * GET /api/tutorias/mias — tutor.
 * Tutorías del tutor autenticado (activas e inactivas) con todos sus horarios.
 */
export async function listarDelTutor(idTutor) {
  noImplementado();
}

/**
 * GET /api/tutorias/:id — público.
 * Detalle con materia, tutor (datos públicos) y horarios activos. 404 si no existe.
 */
export async function obtener(id) {
  noImplementado();
}

/**
 * POST /api/tutorias — tutor.
 * Body: { id_materia, titulo, descripcion?, nivel, modalidad, cupo }
 * - El tutor debe tener la materia asociada en tbl_materia_x_tutor (si no → 403).
 * - nivel ∈ NIVELES, modalidad ∈ MODALIDADES, cupo entero positivo.
 * - Se crea con id_estado = ESTADO.ACTIVO.
 */
export async function crear(idTutor, datos) {
  noImplementado();
}

/**
 * PUT /api/tutorias/:id — tutor dueño.
 * Body: { titulo?, descripcion?, nivel?, modalidad?, cupo?, id_estado? }
 * - 404 si no existe; 403 si id_tutor ≠ usuario autenticado.
 * - id_estado solo ACTIVO o INACTIVO (inactivar = dejar de divulgarla).
 * - No se cambia id_materia.
 */
export async function actualizar(id, idTutor, datos) {
  noImplementado();
}

/**
 * POST /api/tutorias/:id/horarios — tutor dueño.
 * Body: { dia, hora_inicio: "HH:MM", hora_fin: "HH:MM" }
 * - dia ∈ DIAS; horas válidas; hora_fin > hora_inicio.
 * - No debe cruzarse con otro horario ACTIVO de CUALQUIER tutoría del mismo tutor
 *   en el mismo día (409).
 * - Se crea con id_estado = ESTADO.ACTIVO.
 */
export async function agregarHorario(idTutoria, idTutor, datos) {
  noImplementado();
}

/**
 * PATCH /api/tutorias/:id/horarios/:idHorario/desactivar — tutor dueño.
 * - Pone el horario en INACTIVO (no se borra: puede tener reservas).
 * - 404 si el horario no pertenece a esa tutoría.
 */
export async function desactivarHorario(idTutoria, idHorario, idTutor) {
  noImplementado();
}
