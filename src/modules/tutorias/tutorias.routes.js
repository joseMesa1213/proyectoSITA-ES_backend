import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./tutorias.controller.js";

const router = Router();
const soloTutor = [autenticar, autorizar(ROL.TUTOR)];

router.get("/", ctrl.listar);
router.get("/mias", soloTutor, ctrl.listarDelTutor);
router.get("/:id", ctrl.obtener);
router.post("/", soloTutor, ctrl.crear);
router.put("/:id", soloTutor, ctrl.actualizar);
router.post("/:id/horarios", soloTutor, ctrl.agregarHorario);
router.patch("/:id/horarios/:idHorario/desactivar", soloTutor, ctrl.desactivarHorario);

export default router;
