import { prisma } from "../../lib/prisma.js";
import { noImplementado } from "../../utils/AppError.js";

/**
 * GET /api/recursos?tipo=Físico — autenticado.
 * - Admin: ve todos (activos e inactivos).
 * - Resto: solo id_estado = ESTADO.ACTIVO (los elige al reservar).
 * - Filtro opcional por tipo (TIPOS_RECURSO).
 */
export async function listar(usuario, { tipo } = {}) {
  noImplementado();
}

/**
 * POST /api/recursos — admin. Body: { nombre, tipo, ubicacion, capacidad }
 * - tipo ∈ TIPOS_RECURSO; capacidad entero positivo.
 * - Se crea con id_estado = ESTADO.ACTIVO.
 */
export async function crear(datos) {
  noImplementado();
}

/**
 * PUT /api/recursos/:id — admin. Body: { nombre?, tipo?, ubicacion?, capacidad?, id_estado? }
 * - id_estado solo puede ser ACTIVO o INACTIVO (así se "elimina" un recurso).
 */
export async function actualizar(id, datos) {
  noImplementado();
}
