import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos } from "../../utils/validar.js";

const porNombre = { orderBy: { nombre: "asc" } };

// Toma solo los campos enviados y los normaliza. Se usa en crear y actualizar.
function datosMateria({ nombre, codigo, creditos }) {
  const data = {};
  if (nombre !== undefined) data.nombre = String(nombre).trim();
  if (codigo !== undefined) data.codigo = String(codigo).trim().toUpperCase();
  if (creditos !== undefined) data.creditos = aEntero(creditos, "creditos");
  if (data.nombre === "" || data.codigo === "") {
    throw new AppError(400, "nombre y codigo no pueden estar vacíos");
  }
  return data;
}

/**
 * GET /api/materias?q=texto — público.
 * Lista materias ordenadas por nombre. Si viene q, filtra por nombre o código.
 */
export async function listar({ q } = {}) {
  const texto = q?.trim();
  return prisma.materia.findMany({
    ...porNombre,
    where: texto
      ? {
          OR: [
            { nombre: { contains: texto, mode: "insensitive" } },
            { codigo: { contains: texto, mode: "insensitive" } },
          ],
        }
      : undefined,
  });
}

/**
 * GET /api/materias/mias — tutor.
 * Materias asociadas al tutor.
 */
export async function listarDelTutor(idTutor) {
  return prisma.materia.findMany({
    ...porNombre,
    where: { tutores: { some: { id_tutor: idTutor } } },
  });
}

/**
 * POST /api/materias — admin. Body: { nombre, codigo, creditos }
 * codigo duplicado → 409 (P2002 en el manejador de errores).
 */
export async function crear(datos) {
  requerirCampos(datos, ["nombre", "codigo", "creditos"]);
  return prisma.materia.create({ data: datosMateria(datos) });
}

/**
 * PUT /api/materias/:id — admin. Body: { nombre?, codigo?, creditos? }
 * Solo actualiza los campos enviados. 404 si no existe (P2025).
 */
export async function actualizar(id, datos = {}) {
  const data = datosMateria(datos);
  if (Object.keys(data).length === 0) {
    throw new AppError(400, "Envíe al menos uno de: nombre, codigo, creditos");
  }
  return prisma.materia.update({ where: { id }, data });
}

/**
 * POST /api/materias/:id/tutor — tutor.
 * El tutor autenticado declara que domina la materia.
 * 404 si la materia no existe. 409 si ya estaba asociada.
 */
export async function asociarTutor(idMateria, idTutor) {
  const materia = await prisma.materia.findUnique({ where: { id: idMateria } });
  if (!materia) throw new AppError(404, "Materia no encontrada");

  const yaAsociada = await prisma.materiaTutor.findUnique({
    where: { id_tutor_id_materia: { id_tutor: idTutor, id_materia: idMateria } },
  });
  if (yaAsociada) throw new AppError(409, "Ya tiene asociada esta materia");

  await prisma.materiaTutor.create({ data: { id_tutor: idTutor, id_materia: idMateria } });
  return materia;
}

/**
 * DELETE /api/materias/:id/tutor — tutor.
 * Quita la asociación. 404 si no existía.
 * (Las tutorías ya creadas de esa materia no se tocan.)
 */
export async function desasociarTutor(idMateria, idTutor) {
  const { count } = await prisma.materiaTutor.deleteMany({
    where: { id_tutor: idTutor, id_materia: idMateria },
  });
  if (count === 0) throw new AppError(404, "No tiene asociada esta materia");
}
