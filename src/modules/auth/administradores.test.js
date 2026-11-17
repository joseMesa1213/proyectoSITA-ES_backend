import { beforeEach, describe, expect, test, vi } from "vitest";

// Lógica de `npm run crear-admin` (scripts/crear-admin.js solo hace las preguntas)
vi.mock("../../lib/prisma.js", () => ({
  prisma: { usuario: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));

const { prisma } = await import("../../lib/prisma.js");
const { crearAdministrador, esCorreoInstitucional, promoverAAdministrador } = await import("./administradores.service.js");

const datos = (cambios = {}) => ({
  correo: " Coordinacion@Ejemplo.co ", nombre: "Coordinación", apellido: "SITA", num_documento: "900",
  contrasena: "una-clave-larga", ...cambios,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.usuario.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
  prisma.usuario.update.mockImplementation(async ({ data }) => ({ id: 4, ...data }));
});

describe("crear administrador con correo @udea.edu.co (entra con Google)", () => {
  test("no pide contraseña: guarda el hash de una aleatoria", async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await crearAdministrador(datos({ correo: " Jose.Mesa@UdeA.edu.co ", contrasena: undefined }));
    const { data } = prisma.usuario.create.mock.calls[0][0];
    expect(data).toMatchObject({ correo: "jose.mesa@udea.edu.co", id_rol: 3, id_estado: 1 });
    expect(data.contrasena_hash).toMatch(/^\$2[aby]\$/);
  });

  test("si llega una contraseña se ignora (nadie la usará en producción)", async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await crearAdministrador(datos({ correo: "jose.mesa@udea.edu.co", contrasena: "corta" }));
    expect(prisma.usuario.create).toHaveBeenCalled();
  });

  test("solo cuenta el dominio exacto", () => {
    expect(esCorreoInstitucional("ana@udea.edu.co")).toBe(true);
    expect(esCorreoInstitucional("ana@noudea.edu.co")).toBe(false);
    expect(esCorreoInstitucional("ana@demo.sita-es.test")).toBe(false);
  });
});

describe("crear administrador con otro dominio (solo desarrollo)", () => {
  test("crea un usuario con id_rol 3, activo y con la contraseña cifrada", async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await crearAdministrador(datos());
    const { data } = prisma.usuario.create.mock.calls[0][0];
    expect(data).toMatchObject({ correo: "coordinacion@ejemplo.co", id_rol: 3, id_estado: 1 });
    expect(data.contrasena_hash).toMatch(/^\$2[aby]\$/);
    expect(data.contrasena_hash).not.toContain("una-clave-larga");
  });

  test("sin contraseña o con menos de 10 caracteres → 400", async () => {
    await expect(crearAdministrador(datos({ contrasena: "Udea123." }))).rejects.toMatchObject({ status: 400 });
    await expect(crearAdministrador(datos({ contrasena: undefined }))).rejects.toMatchObject({ status: 400 });
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  test("correo inválido → 400", async () => {
    await expect(crearAdministrador(datos({ correo: "sin-arroba" }))).rejects.toMatchObject({ status: 400 });
  });

  test("correo ya registrado → 409 (el script ofrece convertirlo)", async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 4, id_rol: 1 });
    await expect(crearAdministrador(datos())).rejects.toMatchObject({ status: 409 });
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });
});

describe("convertir un usuario existente en administrador", () => {
  test("estudiante o tutor → id_rol 3 y activo", async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 4, id_rol: 2, id_estado: 1 });
    await promoverAAdministrador("tutor@ejemplo.co");
    expect(prisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 4 }, data: { id_rol: 3, id_estado: 1 },
    }));
  });

  test("no existe → 404; ya es administrador → 409", async () => {
    prisma.usuario.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1, id_rol: 3, id_estado: 1 });
    await expect(promoverAAdministrador("nadie@ejemplo.co")).rejects.toMatchObject({ status: 404 });
    await expect(promoverAAdministrador("admin@ejemplo.co")).rejects.toMatchObject({ status: 409 });
  });
});
