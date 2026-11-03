import { prisma } from "../../lib/prisma.js";
import { ESTADO, ROL, TIPOS_RECURSO } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos, validarOpcion } from "../../utils/validar.js";

// Toma solo los campos enviados y los valida. Se usa en crear y actualizar.
function datosRecurso({ nombre, tipo, ubicacion, capacidad, id_estado }) {
  const data = {};
  if (nombre !== undefined) data.nombre = String(nombre).trim();
  if (ubicacion !== undefined) data.ubicacion = String(ubicacion).trim();
  if (data.nombre === "" || data.ubicacion === "") {
    throw new AppError(400, "nombre y ubicacion no pueden estar vacíos");
  }
  if (tipo !== undefined) {
    validarOpcion(tipo, TIPOS_RECURSO, "tipo");
    data.tipo = tipo;
  }
  if (capacidad !== undefined) data.capacidad = aEntero(capacidad, "capacidad");
  if (id_estado !== undefined) {
    data.id_estado = Number(id_estado);
    validarOpcion(data.id_estado, [ESTADO.ACTIVO, ESTADO.INACTIVO], "id_estado");
  }
  return data;
}

/**
 * GET /api/recursos?tipo=Físico — autenticado.
 * Admin ve todos; el resto solo los ACTIVOS (los elige al reservar).
 */
export async function listar(usuario, { tipo } = {}) {
  const where = {};
  if (usuario.rol !== ROL.ADMINISTRADOR) where.id_estado = ESTADO.ACTIVO;
  if (tipo) {
    validarOpcion(tipo, TIPOS_RECURSO, "tipo");
    where.tipo = tipo;
  }
  return prisma.recurso.findMany({ where, orderBy: { nombre: "asc" } });
}

/**
 * POST /api/recursos — admin. Body: { nombre, tipo, ubicacion, capacidad }
 * Se crea ACTIVO.
 */
export async function crear(datos) {
  requerirCampos(datos, ["nombre", "tipo", "ubicacion", "capacidad"]);
  const { id_estado, ...resto } = datos;
  return prisma.recurso.create({
    data: { ...datosRecurso(resto), id_estado: ESTADO.ACTIVO },
  });
}

/**
 * PUT /api/recursos/:id — admin.
 * Body: { nombre?, tipo?, ubicacion?, capacidad?, id_estado? }
 * id_estado solo ACTIVO o INACTIVO (así se "elimina" un recurso). 404 si no existe.
 * Si está asignado a horarios ACTIVOS (409, con la lista de tutorías):
 * - no se puede inactivar ni cambiar de tipo;
 * - la capacidad no puede quedar por debajo del cupo de esas tutorías.
 * Concurrencia: bloquea el recurso; nadie puede asignarlo a un horario mientras se valida.
 */
export async function actualizar(id, datos = {}) {
  const data = datosRecurso(datos);
  if (Object.keys(data).length === 0) {
    throw new AppError(
      400,
      "Envíe al menos uno de: nombre, tipo, ubicacion, capacidad, id_estado"
    );
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tbl_recurso WHERE id = ${id} FOR UPDATE`;
    const recurso = await tx.recurso.findUnique({ where: { id } });
    if (!recurso) throw new AppError(404, "Recurso no encontrado");

    const horarios = await tx.horario.findMany({
      where: { id_recurso: id, id_estado: ESTADO.ACTIVO },
      select: { dia: true, tutoria: { select: { titulo: true, cupo: true } } },
    });
    if (horarios.length > 0) {
      const detalles = { tutorias: [...new Set(horarios.map((h) => h.tutoria.titulo))] };
      if (data.id_estado === ESTADO.INACTIVO || (data.tipo && data.tipo !== recurso.tipo)) {
        throw new AppError(
          409,
          "El recurso está asignado a horarios activos; deben desactivarse antes de inactivarlo o cambiar su tipo",
          detalles
        );
      }
      const cupoMayor = Math.max(...horarios.map((h) => h.tutoria.cupo));
      if (data.capacidad !== undefined && data.capacidad < cupoMayor) {
        throw new AppError(409, `Una tutoría que usa este recurso tiene cupo ${cupoMayor}`, detalles);
      }
    }

    return tx.recurso.update({ where: { id }, data });
  });
}
