import { AppError } from "../utils/AppError.js";

export function rutaNoEncontrada(req, _res, next) {
  next(new AppError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

// Traduce errores conocidos de Prisma a respuestas HTTP
function desdePrisma(err) {
  switch (err.code) {
    case "P2002":
      return new AppError(409, "Ya existe un registro con esos datos", { campos: err.meta?.target });
    case "P2003":
      return new AppError(400, "Referencia a un registro que no existe");
    case "P2025":
      return new AppError(404, "Registro no encontrado");
    default:
      return null;
  }
}

// Formato único de error: { ok: false, error: { mensaje, detalles? } }
export function manejadorErrores(err, _req, res, _next) {
  const appErr =
    err instanceof AppError
      ? err
      : desdePrisma(err) ??
        (err.type === "entity.parse.failed" ? new AppError(400, "JSON inválido") : null);

  if (!appErr) {
    console.error(err);
    return res.status(500).json({ ok: false, error: { mensaje: "Error interno del servidor" } });
  }
  res.status(appErr.status).json({
    ok: false,
    error: { mensaje: appErr.message, ...(appErr.detalles && { detalles: appErr.detalles }) },
  });
}
