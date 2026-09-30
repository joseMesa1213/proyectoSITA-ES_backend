import "dotenv/config";
import { defineConfig } from "prisma/config";

// La CLI (migraciones, db pull) usa la conexión DIRECTA (puerto 5432).
// La app en ejecución usa DATABASE_URL (pooler, puerto 6543) — ver src/lib/prisma.js
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
