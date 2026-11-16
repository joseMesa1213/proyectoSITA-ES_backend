import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { ESTADO, ROL } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos } from "../../utils/validar.js";

// Administradores: se crean SOLO desde la consola (`npm run crear-admin`), nunca por una ruta de la API.
// Este archivo tiene la lógica para poder probarla; scripts/crear-admin.js hace las preguntas.

const MINIMO_CONTRASENA = 10;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resumen = { id: true, nombre: true, apellido: true, correo: true, id_rol: true, id_estado: true };

export const normalizarCorreo = (correo) => String(correo ?? "").trim().toLowerCase();

export const buscarPorCorreo = (correo) =>
  prisma.usuario.findUnique({ where: { correo: normalizarCorreo(correo) }, select: resumen });

/**
 * Crea un administrador nuevo (activo). Contraseña de al menos 10 caracteres.
 * No crea fila en tbl_estudiante: el administrador no reserva ni es tutor.
 * Correo o documento repetidos → 409.
 */
export async function crearAdministrador(datos) {
  requerirCampos(datos, ["correo", "nombre", "apellido", "num_documento", "contrasena"]);
  const correo = normalizarCorreo(datos.correo);
  if (!CORREO_VALIDO.test(correo)) throw new AppError(400, "El correo no es válido");
  if (String(datos.contrasena).length < MINIMO_CONTRASENA) {
    throw new AppError(400, `La contraseña del administrador debe tener al menos ${MINIMO_CONTRASENA} caracteres`);
  }
  if (await buscarPorCorreo(correo)) throw new AppError(409, "Ya existe un usuario con ese correo");

  return prisma.usuario.create({
    data: {
      nombre: String(datos.nombre).trim(),
      apellido: String(datos.apellido).trim(),
      id_tipo_documento: aEntero(datos.id_tipo_documento ?? 1, "id_tipo_documento"),
      num_documento: String(datos.num_documento).trim(),
      correo,
      contrasena_hash: await bcrypt.hash(String(datos.contrasena), 10),
      id_rol: ROL.ADMINISTRADOR,
      id_estado: ESTADO.ACTIVO,
    },
    select: resumen,
  });
}

/**
 * Convierte en administrador a un usuario que ya existe (y lo deja activo).
 * Conserva su contraseña: entra con correo y contraseña (los administradores no usan Google).
 */
export async function promoverAAdministrador(correo) {
  const usuario = await buscarPorCorreo(correo);
  if (!usuario) throw new AppError(404, "No existe un usuario con ese correo");
  if (usuario.id_rol === ROL.ADMINISTRADOR && usuario.id_estado === ESTADO.ACTIVO) {
    throw new AppError(409, "Ese usuario ya es administrador");
  }
  return prisma.usuario.update({
    where: { id: usuario.id },
    data: { id_rol: ROL.ADMINISTRADOR, id_estado: ESTADO.ACTIVO },
    select: resumen,
  });
}
