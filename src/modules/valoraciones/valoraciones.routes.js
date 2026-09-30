import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./valoraciones.controller.js";

const router = Router();

router.post("/", autenticar, autorizar(ROL.ESTUDIANTE, ROL.TUTOR), ctrl.crear);
router.get("/tutoria/:idTutoria", ctrl.listarPorTutoria);

export default router;
