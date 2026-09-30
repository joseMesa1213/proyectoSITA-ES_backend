import * as materiasService from "./materias.service.js";
import { aEntero } from "../../utils/validar.js";

export async function listar(req, res) {
  res.json({ ok: true, data: await materiasService.listar(req.query) });
}

export async function listarDelTutor(req, res) {
  res.json({ ok: true, data: await materiasService.listarDelTutor(req.usuario.id) });
}

export async function crear(req, res) {
  res.status(201).json({ ok: true, data: await materiasService.crear(req.body) });
}

export async function actualizar(req, res) {
  const data = await materiasService.actualizar(aEntero(req.params.id, "id"), req.body);
  res.json({ ok: true, data });
}

export async function asociarTutor(req, res) {
  const data = await materiasService.asociarTutor(aEntero(req.params.id, "id"), req.usuario.id);
  res.status(201).json({ ok: true, data });
}

export async function desasociarTutor(req, res) {
  await materiasService.desasociarTutor(aEntero(req.params.id, "id"), req.usuario.id);
  res.json({ ok: true, data: null });
}
