import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import routes from "./routes.js";
import { manejadorErrores, rutaNoEncontrada } from "./middlewares/error.middleware.js";

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.use("/api", routes);

app.use(rutaNoEncontrada);
app.use(manejadorErrores);

export default app;
