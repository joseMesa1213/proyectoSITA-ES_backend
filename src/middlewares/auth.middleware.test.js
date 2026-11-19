import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, test, vi } from "vitest";

// autenticar lee el rol y el estado de la BD: se simula Prisma
vi.mock("../lib/prisma.js", () => ({ prisma: { usuario: { findUnique: vi.fn() } } }));

const { prisma } = await import("../lib/prisma.js");
const { autenticar, autorizar } = await import("./auth.middleware.js");

const SECRETO = "secreto-solo-para-pruebas"; // el mismo de vitest.config.js
const pedir = (token) => ({ headers: { authorization: `Bearer ${token}` } });
const sesion = (id, rol) => jwt.sign({ id, rol }, SECRETO, { expiresIn: "8h" });

beforeEach(() => vi.clearAllMocks());

describe("autenticar", () => {
  test("token de sesión y usuario activo → deja pasar", async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id_rol: 1, id_estado: 1 });
    const req = pedir(sesion(7, 1));
    const siguiente = vi.fn();
    await autenticar(req, {}, siguiente);
    expect(siguiente).toHaveBeenCalled();
    expect(req.usuario).toEqual({ id: 7, rol: 1 });
  });

  test("el rol sale de la BD, no del token: solicitud aprobada → tutor sin volver a iniciar sesión", async () => {
    // El token se emitió cuando era estudiante (rol 1); el administrador ya aprobó (id_rol 2 en la BD)
    prisma.usuario.findUnique.mockResolvedValue({ id_rol: 2, id_estado: 1 });
    const req = pedir(sesion(7, 1));
    await autenticar(req, {}, vi.fn());
    expect(req.usuario.rol).toBe(2);
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { id_rol: true, id_estado: true } });
  });

  test("usuario inactivado después de iniciar sesión → 401 de inmediato", async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id_rol: 2, id_estado: 2 });
    await expect(autenticar(pedir(sesion(7, 2)), {}, vi.fn())).rejects.toMatchObject({ status: 401 });
  });

  test("usuario que ya no existe → 401", async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(autenticar(pedir(sesion(99, 1)), {}, vi.fn())).rejects.toMatchObject({ status: 401 });
  });

  test("sin token → 401 sin consultar la BD", async () => {
    await expect(autenticar({ headers: {} }, {}, vi.fn())).rejects.toMatchObject({ status: 401 });
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  test("token firmado sin id ni rol → 401", async () => {
    await expect(autenticar(pedir(jwt.sign({ correo: "x@udea.edu.co" }, SECRETO)), {}, vi.fn())).rejects.toMatchObject({ status: 401 });
  });

  test("token de registro con Google → 401", async () => {
    const registro = jwt.sign({ tipo: "registro_google", correo: "a@udea.edu.co" }, SECRETO);
    await expect(autenticar(pedir(registro), {}, vi.fn())).rejects.toMatchObject({ status: 401 });
  });

  test("token con otra firma → 401", async () => {
    await expect(autenticar(pedir(jwt.sign({ id: 7, rol: 3 }, "otro-secreto")), {}, vi.fn())).rejects.toMatchObject({ status: 401 });
  });
});

describe("autorizar", () => {
  test("rol permitido → deja pasar; otro rol → 403", () => {
    const soloAdmin = autorizar(3);
    const siguiente = vi.fn();
    soloAdmin({ usuario: { id: 1, rol: 3 } }, {}, siguiente);
    expect(siguiente).toHaveBeenCalled();
    expect(() => soloAdmin({ usuario: { id: 2, rol: 2 } }, {}, vi.fn())).toThrow(expect.objectContaining({ status: 403 }));
  });

  test("el administrador es superusuario: pasa también las rutas de estudiante y de tutor", () => {
    for (const roles of [[1, 2], [2]]) {
      const siguiente = vi.fn();
      autorizar(...roles)({ usuario: { id: 1, rol: 3 } }, {}, siguiente);
      expect(siguiente).toHaveBeenCalled();
    }
    expect(() => autorizar(2)({ usuario: { id: 5, rol: 1 } }, {}, vi.fn())).toThrow(expect.objectContaining({ status: 403 }));
  });
});
