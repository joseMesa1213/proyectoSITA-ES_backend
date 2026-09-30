import * as valoracionesService from "./valoraciones.service.js";
import { aEntero } from "../../utils/validar.js";

export async function crear(req, res) {
  const data = await valoracionesService.crear(req.usuario.id, req.body);
  res.status(201).json({ ok: true, data });
}

export async function listarPorTutoria(req, res) {
  const data = await valoracionesService.listarPorTutoria(aEntero(req.params.idTutoria, "idTutoria"));
  res.json({ ok: true, data });
}
