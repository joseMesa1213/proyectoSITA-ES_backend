import { Router } from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import catalogosRoutes from "./modules/catalogos/catalogos.routes.js";
import materiasRoutes from "./modules/materias/materias.routes.js";
import recursosRoutes from "./modules/recursos/recursos.routes.js";
import tutoriasRoutes from "./modules/tutorias/tutorias.routes.js";
import reservasRoutes from "./modules/reservas/reservas.routes.js";
import valoracionesRoutes from "./modules/valoraciones/valoraciones.routes.js";

const router = Router();

router.get("/salud", (_req, res) => res.json({ ok: true, data: "SITA-ES API en línea" }));
router.use("/auth", authRoutes);
router.use("/catalogos", catalogosRoutes);
router.use("/materias", materiasRoutes);
router.use("/recursos", recursosRoutes);
router.use("/tutorias", tutoriasRoutes);
router.use("/reservas", reservasRoutes);
router.use("/valoraciones", valoracionesRoutes);

export default router;
