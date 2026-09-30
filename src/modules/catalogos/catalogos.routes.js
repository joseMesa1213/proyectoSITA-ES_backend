import { Router } from "express";
import * as ctrl from "./catalogos.controller.js";

// Públicos: el formulario de registro los necesita antes de iniciar sesión
const router = Router();

router.get("/estados", ctrl.listarEstados);
router.get("/roles", ctrl.listarRoles);
router.get("/tipos-documento", ctrl.listarTiposDocumento);
router.get("/opciones", ctrl.listarOpciones);

export default router;
