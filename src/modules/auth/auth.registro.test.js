import { beforeEach, describe, expect, test, vi } from "vitest";

// Registro normal: todos entran como estudiantes; "Quiero ser tutor" crea una solicitud pendiente.
// Incluye la COMPATIBILIDAD con el frontend anterior, que todavía envía id_rol.
vi.mock("../../lib/prisma.js", () => ({ prisma: { usuario: { create: vi.fn() } } }));

const { prisma } = await import("../../lib/prisma.js");
const { registrar } = await import("./auth.service.js");

const datos = (cambios = {}) => ({
  nombre: "Ana", apellido: "Gómez", id_tipo_documento: 1, num_documento: "1001", correo: "Ana@Ejemplo.co",
  contrasena: "minimo8chars", nombre_programa: "Ingeniería de Sistemas", semestre: 3, ...cambios,
});

// Lo que se intentó guardar en la BD
const guardado = () => prisma.usuario.create.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  prisma.usuario.create.mockImplementation(async ({ data }) => ({ id: 5, id_rol: data.id_rol, correo: data.correo }));
});

describe("registro sin rol (frontend nuevo)", () => {
  test("sin marcar «Quiero ser tutor» → estudiante sin solicitud", async () => {
    const respuesta = await registrar(datos());
    expect(guardado().id_rol).toBe(1);
    expect(guardado().solicitudesTutor).toBeUndefined();
    expect(guardado().correo).toBe("ana@ejemplo.co");
    expect(respuesta.solicitud_tutor_pendiente).toBe(false);
  });

  test("con «Quiero ser tutor» → estudiante + solicitud pendiente con su motivo", async () => {
    const respuesta = await registrar(datos({ quiero_ser_tutor: true, motivo_tutor: "  Domino Física  " }));
    expect(guardado().id_rol).toBe(1);
    expect(guardado().solicitudesTutor).toEqual({ create: { id_estado: 3, motivo: "Domino Física" } });
    expect(respuesta.solicitud_tutor_pendiente).toBe(true);
  });

  test("motivo vacío → la solicitud se guarda sin motivo", async () => {
    await registrar(datos({ quiero_ser_tutor: "true", motivo_tutor: "   " }));
    expect(guardado().solicitudesTutor.create.motivo).toBeNull();
  });
});

describe("COMPATIBILIDAD: frontend anterior que envía id_rol", () => {
  test("id_rol 1 → estudiante", async () => {
    await registrar(datos({ id_rol: 1 }));
    expect(guardado().id_rol).toBe(1);
    expect(guardado().solicitudesTutor).toBeUndefined();
  });

  test("id_rol 2 (eligió Tutor) → estudiante + solicitud pendiente, NO tutor", async () => {
    const respuesta = await registrar(datos({ id_rol: "2" }));
    expect(guardado().id_rol).toBe(1);
    expect(guardado().solicitudesTutor.create.id_estado).toBe(3);
    expect(respuesta.solicitud_tutor_pendiente).toBe(true);
  });

  test.each([3, 0, "abc", null])("id_rol %s → 400 «El rol no se elige en el registro»", async (idRol) => {
    await expect(registrar(datos({ id_rol: idRol }))).rejects.toMatchObject({
      status: 400, message: "El rol no se elige en el registro",
    });
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });
});

describe("validaciones que no cambian", () => {
  test("contraseña corta → 400", async () => {
    await expect(registrar(datos({ contrasena: "corta" }))).rejects.toMatchObject({ status: 400 });
  });

  test("faltan datos académicos → 400 con la lista", async () => {
    await expect(registrar(datos({ nombre_programa: undefined, semestre: undefined }))).rejects.toMatchObject({
      status: 400, detalles: { faltantes: ["nombre_programa", "semestre"] },
    });
  });
});
