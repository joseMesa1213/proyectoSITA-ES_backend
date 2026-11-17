import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Se simulan Google y la base de datos: las pruebas revisan solo las reglas del servicio.
vi.mock("../../lib/google.js", () => ({ verificarCredencialGoogle: vi.fn() }));
vi.mock("../../lib/prisma.js", () => ({
  prisma: { usuario: { findUnique: vi.fn(), create: vi.fn() } },
}));

const { verificarCredencialGoogle } = await import("../../lib/google.js");
const { prisma } = await import("../../lib/prisma.js");
const { env } = await import("../../config/env.js");
const { iniciarConGoogle, registrarConGoogle } = await import("./auth.service.js");

const SECRETO = "secreto-solo-para-pruebas"; // el mismo de vitest.config.js
const SECRETO_REGISTRO = `${SECRETO}:registro-google`;

// Cuenta institucional válida, como la devuelve Google
const cuentaUdea = (cambios = {}) => ({
  email: "ana.gomez@udea.edu.co",
  email_verified: true,
  hd: "udea.edu.co",
  given_name: "Ana",
  family_name: "Gómez",
  name: "Ana Gómez",
  ...cambios,
});

const usuarioGuardado = (cambios = {}) => ({
  id: 7, nombre: "Ana", apellido: "Gómez", correo: "ana.gomez@udea.edu.co", id_rol: 1, id_estado: 1, ...cambios,
});

const tokenRegistro = (cambios = {}, opciones = { expiresIn: "15m" }) =>
  jwt.sign({ tipo: "registro_google", correo: "ana.gomez@udea.edu.co", nombre: "Ana", apellido: "Gómez", ...cambios },
    SECRETO_REGISTRO, opciones);

const datosRegistro = (cambios = {}) => ({
  token_registro: tokenRegistro(),
  id_tipo_documento: 1,
  num_documento: "1001",
  nombre_programa: "Ingeniería de Sistemas",
  semestre: 3,
  ...cambios,
});

beforeEach(() => {
  vi.clearAllMocks();
  env.googleClientId = "cliente-de-pruebas.apps.googleusercontent.com";
});

describe("POST /auth/google: casos de error", () => {
  test("sin credential → 400", async () => {
    await expect(iniciarConGoogle({})).rejects.toMatchObject({ status: 400 });
  });

  test("servidor sin GOOGLE_CLIENT_ID → 503", async () => {
    env.googleClientId = "";
    await expect(iniciarConGoogle({ credential: "x" })).rejects.toMatchObject({ status: 503 });
  });

  test("token de Google inválido o vencido → 401", async () => {
    verificarCredencialGoogle.mockRejectedValue(new Error("Wrong number of segments"));
    await expect(iniciarConGoogle({ credential: "token-falso" })).rejects.toMatchObject({ status: 401 });
  });

  test("correo no verificado → 403", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea({ email_verified: false }));
    await expect(iniciarConGoogle({ credential: "x" })).rejects.toMatchObject({
      status: 403, message: expect.stringContaining("verificado"),
    });
  });

  test("correo de otro dominio → 403", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea({ email: "ana@gmail.com", hd: undefined }));
    await expect(iniciarConGoogle({ credential: "x" })).rejects.toMatchObject({
      status: 403, message: expect.stringContaining("@udea.edu.co"),
    });
  });

  test("correo @udea.edu.co en una cuenta personal (sin hd) → 403", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea({ hd: undefined }));
    await expect(iniciarConGoogle({ credential: "x" })).rejects.toMatchObject({ status: 403 });
  });

  test("dominio que solo termina parecido (@noudea.edu.co) → 403", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea({ email: "ana@noudea.edu.co", hd: "noudea.edu.co" }));
    await expect(iniciarConGoogle({ credential: "x" })).rejects.toMatchObject({ status: 403 });
  });

  test("usuario existente pero inactivo → 403", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea());
    prisma.usuario.findUnique.mockResolvedValue(usuarioGuardado({ id_estado: 2 }));
    await expect(iniciarConGoogle({ credential: "x" })).rejects.toMatchObject({
      status: 403, message: "Usuario inactivo",
    });
  });
});

describe("POST /auth/google: casos correctos", () => {
  test("usuario existente y activo → sesión igual que /auth/login", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea({ email: "Ana.Gomez@UDEA.edu.co" }));
    prisma.usuario.findUnique.mockResolvedValue(usuarioGuardado());

    const respuesta = await iniciarConGoogle({ credential: "x" });

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { correo: "ana.gomez@udea.edu.co" } }));
    expect(respuesta.usuario.id).toBe(7);
    expect(jwt.verify(respuesta.token, SECRETO)).toMatchObject({ id: 7, rol: 1 });
  });

  test("administrador @udea.edu.co → entra con Google; el rol sale de la BD", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea());
    prisma.usuario.findUnique.mockResolvedValue(usuarioGuardado({ id_rol: 3 }));
    const respuesta = await iniciarConGoogle({ credential: "x" });
    expect(respuesta.usuario.id_rol).toBe(3);
    expect(jwt.verify(respuesta.token, SECRETO)).toMatchObject({ id: 7, rol: 3 });
  });

  test("administrador inactivo → 403 como cualquier usuario", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea());
    prisma.usuario.findUnique.mockResolvedValue(usuarioGuardado({ id_rol: 3, id_estado: 2 }));
    await expect(iniciarConGoogle({ credential: "x" })).rejects.toMatchObject({ status: 403, message: "Usuario inactivo" });
  });

  test("usuario nuevo → registro pendiente con token de 15 minutos", async () => {
    verificarCredencialGoogle.mockResolvedValue(cuentaUdea());
    prisma.usuario.findUnique.mockResolvedValue(null);

    const respuesta = await iniciarConGoogle({ credential: "x" });

    expect(respuesta).toMatchObject({
      registro_pendiente: true,
      perfil: { correo: "ana.gomez@udea.edu.co", nombre: "Ana", apellido: "Gómez" },
    });
    expect(respuesta.token).toBeUndefined();
    const datos = jwt.verify(respuesta.token_registro, SECRETO_REGISTRO);
    expect(datos).toMatchObject({ tipo: "registro_google", correo: "ana.gomez@udea.edu.co" });
    expect(datos.exp - datos.iat).toBe(15 * 60);
  });

  test("cuenta sin nombre y apellido separados → se toman del nombre completo", async () => {
    verificarCredencialGoogle.mockResolvedValue(
      cuentaUdea({ given_name: undefined, family_name: undefined, name: "Juan Pablo Ríos" })
    );
    prisma.usuario.findUnique.mockResolvedValue(null);

    const { perfil } = await iniciarConGoogle({ credential: "x" });
    expect(perfil).toMatchObject({ nombre: "Juan", apellido: "Pablo Ríos" });
  });
});

describe("POST /auth/google/registro", () => {
  test("sin token de registro → 400", async () => {
    await expect(registrarConGoogle({ id_rol: 1 })).rejects.toMatchObject({ status: 400 });
  });

  test("token de registro vencido → 401 con mensaje claro", async () => {
    const vencido = tokenRegistro({}, { expiresIn: -10 });
    await expect(registrarConGoogle(datosRegistro({ token_registro: vencido }))).rejects.toMatchObject({
      status: 401, message: expect.stringContaining("venció"),
    });
  });

  test("token alterado o falso → 401", async () => {
    await expect(registrarConGoogle(datosRegistro({ token_registro: "abc.def.ghi" }))).rejects.toMatchObject({ status: 401 });
  });

  test("un token de SESIÓN no sirve para registrarse → 401", async () => {
    const sesion = jwt.sign({ id: 7, rol: 1 }, SECRETO, { expiresIn: "8h" });
    await expect(registrarConGoogle(datosRegistro({ token_registro: sesion }))).rejects.toMatchObject({ status: 401 });
  });

  test.each([1, 2, 3])("enviando id_rol %s → 400 sin crear nada (igual que el registro normal)", async (idRol) => {
    await expect(registrarConGoogle(datosRegistro({ id_rol: idRol }))).rejects.toMatchObject({
      status: 400, message: "El rol no se elige en el registro",
    });
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  test("sin id_rol → se crea como estudiante", async () => {
    prisma.usuario.create.mockImplementation(async ({ data }) => usuarioGuardado({ id: 9, id_rol: data.id_rol }));
    await registrarConGoogle(datosRegistro());
    expect(prisma.usuario.create.mock.calls[0][0].data.id_rol).toBe(1);
  });

  test("con «Quiero ser tutor» → estudiante con solicitud pendiente", async () => {
    prisma.usuario.create.mockImplementation(async ({ data }) => usuarioGuardado({ id: 9, id_rol: data.id_rol }));

    const respuesta = await registrarConGoogle(datosRegistro({ quiero_ser_tutor: true, motivo_tutor: "Domino Cálculo" }));

    const { data } = prisma.usuario.create.mock.calls[0][0];
    expect(data.id_rol).toBe(1);
    expect(data.solicitudesTutor.create).toEqual({ id_estado: 3, motivo: "Domino Cálculo" });
    expect(respuesta.solicitud_tutor_pendiente).toBe(true);
  });

  test("motivo de tutor vacío → la solicitud se guarda sin motivo", async () => {
    prisma.usuario.create.mockImplementation(async ({ data }) => usuarioGuardado({ id: 9, id_rol: data.id_rol }));
    await registrarConGoogle(datosRegistro({ quiero_ser_tutor: "true", motivo_tutor: "   " }));
    expect(prisma.usuario.create.mock.calls[0][0].data.solicitudesTutor.create.motivo).toBeNull();
  });

  test("faltan datos académicos → 400 con la lista", async () => {
    await expect(registrarConGoogle(datosRegistro({ nombre_programa: undefined, semestre: undefined })))
      .rejects.toMatchObject({ status: 400, detalles: { faltantes: ["nombre_programa", "semestre"] } });
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  test("crea el usuario con el correo del token, aunque el body traiga otro", async () => {
    prisma.usuario.create.mockImplementation(async ({ data }) => usuarioGuardado({ correo: data.correo, id: 9 }));

    const respuesta = await registrarConGoogle(datosRegistro({ correo: "otra.persona@udea.edu.co", nombre: "Ana María" }));

    const { data } = prisma.usuario.create.mock.calls[0][0];
    expect(data.correo).toBe("ana.gomez@udea.edu.co");
    expect(data.nombre).toBe("Ana María"); // nombre y apellido sí se pueden corregir
    expect(data.contrasena_hash).toMatch(/^\$2[aby]\$/); // hash de una contraseña aleatoria
    expect(jwt.verify(respuesta.token, SECRETO)).toMatchObject({ id: 9, rol: 1 });
  });
});
