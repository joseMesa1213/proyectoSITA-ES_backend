// Crea un administrador, o convierte en administrador a un usuario existente.
//
//   npm run crear-admin
//
// Usa la base del archivo .env. Antes de hacer nada muestra a qué servidor se conectará y pide
// escribir SI, para que nadie cree un administrador en producción sin darse cuenta.
//
// - Correo @udea.edu.co: no pide contraseña. El administrador entra con «Continuar con Google».
// - Otro dominio (solo desarrollo): pide contraseña (no se ve mientras se escribe) y avisa que
//   solo podrá entrar con LOGIN_CONTRASENA=true, nunca en producción.
import readline from "node:readline";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import {
  buscarPorCorreo, crearAdministrador, esCorreoInstitucional, promoverAAdministrador,
} from "../src/modules/auth/administradores.service.js";

function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolver) => rl.question(texto, (respuesta) => {
    rl.close();
    resolver(respuesta.trim());
  }));
}

// Lee tecla por tecla sin mostrar lo escrito (Enter termina, Retroceso borra, Ctrl+C cancela)
function preguntarOculto(texto) {
  return new Promise((resolver) => {
    process.stdout.write(texto);
    const entrada = process.stdin;
    let valor = "";
    const alTeclear = (teclas) => {
      for (const tecla of teclas) {
        if (tecla === "\r" || tecla === "\n") {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off("data", alTeclear);
          process.stdout.write("\n");
          return resolver(valor);
        }
        if (tecla === "\u0003") {
          process.stdout.write("\nCancelado.\n");
          process.exit(130);
        }
        valor = tecla === "\u007f" || tecla === "\b" ? valor.slice(0, -1) : valor + tecla;
      }
    };
    entrada.setRawMode(true);
    entrada.setEncoding("utf8");
    entrada.resume();
    entrada.on("data", alTeclear);
  });
}

async function main() {
  if (!process.stdin.isTTY) throw new Error("Ejecútelo en una terminal interactiva: npm run crear-admin");

  const url = new URL(env.databaseUrl);
  const esLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  console.log("\nCrear administrador de SITA-ES");
  console.log(`Base de datos: ${url.hostname}:${url.port || 5432}${url.pathname}${esLocal ? " (local)" : "  ⚠️  NO ES LOCAL"}`);
  if ((await preguntar("Escriba SI para continuar: ")) !== "SI") return console.log("Cancelado. No se hizo nada.");

  const correo = await preguntar(`Correo (@${env.googleDominio}): `);
  const institucional = esCorreoInstitucional(correo);
  const comoEntra = institucional
    ? "Entra con «Continuar con Google»."
    : `No es @${env.googleDominio}: solo entra con contraseña y LOGIN_CONTRASENA=true (desarrollo), nunca en producción.`;
  const existente = await buscarPorCorreo(correo);

  if (existente) {
    console.log(`\nYa existe: ${existente.nombre} ${existente.apellido} (id_rol ${existente.id_rol}).`);
    if ((await preguntar("¿Convertirlo en administrador? Escriba SI: ")) !== "SI") return console.log("Cancelado.");
    const admin = await promoverAAdministrador(correo);
    return console.log(`\n✔ ${admin.correo} ahora es administrador. ${comoEntra}`);
  }

  if (!institucional) {
    console.log(`\n⚠️  ${correo} no es @${env.googleDominio}: no podrá entrar con Google.`);
    console.log("   Solo sirve en desarrollo, con LOGIN_CONTRASENA=true. En producción use un correo institucional.");
    if ((await preguntar("¿Crearlo de todas formas? Escriba SI: ")) !== "SI") return console.log("Cancelado.");
  }

  const nombre = await preguntar("Nombre: ");
  const apellido = await preguntar("Apellido: ");
  const num_documento = await preguntar("Número de documento (cédula): ");
  let contrasena;
  if (!institucional) {
    contrasena = await preguntarOculto("Contraseña (mínimo 10 caracteres): ");
    if ((await preguntarOculto("Repita la contraseña: ")) !== contrasena) {
      return console.log("\nLas contraseñas no coinciden. No se hizo nada.");
    }
  }

  const admin = await crearAdministrador({ correo, nombre, apellido, num_documento, contrasena });
  console.log(`\n✔ Administrador creado: ${admin.correo} (id ${admin.id}). ${comoEntra}`);
}

main()
  .catch((error) => {
    console.error(`\n✖ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
