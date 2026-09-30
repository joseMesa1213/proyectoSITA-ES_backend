import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

// Exige header "Authorization: Bearer <token>" y deja el usuario en req.usuario = { id, rol }
export function autenticar(req, _res, next) {
  const [tipo, token] = (req.headers.authorization || "").split(" ");
  if (tipo !== "Bearer" || !token) {
    throw new AppError(401, "Token no proporcionado");
  }
  try {
    const { id, rol } = jwt.verify(token, env.jwtSecret);
    req.usuario = { id, rol };
    next();
  } catch {
    throw new AppError(401, "Token inválido o expirado");
  }
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
