import { Router } from "express";
import { autenticar } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./notificaciones.controller.js";

// Cada quien ve y marca solo sus propios avisos (todos los roles)
const router = Router();

router.get("/", autenticar, ctrl.listar);
router.patch("/leer-todas", autenticar, ctrl.marcarTodas);
router.patch("/:id/leer", autenticar, ctrl.marcarLeida);

export default router;
