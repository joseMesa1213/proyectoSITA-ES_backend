import { describe, expect, test } from "vitest";
import { generarEnlaceJitsi } from "./jitsi.js";

describe("generarEnlaceJitsi", () => {
  test("sala en meet.jit.si con el título sin tildes ni símbolos y una parte aleatoria", () => {
    const enlace = generarEnlaceJitsi("Cálculo I: límites y derivadas");
    expect(enlace).toMatch(/^https:\/\/meet\.jit\.si\/SITA-ES-Calculo-I-limites-y-derivadas-[A-Za-z0-9]{12}$/);
  });

  test("cada llamada da una sala distinta aunque el título sea el mismo", () => {
    expect(generarEnlaceJitsi("SQL")).not.toBe(generarEnlaceJitsi("SQL"));
  });

  test("título largo se recorta y uno sin letras no deja guiones sueltos", () => {
    const largo = generarEnlaceJitsi("a".repeat(100));
    expect(largo.split("/").pop().length).toBeLessThanOrEqual("SITA-ES-".length + 40 + 1 + 12);
    expect(generarEnlaceJitsi("¿?¡!")).toMatch(/\/SITA-ES-[A-Za-z0-9]{12}$/);
  });
});
