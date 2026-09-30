import * as catalogosService from "./catalogos.service.js";

export async function listarEstados(_req, res) {
  res.json({ ok: true, data: await catalogosService.listarEstados() });
}

export async function listarRoles(_req, res) {
  res.json({ ok: true, data: await catalogosService.listarRoles() });
}

export async function listarTiposDocumento(_req, res) {
  res.json({ ok: true, data: await catalogosService.listarTiposDocumento() });
}

export function listarOpciones(_req, res) {
  res.json({ ok: true, data: catalogosService.listarOpciones() });
}
