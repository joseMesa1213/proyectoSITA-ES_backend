import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";
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

// ¿Puede entrar con Google? Solo los correos del dominio institucional (GOOGLE_DOMINIO, por defecto udea.edu.co)
export const esCorreoInstitucional = (correo) => normalizarCorreo(correo).endsWith(`@${env.googleDominio}`);

export const buscarPorCorreo = (correo) =>
  prisma.usuario.findUnique({ where: { correo: normalizarCorreo(correo) }, select: resumen });

/**
 * Crea un administrador nuevo (activo).
 * - Correo institucional (@udea.edu.co): NO lleva contraseña. Entra con «Continuar con Google»; se guarda el
 *   hash de una contraseña aleatoria que nadie conoce (igual que el registro con Google).
 * - Otro dominio (solo desarrollo, por ejemplo @demo.sita-es.test): no puede entrar con Google, así que
 *   necesita contraseña de al menos 10 caracteres y solo entra con LOGIN_CONTRASENA=true.
 * No crea fila en tbl_estudiante: el administrador no reserva ni es tutor.
 * Correo o documento repetidos → 409.
 */
export async function crearAdministrador(datos) {
  requerirCampos(datos, ["correo", "nombre", "apellido", "num_documento"]);
  const correo = normalizarCorreo(datos.correo);
  if (!CORREO_VALIDO.test(correo)) throw new AppError(400, "El correo no es válido");
  const institucional = esCorreoInstitucional(correo);
  if (!institucional && String(datos.contrasena ?? "").length < MINIMO_CONTRASENA) {
    throw new AppError(400,
      `Un administrador sin correo @${env.googleDominio} necesita una contraseña de al menos ${MINIMO_CONTRASENA} caracteres`);
  }
  if (await buscarPorCorreo(correo)) throw new AppError(409, "Ya existe un usuario con ese correo");
  const contrasena = institucional ? randomBytes(32).toString("hex") : String(datos.contrasena);

  return prisma.usuario.create({
    data: {
      nombre: String(datos.nombre).trim(),
      apellido: String(datos.apellido).trim(),
      id_tipo_documento: aEntero(datos.id_tipo_documento ?? 1, "id_tipo_documento"),
      num_documento: String(datos.num_documento).trim(),
      correo,
      contrasena_hash: await bcrypt.hash(contrasena, 10),
      id_rol: ROL.ADMINISTRADOR,
      id_estado: ESTADO.ACTIVO,
    },
    select: resumen,
  });
}

/**
 * Convierte en administrador a un usuario que ya existe (y lo deja activo).
 * No toca su contraseña: con correo @udea.edu.co sigue entrando con Google, ahora como administrador.
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
