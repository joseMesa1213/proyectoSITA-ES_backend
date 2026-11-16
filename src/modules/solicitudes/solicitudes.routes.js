import { Router } from "express";
import { autenticar, autorizar } from "../../middlewares/auth.middleware.js";
import { ROL } from "../../constants/catalogos.js";
import * as ctrl from "./solicitudes.controller.js";

const router = Router();
const soloAdmin = [autenticar, autorizar(ROL.ADMINISTRADOR)];
// El tutor puede intentarlo y recibe 409 "Usted ya es tutor"; el administrador, 403
const quienSolicita = [autenticar, autorizar(ROL.ESTUDIANTE, ROL.TUTOR)];

router.post("/", quienSolicita, ctrl.crear);
router.get("/mia", autenticar, ctrl.obtenerMia);
router.get("/", soloAdmin, ctrl.listar);
router.patch("/:id/aprobar", soloAdmin, ctrl.aprobar);
router.patch("/:id/rechazar", soloAdmin, ctrl.rechazar);

export default router;
