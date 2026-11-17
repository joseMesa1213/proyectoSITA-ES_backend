import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./solicitudes-tutoria.controller.js";

const router = Router();
// Pide quien puede reservar (estudiante o tutor, en otra materia); atiende el tutor
const quienPide = [autenticar, autorizar(ROL.ESTUDIANTE, ROL.TUTOR)];
const soloTutor = [autenticar, autorizar(ROL.TUTOR)];

router.post("/", quienPide, ctrl.crear);
router.get("/mias", quienPide, ctrl.listarMias);
router.get("/para-mi", soloTutor, ctrl.listarParaTutor);
router.patch("/:id/retirar", quienPide, ctrl.retirar);
router.patch("/:id/atender", soloTutor, ctrl.atender);

export default router;
