import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./materias.controller.js";

const router = Router();
const soloAdmin = [autenticar, autorizar(ROL.ADMINISTRADOR)];
const soloTutor = [autenticar, autorizar(ROL.TUTOR)];

router.get("/", ctrl.listar);
router.get("/mias", soloTutor, ctrl.listarDelTutor);
router.post("/", soloAdmin, ctrl.crear);
router.put("/:id", soloAdmin, ctrl.actualizar);
router.post("/:id/tutor", soloTutor, ctrl.asociarTutor);
router.delete("/:id/tutor", soloTutor, ctrl.desasociarTutor);

export default router;
