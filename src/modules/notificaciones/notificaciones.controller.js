import * as notificacionesService from "./notificaciones.service.js";
import { aEntero } from "../../utils/validar.js";

export async function listar(req, res) {
  res.json({ ok: true, data: await notificacionesService.listar(req.usuario.id) });
}

export async function marcarLeida(req, res) {
  res.json({ ok: true, data: await notificacionesService.marcarLeida(aEntero(req.params.id, "id"), req.usuario.id) });
}

export async function marcarTodas(req, res) {
  res.json({ ok: true, data: await notificacionesService.marcarTodas(req.usuario.id) });
}
