import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { ESTADO, ROL } from "../constants/catalogos.js";
import { AppError } from "../utils/AppError.js";

/**
 * Exige header "Authorization: Bearer <token>" y deja el usuario en req.usuario = { id, rol }.
 *
 * El rol y el estado se leen de la BASE DE DATOS en cada petición (no del token): así, cuando un
 * administrador aprueba una solicitud de tutor o inactiva a alguien, el cambio aplica en la siguiente
 * petición, sin volver a iniciar sesión. Es una consulta por clave primaria (muy barata).
 */
export async function autenticar(req, _res, next) {
  const [tipo, token] = (req.headers.authorization || "").split(" ");
  if (tipo !== "Bearer" || !token) {
    throw new AppError(401, "Token no proporcionado");
  }
  let datos;
  try {
    datos = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError(401, "Token inválido o expirado");
  }
  // Solo sirve un token de sesión: debe traer id y rol. Así ningún otro token firmado
  // (por ejemplo, el de "completar registro con Google") se acepta como sesión.
  if (!Number.isInteger(datos.id) || !Number.isInteger(datos.rol) || datos.tipo) {
    throw new AppError(401, "Token inválido o expirado");
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: datos.id },
    select: { id_rol: true, id_estado: true },
  });
  if (!usuario || usuario.id_estado !== ESTADO.ACTIVO) {
    throw new AppError(401, "Su sesión ya no es válida. Inicie sesión de nuevo.");
  }
  req.usuario = { id: datos.id, rol: usuario.id_rol };
  next();
}

// Usar después de autenticar: autorizar(ROL.ESTUDIANTE, ROL.TUTOR)
// El administrador es superusuario: pasa siempre, así puede hacer todo lo de un estudiante y un tutor
// (reservar, valorar, publicar tutorías…) con su misma cuenta. Las reglas de negocio de los servicios
// (cupos, cruces, dueño de la tutoría, etc.) le aplican igual que a cualquiera.
export const autorizar =
  (...roles) =>
  (req, _res, next) => {
    const rol = req.usuario?.rol;
    if (rol !== ROL.ADMINISTRADOR && !roles.includes(rol)) {
      throw new AppError(403, "No tiene permisos para esta acción");
    }
    next();
  };
