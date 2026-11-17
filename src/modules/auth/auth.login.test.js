import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Login con correo y contraseña: solo funciona con LOGIN_CONTRASENA=true (desarrollo).
// Se simula la base de datos: las pruebas revisan solo las reglas del servicio.
vi.mock("../../lib/prisma.js", () => ({ prisma: { usuario: { findUnique: vi.fn() } } }));

const { prisma } = await import("../../lib/prisma.js");
const { env } = await import("../../config/env.js");
const { iniciarSesion } = await import("./auth.service.js");

const hash = await bcrypt.hash("Udea123.", 4);
const usuario = (cambios = {}) => ({
  id: 3, correo: "camila.gomez@demo.sita-es.test", contrasena_hash: hash, id_rol: 1, id_estado: 1, ...cambios,
});

beforeEach(() => {
  vi.clearAllMocks();
  env.loginContrasena = true;
});

describe("LOGIN_CONTRASENA apagada (producción)", () => {
  test("responde 403 y pide entrar con Google, sin consultar la BD", async () => {
    env.loginContrasena = false;
    await expect(iniciarSesion({ correo: "camila.gomez@demo.sita-es.test", contrasena: "Udea123." }))
      .rejects.toMatchObject({ status: 403, message: expect.stringContaining("Continuar con Google") });
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  test("también sin campos: el 403 va antes que las validaciones", async () => {
    env.loginContrasena = false;
    await expect(iniciarSesion({})).rejects.toMatchObject({ status: 403 });
  });
});

describe("LOGIN_CONTRASENA=true (desarrollo)", () => {
  test("credenciales correctas → sesión sin el hash de la contraseña", async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario());
    const respuesta = await iniciarSesion({ correo: " Camila.Gomez@demo.sita-es.test ", contrasena: "Udea123." });
    expect(respuesta.token).toBeTypeOf("string");
    expect(respuesta.usuario).not.toHaveProperty("contrasena_hash");
    expect(prisma.usuario.findUnique.mock.calls[0][0].where.correo).toBe("camila.gomez@demo.sita-es.test");
  });

  test("contraseña incorrecta o correo inexistente → 401", async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario());
    await expect(iniciarSesion({ correo: "camila.gomez@demo.sita-es.test", contrasena: "otra" }))
      .rejects.toMatchObject({ status: 401 });
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(iniciarSesion({ correo: "nadie@demo.sita-es.test", contrasena: "Udea123." }))
      .rejects.toMatchObject({ status: 401 });
  });

  test("sin campos → 400", async () => {
    await expect(iniciarSesion({})).rejects.toMatchObject({ status: 400 });
  });

  test("usuario inactivo → 403", async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario({ id_estado: 2 }));
    await expect(iniciarSesion({ correo: "camila.gomez@demo.sita-es.test", contrasena: "Udea123." }))
      .rejects.toMatchObject({ status: 403, message: "Usuario inactivo" });
  });
});
