import * as solicitudesService from "./solicitudes.service.js";
import { aEntero } from "../../utils/validar.js";

export async function crear(req, res) {
  const data = await solicitudesService.crear(req.usuario, req.body);
  res.status(201).json({ ok: true, data });
}

export async function obtenerMia(req, res) {
  res.json({ ok: true, data: await solicitudesService.obtenerMia(req.usuario.id) });
}

export async function listar(req, res) {
  res.json({ ok: true, data: await solicitudesService.listar(req.query) });
}

export async function aprobar(req, res) {
  const data = await solicitudesService.aprobar(aEntero(req.params.id, "id"), req.usuario.id, req.body);
  res.json({ ok: true, data });
}

export async function rechazar(req, res) {
  const data = await solicitudesService.rechazar(aEntero(req.params.id, "id"), req.usuario.id, req.body);
  res.json({ ok: true, data });
}
