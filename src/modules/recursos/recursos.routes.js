import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./recursos.controller.js";

const router = Router();
const soloAdmin = [autenticar, autorizar(ROL.ADMINISTRADOR)];

router.get("/", autenticar, ctrl.listar);
router.post("/", soloAdmin, ctrl.crear);
router.put("/:id", soloAdmin, ctrl.actualizar);

export default router;
