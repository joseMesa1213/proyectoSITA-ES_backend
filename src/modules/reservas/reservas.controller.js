import * as reservasService from "./reservas.service.js";
import { aEntero } from "../../utils/validar.js";

export async function crear(req, res) {
  const data = await reservasService.crear(req.usuario.id, req.body);
  res.status(201).json({ ok: true, data });
}

export async function listarMias(req, res) {
  res.json({ ok: true, data: await reservasService.listarMias(req.usuario.id) });
}

export async function listarDelTutor(req, res) {
  res.json({ ok: true, data: await reservasService.listarDelTutor(req.usuario.id, req.query) });
}

export async function cancelar(req, res) {
  const data = await reservasService.cancelar(aEntero(req.params.id, "id"), req.usuario.id);
  res.json({ ok: true, data });
}

export async function completar(req, res) {
  const data = await reservasService.completar(aEntero(req.params.id, "id"), req.usuario.id);
  res.json({ ok: true, data });
}
