import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

// Exige header "Authorization: Bearer <token>" y deja el usuario en req.usuario = { id, rol }
export function autenticar(req, _res, next) {
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
  req.usuario = { id: datos.id, rol: datos.rol };
  next();
}

// Usar después de autenticar: autorizar(ROL.TUTOR, ROL.ADMINISTRADOR)
export const autorizar =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      throw new AppError(403, "No tiene permisos para esta acción");
    }
    next();
  };
