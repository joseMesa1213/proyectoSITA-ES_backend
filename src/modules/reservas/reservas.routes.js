import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./reservas.controller.js";

const router = Router();
// Los tutores también pueden reservar tutorías de otros tutores
const quienReserva = [autenticar, autorizar(ROL.ESTUDIANTE, ROL.TUTOR)];
const soloTutor = [autenticar, autorizar(ROL.TUTOR)];

router.post("/", quienReserva, ctrl.crear);
router.get("/mias", quienReserva, ctrl.listarMias);
router.get("/tutor", soloTutor, ctrl.listarDelTutor);
router.patch("/:id/cancelar", quienReserva, ctrl.cancelar);
router.patch("/:id/completar", soloTutor, ctrl.completar);

export default router;
