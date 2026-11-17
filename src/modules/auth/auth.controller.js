import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import * as authService from "./auth.service.js";

// POST /auth/registro: el registro por formulario se cerró. Siempre 403 (también en desarrollo):
// las cuentas nuevas se crean con «Continuar con Google» (POST /auth/google/registro).
// La ruta se deja para que quien la llame reciba un mensaje claro en lugar de un 404.
export async function registrar() {
  throw new AppError(403,
    `El registro se hace con «Continuar con Google» usando un correo @${env.googleDominio}.`);
}

export async function iniciarSesion(req, res) {
  const data = await authService.iniciarSesion(req.body);
  res.json({ ok: true, data });
}

export async function obtenerPerfil(req, res) {
  const data = await authService.obtenerPerfil(req.usuario.id);
  res.json({ ok: true, data });
}

export async function iniciarConGoogle(req, res) {
  const data = await authService.iniciarConGoogle(req.body);
  res.json({ ok: true, data });
}

export async function registrarConGoogle(req, res) {
  const data = await authService.registrarConGoogle(req.body);
  res.status(201).json({ ok: true, data });
}
