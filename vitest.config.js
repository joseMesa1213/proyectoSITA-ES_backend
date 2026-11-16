import { defineConfig } from "vitest/config";

// Las pruebas no usan la base de datos ni Google: Prisma y la verificación de Google se simulan.
// Estas variables solo existen mientras corren las pruebas.
export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://pruebas:pruebas@localhost:5432/pruebas",
      JWT_SECRET: "secreto-solo-para-pruebas",
      GOOGLE_CLIENT_ID: "cliente-de-pruebas.apps.googleusercontent.com",
      GOOGLE_DOMINIO: "udea.edu.co",
    },
  },
});
