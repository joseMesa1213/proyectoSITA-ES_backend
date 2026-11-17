// Corre la colección de Postman contra el backend LOCAL (http://localhost:3000/api).
//
//   npm run postman:local                                   → toda la colección
//   npm run postman:local -- -i "1. Humo (solo lectura)"    → solo una carpeta (-i acepta nombre o ruta)
//
// El flujo completo registra usuarios con POST /auth/google/registro, y para eso firma los token_registro
// con el JWT_SECRET del .env (variable jwt_secret de Postman). Este script lo pasa en un archivo de
// entorno temporal, que se borra al terminar: el secreto no se muestra en pantalla ni en la línea de comandos.
// (jwt_secret es de tipo "default" y no "secret": con "secret" Postman CLI 1.73 se queda sin memoria.)
//
// Antes de correr: backend local encendido (npm run dev) con LOGIN_CONTRASENA=true y la semilla cargada.
// Si Postman o el backend se cierran con "out of memory", es el equipo con poca RAM libre: cerrar programas
// o arrancar el backend sin nodemon (node --env-file=.env src/server.js) y volver a correr.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";

const COLECCION = "docs/postman/SITA-ES.postman_collection.json";
const ENTORNO = "docs/postman/SITA-ES-local.postman_environment.json";

function fallar(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

let variables;
try {
  variables = dotenv.parse(readFileSync(".env"));
} catch {
  fallar("No se encontró el archivo .env del backend.");
}
if (!variables.JWT_SECRET) fallar("El .env no tiene JWT_SECRET.");

// El flujo completo escribe datos: solo contra una base local, nunca contra Supabase
const host = (() => {
  try { return new URL(variables.DATABASE_URL).hostname; } catch { return ""; }
})();
if (!["localhost", "127.0.0.1"].includes(host)) {
  fallar("DATABASE_URL del .env no apunta a una base local. La colección crea datos: no se corre contra producción.");
}
if (variables.LOGIN_CONTRASENA !== "true") {
  console.warn("⚠️  El .env no tiene LOGIN_CONTRASENA=true: el flujo completo no podrá entrar con las cuentas de la semilla.");
}

const entorno = JSON.parse(readFileSync(ENTORNO, "utf8"));
entorno.values = entorno.values.map((v) => (v.key === "jwt_secret" ? { ...v, value: variables.JWT_SECRET } : v));

const carpeta = mkdtempSync(path.join(tmpdir(), "sita-es-postman-"));
const archivo = path.join(carpeta, "entorno.json");
try {
  writeFileSync(archivo, JSON.stringify(entorno));
  const resultado = spawnSync("postman", ["collection", "run", COLECCION, "-e", archivo, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  if (resultado.error) fallar(`No se pudo ejecutar Postman CLI (${resultado.error.code}). ¿Está instalado?`);
  process.exitCode = resultado.status ?? 1;
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
