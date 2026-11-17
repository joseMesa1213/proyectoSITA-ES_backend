import * as servicio from "./solicitudes-tutoria.service.js";
import { aEntero } from "../../utils/validar.js";

export async function crear(req, res) {
  res.status(201).json({ ok: true, data: await servicio.crear(req.usuario, req.body) });
}

export async function listarMias(req, res) {
  res.json({ ok: true, data: await servicio.listarMias(req.usuario.id) });
}

export async function listarParaTutor(req, res) {
  res.json({ ok: true, data: await servicio.listarParaTutor(req.usuario.id) });
}

export async function retirar(req, res) {
  res.json({ ok: true, data: await servicio.retirar(aEntero(req.params.id, "id"), req.usuario.id) });
}

export async function atender(req, res) {
  res.json({ ok: true, data: await servicio.atender(aEntero(req.params.id, "id"), req.usuario.id, req.body) });
}
