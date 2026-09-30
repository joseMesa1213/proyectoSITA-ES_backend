import * as tutoriasService from "./tutorias.service.js";
import { aEntero } from "../../utils/validar.js";

export async function listar(req, res) {
  res.json({ ok: true, data: await tutoriasService.listar(req.query) });
}

export async function listarDelTutor(req, res) {
  res.json({ ok: true, data: await tutoriasService.listarDelTutor(req.usuario.id) });
}

export async function obtener(req, res) {
  res.json({ ok: true, data: await tutoriasService.obtener(aEntero(req.params.id, "id")) });
}

export async function crear(req, res) {
  const data = await tutoriasService.crear(req.usuario.id, req.body);
  res.status(201).json({ ok: true, data });
}

export async function actualizar(req, res) {
  const data = await tutoriasService.actualizar(
    aEntero(req.params.id, "id"), req.usuario.id, req.body
  );
  res.json({ ok: true, data });
}

export async function agregarHorario(req, res) {
  const data = await tutoriasService.agregarHorario(
    aEntero(req.params.id, "id"), req.usuario.id, req.body
  );
  res.status(201).json({ ok: true, data });
}

export async function desactivarHorario(req, res) {
  const data = await tutoriasService.desactivarHorario(
    aEntero(req.params.id, "id"), aEntero(req.params.idHorario, "idHorario"), req.usuario.id
  );
  res.json({ ok: true, data });
}
