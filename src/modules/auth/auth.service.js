import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { verificarCredencialGoogle } from "../../lib/google.js";
import { env } from "../../config/env.js";
import { ESTADO, ROL } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos, textoOpcional } from "../../utils/validar.js";

const incluirPerfil = {
  rol: true,
  tipoDocumento: true,
  estudiante: { select: { nombre_programa: true, semestre: true } },
};

const firmarToken = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.id_rol }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const esVerdadero = (valor) => valor === true || valor === "true";

/**
 * ¿La persona pidió ser tutor al registrarse? El rol ya NO se elige: todos entran como estudiantes
 * y "Quiero ser tutor" (quiero_ser_tutor) crea una solicitud pendiente que revisa un administrador.
 *
 * COMPATIBILIDAD con el frontend anterior, que todavía envía id_rol mientras se publica el nuevo.
 * Quitar el bloque `if (datos.id_rol !== undefined)` cuando el frontend nuevo esté publicado
 * (después id_rol se puede rechazar siempre con 400):
 *   id_rol 1 → estudiante; id_rol 2 → estudiante + solicitud de tutor pendiente; otro → 400.
 */
function quiereSerTutor(datos) {
  if (datos.id_rol !== undefined) {
    const idRol = Number(datos.id_rol);
    if (idRol === ROL.TUTOR) return true;
    if (idRol !== ROL.ESTUDIANTE) throw new AppError(400, "El rol no se elige en el registro");
  }
  return esVerdadero(datos.quiero_ser_tutor);
}

/**
 * Crea el usuario (siempre ESTUDIANTE) con su fila de estudiante y, si la pidió, su solicitud de
 * tutor pendiente, todo en una sola operación. Devuelve la sesión.
 * La usan el registro normal y el registro con Google: así ambos validan lo mismo.
 * Correo o documento repetidos → 409 (P2002 en el manejador de errores).
 */
async function crearUsuario(datos, contrasena) {
  requerirCampos(datos, [
    "nombre", "apellido", "id_tipo_documento", "num_documento", "correo", "nombre_programa", "semestre",
  ]);
  const solicitaTutor = quiereSerTutor(datos);

  const usuario = await prisma.usuario.create({
    data: {
      nombre: datos.nombre,
      apellido: datos.apellido,
      id_tipo_documento: aEntero(datos.id_tipo_documento, "id_tipo_documento"),
      num_documento: String(datos.num_documento),
      correo: String(datos.correo).trim().toLowerCase(),
      celular: datos.celular ?? null,
      contrasena_hash: await bcrypt.hash(String(contrasena), 10),
      // Todos entran como estudiantes; el administrador se crea con `npm run crear-admin`
      id_rol: ROL.ESTUDIANTE,
      id_estado: ESTADO.ACTIVO,
      estudiante: {
        create: {
          nombre_programa: datos.nombre_programa,
          semestre: aEntero(datos.semestre, "semestre"),
        },
      },
      ...(solicitaTutor && {
        solicitudesTutor: {
          create: { id_estado: ESTADO.PENDIENTE, motivo: textoOpcional(datos.motivo_tutor) },
        },
      }),
    },
    include: incluirPerfil,
  });

  // solicitud_tutor_pendiente: el frontend lo usa para avisar "su solicitud quedó en revisión"
  return { token: firmarToken(usuario), usuario, solicitud_tutor_pendiente: solicitaTutor };
}

export async function registrar(datos) {
  requerirCampos(datos, ["contrasena"]);
  if (String(datos.contrasena).length < 8) {
    throw new AppError(400, "La contraseña debe tener al menos 8 caracteres");
  }
  return crearUsuario(datos, datos.contrasena);
}

export async function iniciarSesion({ correo, contrasena } = {}) {
  requerirCampos({ correo, contrasena }, ["correo", "contrasena"]);

  const usuario = await prisma.usuario.findUnique({
    where: { correo: String(correo).trim().toLowerCase() },
    omit: { contrasena_hash: false },
    include: incluirPerfil,
  });
  const valida = usuario && (await bcrypt.compare(String(contrasena), usuario.contrasena_hash));
  if (!valida) throw new AppError(401, "Credenciales inválidas");
  if (usuario.id_estado !== ESTADO.ACTIVO) throw new AppError(403, "Usuario inactivo");

  const { contrasena_hash, ...usuarioPublico } = usuario;
  return { token: firmarToken(usuario), usuario: usuarioPublico };
}

export async function obtenerPerfil(idUsuario) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: idUsuario },
    include: incluirPerfil,
  });
  if (!usuario) throw new AppError(404, "Usuario no encontrado");
  return usuario;
}

// --- Inicio de sesión con Google ------------------------------------------------------
//
// Flujo:
//   1. El frontend muestra el botón de Google y recibe un ID token (credential).
//   2. POST /auth/google { credential }: se verifica el token y se busca el correo.
//      - Si el usuario existe → sesión normal { token, usuario }.
//      - Si no existe → { registro_pendiente, token_registro, perfil }: faltan documento, programa, etc.
//   3. POST /auth/google/registro { token_registro, ...datos que faltan } → crea el usuario.
//
// El token de registro dura 15 minutos y se firma con un secreto DISTINTO al de las sesiones
// y con tipo "registro_google": no sirve como sesión, y un token de sesión no sirve para registrarse.

const TIPO_REGISTRO_GOOGLE = "registro_google";
const DURACION_REGISTRO_GOOGLE = "15m";
const secretoRegistro = () => `${env.jwtSecret}:registro-google`;

// Gmail no tiene "hd" (dominio de Google Workspace): solo se exige en dominios institucionales
const DOMINIOS_SIN_WORKSPACE = ["gmail.com"];

/**
 * Verifica el ID token de Google y devuelve { correo, nombre, apellido }.
 * - Token inválido, vencido o de otra app → 401.
 * - Correo no verificado por Google → 403.
 * - Correo de otro dominio (GOOGLE_DOMINIO, por defecto udea.edu.co) → 403.
 *   Además del final del correo se revisa "hd", que Google solo pone en cuentas administradas
 *   por la institución: así no basta con una cuenta personal que use un correo @udea.edu.co.
 */
async function verificarCuentaGoogle(credential) {
  requerirCampos({ credential }, ["credential"]);
  if (!env.googleClientId) {
    throw new AppError(503, "El inicio de sesión con Google no está configurado en el servidor");
  }

  let cuenta;
  try {
    cuenta = await verificarCredencialGoogle(String(credential));
  } catch {
    throw new AppError(401, "No se pudo verificar la cuenta de Google. Intente de nuevo.");
  }

  const correo = String(cuenta?.email ?? "").trim().toLowerCase();
  if (!correo || (cuenta.email_verified !== true && cuenta.email_verified !== "true")) {
    throw new AppError(403, "La cuenta de Google no tiene el correo verificado");
  }
  const dominio = env.googleDominio;
  const exigeHd = !DOMINIOS_SIN_WORKSPACE.includes(dominio);
  if (!correo.endsWith(`@${dominio}`) || (exigeHd && String(cuenta.hd ?? "").toLowerCase() !== dominio)) {
    throw new AppError(403, `Solo se permite ingresar con Google usando un correo @${dominio}`);
  }

  // Algunas cuentas no traen nombre y apellido por separado: se toman del nombre completo
  const [primero = "", ...resto] = String(cuenta.name ?? "").trim().split(/\s+/);
  return {
    correo,
    nombre: String(cuenta.given_name ?? primero).trim(),
    apellido: String(cuenta.family_name ?? resto.join(" ")).trim(),
  };
}

/**
 * POST /api/auth/google — público. Body: { credential }
 * Usuario existente y activo → { token, usuario } (igual que /auth/login). Inactivo → 403.
 * Administrador → 403: la cuenta con más permisos no se vincula a Google; entra con correo y contraseña.
 * Usuario nuevo → { registro_pendiente: true, token_registro, perfil: { correo, nombre, apellido } }.
 */
export async function iniciarConGoogle({ credential } = {}) {
  const perfil = await verificarCuentaGoogle(credential);

  const usuario = await prisma.usuario.findUnique({ where: { correo: perfil.correo }, include: incluirPerfil });
  if (usuario) {
    if (usuario.id_estado !== ESTADO.ACTIVO) throw new AppError(403, "Usuario inactivo");
    if (usuario.id_rol === ROL.ADMINISTRADOR) {
      throw new AppError(403, "Los administradores deben iniciar sesión con correo y contraseña");
    }
    return { token: firmarToken(usuario), usuario };
  }

  const token_registro = jwt.sign({ tipo: TIPO_REGISTRO_GOOGLE, ...perfil }, secretoRegistro(), {
    expiresIn: DURACION_REGISTRO_GOOGLE,
  });
  return { registro_pendiente: true, token_registro, perfil };
}

/**
 * POST /api/auth/google/registro — público.
 * Body: { token_registro, id_tipo_documento, num_documento, nombre_programa, semestre,
 *         celular?, nombre?, apellido?, quiero_ser_tutor?, motivo_tutor? }
 * El CORREO sale siempre del token firmado (nunca del body). Nombre y apellido se pueden corregir.
 * Token inválido o vencido → 401. El resto de validaciones son las del registro normal.
 *
 * Sin migración de BD: como contrasena_hash es obligatorio, se guarda el hash de una contraseña
 * aleatoria que nadie conoce. Esa persona entra solo con Google (no con correo y contraseña).
 */
export async function registrarConGoogle(datos = {}) {
  requerirCampos(datos, ["token_registro"]);

  let perfil;
  try {
    perfil = jwt.verify(String(datos.token_registro), secretoRegistro());
  } catch (error) {
    throw new AppError(
      401,
      error.name === "TokenExpiredError"
        ? "El tiempo para completar el registro venció. Vuelva a continuar con Google."
        : "El registro con Google no es válido. Vuelva a continuar con Google."
    );
  }
  if (perfil.tipo !== TIPO_REGISTRO_GOOGLE) {
    throw new AppError(401, "El registro con Google no es válido. Vuelva a continuar con Google.");
  }

  const { token_registro, correo, contrasena, ...resto } = datos;
  return crearUsuario(
    {
      ...resto,
      nombre: String(datos.nombre ?? perfil.nombre).trim(),
      apellido: String(datos.apellido ?? perfil.apellido).trim(),
      correo: perfil.correo,
    },
    randomBytes(32).toString("hex")
  );
}
