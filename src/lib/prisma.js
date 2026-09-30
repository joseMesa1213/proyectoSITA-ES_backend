import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";
import { env } from "../config/env.js";

// Única instancia del cliente para toda la app: importar SIEMPRE desde aquí.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.databaseUrl }),
  // El hash nunca sale en las consultas salvo que se pida explícitamente
  // con { omit: { contrasena_hash: false } } (solo lo hace el login).
  omit: { usuario: { contrasena_hash: true } },
});
