// Respaldo de la base de datos con pg_dump, usando Docker (no hace falta instalar PostgreSQL).
//
//   npm run respaldo                      → respalda la base del .env (la local)
//   npm run respaldo -- .env.produccion   → respalda producción (hacerlo ANTES de una migración)
//
// - Solo LEE la base: pg_dump no modifica nada.
// - Usa DIRECT_URL (conexión directa, puerto 5432). El pooler (6543) no sirve para pg_dump.
// - Respalda solo el esquema "public" (las tablas de SITA-ES y _prisma_migrations), sin los esquemas
//   internos de Supabase (auth, storage), que no se pueden restaurar en otra base.
// - La contraseña viaja como variable de entorno al contenedor: no queda en el historial ni en la
//   lista de procesos.
// - El archivo queda en respaldos/ (ignorado por git): contiene datos personales, NO subirlo.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// pg_dump debe ser de una versión igual o mayor a la del servidor; la 17 respalda servidores 15, 16 y 17
const IMAGEN = "postgres:17-alpine";
const CARPETA = path.resolve("respaldos");

function fallar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

const archivoEnv = process.argv[2] ?? ".env";
let variables;
try {
  variables = dotenv.parse(readFileSync(archivoEnv));
} catch {
  fallar(`No se pudo leer ${archivoEnv}.`);
}
if (!variables.DIRECT_URL) fallar(`${archivoEnv} no tiene DIRECT_URL (la conexión directa, puerto 5432).`);

const url = new URL(variables.DIRECT_URL);
if (url.port === "6543") fallar("DIRECT_URL apunta al pooler (6543). Use la conexión directa o de sesión (5432).");

// pg_dump no acepta parámetros de Prisma como ?pgbouncer=true: solo se conserva sslmode
const sslmode = url.searchParams.get("sslmode");
url.search = "";
if (sslmode) url.searchParams.set("sslmode", sslmode);

// Desde el contenedor, "localhost" es el propio contenedor: la base local se alcanza por host.docker.internal
const esLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
if (esLocal) url.hostname = "host.docker.internal";

const etiqueta = path.basename(archivoEnv).replace(/^\.env\.?/, "") || "local";
const fecha = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
const nombre = `sita-es-${etiqueta}-${fecha}.dump`;
mkdirSync(CARPETA, { recursive: true });

// Se muestra a qué base se conecta, sin usuario ni contraseña
console.log(`Respaldando ${url.hostname}:${url.port || 5432}${url.pathname} (esquema public) con ${IMAGEN}...`);

const resultado = spawnSync(
  "docker",
  [
    "run", "--rm",
    "-e", "PGURL", // sin valor: Docker la toma del entorno de este proceso
    // En Linux con SELinux (Fedora, RHEL) el contenedor no puede escribir en una carpeta de la casa del
    // usuario si no se re-etiqueta con :z. En Windows y macOS (Docker Desktop) no hace falta.
    "-v", `${CARPETA}:/respaldos${process.platform === "linux" ? ":z" : ""}`,
    IMAGEN,
    "sh", "-c",
    `pg_dump "$PGURL" --schema=public --no-owner --no-privileges --format=custom --file=/respaldos/${nombre}`,
  ],
  { stdio: "inherit", env: { ...process.env, PGURL: url.toString() } }
);

if (resultado.error) fallar(`No se pudo ejecutar Docker: ${resultado.error.message}. ¿Está abierto Docker Desktop (o el servicio docker en Linux)?`);
if (resultado.status !== 0) fallar("pg_dump terminó con error (ver el mensaje de arriba). No se generó un respaldo válido.");

const archivo = path.join(CARPETA, nombre);
const kb = Math.round(statSync(archivo).size / 1024);
console.log(`\n✔ Respaldo listo: respaldos/${nombre} (${kb} KB)`);
console.log("  Contiene datos personales: no lo suba a GitHub ni lo comparta.");
