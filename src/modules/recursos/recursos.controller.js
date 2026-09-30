import * as recursosService from "./recursos.service.js";
import { aEntero } from "../../utils/validar.js";

export async function listar(req, res) {
  res.json({ ok: true, data: await recursosService.listar(req.usuario, req.query) });
}

export async function crear(req, res) {
  res.status(201).json({ ok: true, data: await recursosService.crear(req.body) });
}

export async function actualizar(req, res) {
  const data = await recursosService.actualizar(aEntero(req.params.id, "id"), req.body);
  res.json({ ok: true, data });
}
