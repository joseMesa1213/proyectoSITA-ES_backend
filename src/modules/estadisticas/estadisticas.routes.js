import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./estadisticas.controller.js";

const router = Router();

router.get("/", autenticar, autorizar(ROL.ADMINISTRADOR), ctrl.obtener);

export default router;
