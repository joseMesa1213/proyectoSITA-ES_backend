import { prisma } from "../../lib/prisma.js";
import { noImplementado } from "../../utils/AppError.js";

/**
 * GET /api/materias?q=texto — público.
 * Lista materias ordenadas por nombre. Si viene q, filtra por nombre o código
 * (contains, mode: "insensitive").
 */
export async function listar({ q } = {}) {
  noImplementado();
}

/**
 * GET /api/materias/mias — tutor.
 * Materias asociadas al tutor (tbl_materia_x_tutor → materia).
 */
export async function listarDelTutor(idTutor) {
  noImplementado();
}

/**
 * POST /api/materias — admin. Body: { nombre, codigo, creditos }
 * - Todos obligatorios; creditos entero positivo.
 * - codigo es UNIQUE: el P2002 lo convierte en 409 el manejador de errores.
 */
export async function crear(datos) {
  noImplementado();
}

/**
 * PUT /api/materias/:id — admin. Body: { nombre?, codigo?, creditos? }
 * - Solo actualiza los campos enviados. 404 si no existe (P2025).
 */
export async function actualizar(id, datos) {
  noImplementado();
}

/**
 * POST /api/materias/:id/tutor — tutor.
 * El tutor autenticado declara que domina la materia.
 * - 404 si la materia no existe. 409 si ya estaba asociada (unique_tutor_materia).
 */
export async function asociarTutor(idMateria, idTutor) {
  noImplementado();
}

/**
 * DELETE /api/materias/:id/tutor — tutor.
 * Quita la asociación. 404 si no existía.
 * (Las tutorías ya creadas de esa materia no se tocan.)
 */
export async function desasociarTutor(idMateria, idTutor) {
  noImplementado();
}
