import * as authService from "./auth.service.js";

export async function registrar(req, res) {
  const data = await authService.registrar(req.body);
  res.status(201).json({ ok: true, data });
}

export async function iniciarSesion(req, res) {
  const data = await authService.iniciarSesion(req.body);
  res.json({ ok: true, data });
}

export async function obtenerPerfil(req, res) {
  const data = await authService.obtenerPerfil(req.usuario.id);
  res.json({ ok: true, data });
}
