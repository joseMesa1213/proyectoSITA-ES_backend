import * as estadisticasService from "./estadisticas.service.js";

export async function obtener(req, res) {
  res.json({ ok: true, data: await estadisticasService.obtener(req.query) });
}
