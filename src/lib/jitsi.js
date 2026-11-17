import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

// Salas de Jitsi para las tutorías Virtuales. No hay API ni credenciales: una sala existe
// en cuanto alguien abre su URL. Por eso el nombre lleva una parte aleatoria; sin ella,
// cualquiera podría adivinar la sala de una tutoría a partir de su título.

// Máximo de participantes que se le asigna a la sala (capacidad del recurso generado)
export const CAPACIDAD_SALA_JITSI = 100;

// "Cálculo I: límites" → "Calculo-I-limites" (solo letras y números ASCII, máx. 40)
function aSlug(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** URL de una sala nueva: https://meet.jit.si/SITA-ES-<título>-<12 caracteres aleatorios> */
export function generarEnlaceJitsi(titulo) {
  const aleatorio = randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
  const slug = aSlug(titulo);
  return `${env.jitsiUrl}/SITA-ES-${slug ? `${slug}-` : ""}${aleatorio}`;
}
