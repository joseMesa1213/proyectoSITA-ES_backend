import { Router } from "express";
import { autenticar } from "../../middlewares/auth.middleware.js";
import * as ctrl from "./auth.controller.js";

const router = Router();

router.post("/registro", ctrl.registrar);
router.post("/login", ctrl.iniciarSesion);
router.get("/perfil", autenticar, ctrl.obtenerPerfil);

export default router;
