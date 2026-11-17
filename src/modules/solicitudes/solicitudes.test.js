import { beforeEach, describe, expect, test, vi } from "vitest";

// Se simula la BD. $transaction ejecuta la función con el mismo objeto simulado.
vi.mock("../../lib/prisma.js", () => {
  const prisma = {
    solicitudTutor: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    usuario: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
    notificacion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.$transaction = vi.fn((fn) => fn(prisma));
  return { prisma };
});

const { prisma } = await import("../../lib/prisma.js");
const solicitudes = await import("./solicitudes.service.js");

const ESTUDIANTE = { id: 7, rol: 1 };
const fila = (cambios = {}) => ({ id: 30, id_usuario: 7, id_estado: 3, estado: { nombre: "Pendiente" }, ...cambios });

beforeEach(() => vi.clearAllMocks());

describe("crear solicitud", () => {
  test("estudiante → solicitud pendiente con su motivo", async () => {
    prisma.solicitudTutor.create.mockResolvedValue(fila({ motivo: "Domino Cálculo", usuario: { nombre: "Ana", apellido: "Ruiz" } }));
    const solicitud = await solicitudes.crear(ESTUDIANTE, { motivo: "  Domino Cálculo " });
    expect(prisma.solicitudTutor.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id_usuario: 7, id_estado: 3, motivo: "Domino Cálculo" } })
    );
    expect(solicitud.estado).toBe("Pendiente");
    // Aviso a cada administrador activo
    const avisos = prisma.notificacion.createMany.mock.calls[0][0].data;
    expect(avisos.map((a) => a.id_usuario)).toEqual([1, 2]);
    expect(avisos[0]).toMatchObject({ tipo: "solicitud_tutor_nueva", titulo: "Nueva solicitud para ser tutor: Ana Ruiz", enlace: "/admin/solicitudes" });
  });

  test("si avisar a los administradores falla, la solicitud igual se crea", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.solicitudTutor.create.mockResolvedValue(fila({ usuario: { nombre: "Ana", apellido: "Ruiz" } }));
    prisma.notificacion.createMany.mockRejectedValueOnce(new Error("BD"));
    expect((await solicitudes.crear(ESTUDIANTE, {})).estado).toBe("Pendiente");
    error.mockRestore();
  });

  test("ya es tutor → 409 sin tocar la BD", async () => {
    await expect(solicitudes.crear({ id: 8, rol: 2 }, {})).rejects.toMatchObject({ status: 409, message: "Usted ya es tutor" });
    expect(prisma.solicitudTutor.create).not.toHaveBeenCalled();
  });

  test("ya tiene una pendiente (índice único parcial, P2002) → 409", async () => {
    prisma.solicitudTutor.create.mockRejectedValue(Object.assign(new Error("único"), { code: "P2002" }));
    await expect(solicitudes.crear(ESTUDIANTE, {})).rejects.toMatchObject({
      status: 409, message: "Ya tiene una solicitud pendiente de revisión",
    });
  });
});

describe("consultar", () => {
  test("mía: la más reciente, o null si nunca ha solicitado", async () => {
    prisma.solicitudTutor.findFirst.mockResolvedValueOnce(fila()).mockResolvedValueOnce(null);
    expect((await solicitudes.obtenerMia(7)).estado).toBe("Pendiente");
    expect(await solicitudes.obtenerMia(7)).toBeNull();
    expect(prisma.solicitudTutor.findFirst.mock.calls[0][0].orderBy[0]).toEqual({ fecha_solicitud: "desc" });
  });

  test("listar: pendientes por defecto (de la más antigua a la más nueva)", async () => {
    prisma.solicitudTutor.findMany.mockResolvedValue([fila()]);
    await solicitudes.listar({});
    const consulta = prisma.solicitudTutor.findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({ id_estado: 3 });
    expect(consulta.orderBy[0]).toEqual({ fecha_solicitud: "asc" });
  });

  test("listar: historial = aprobadas y rechazadas", async () => {
    prisma.solicitudTutor.findMany.mockResolvedValue([]);
    await solicitudes.listar({ estado: "historial" });
    expect(prisma.solicitudTutor.findMany.mock.calls[0][0].where).toEqual({ id_estado: { in: [6, 7] } });
  });

  test("listar: estado desconocido → 400", async () => {
    await expect(solicitudes.listar({ estado: "todas" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("aprobar y rechazar", () => {
  test("aprobar → solicitud Aprobada y el estudiante sube a tutor (id_rol 1 → 2)", async () => {
    prisma.solicitudTutor.updateMany.mockResolvedValue({ count: 1 });
    prisma.solicitudTutor.findUnique
      .mockResolvedValueOnce({ id_usuario: 7 })
      .mockResolvedValueOnce(fila({ id_estado: 6, estado: { nombre: "Aprobado" }, id_revisor: 1 }));

    const solicitud = await solicitudes.aprobar(30, 1, {});

    expect(prisma.solicitudTutor.updateMany).toHaveBeenCalledWith({
      where: { id: 30, id_estado: 3 },
      data: expect.objectContaining({ id_estado: 6, id_revisor: 1, observacion: null }),
    });
    // Solo sube a quien sigue siendo estudiante: un administrador no baja a tutor
    expect(prisma.usuario.updateMany).toHaveBeenCalledWith({ where: { id: 7, id_rol: 1 }, data: { id_rol: 2 } });
    expect(solicitud.estado).toBe("Aprobado");
    expect(prisma.notificacion.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ id_usuario: 7, tipo: "solicitud_tutor_aprobada", enlace: "/tutor/materias" }),
    ]);
  });

  test("rechazar → Rechazada con observación, sin cambiar el rol", async () => {
    prisma.solicitudTutor.updateMany.mockResolvedValue({ count: 1 });
    prisma.solicitudTutor.findUnique.mockResolvedValue(fila({ id_estado: 7, estado: { nombre: "Rechazado" } }));

    await solicitudes.rechazar(30, 1, { observacion: " Faltan datos de las materias " });

    expect(prisma.solicitudTutor.updateMany.mock.calls[0][0].data).toMatchObject({ id_estado: 7, observacion: "Faltan datos de las materias" });
    expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificacion.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ id_usuario: 7, tipo: "solicitud_tutor_rechazada", mensaje: "Motivo: Faltan datos de las materias" }),
    ]);
  });

  test("rechazar sin observación → 400", async () => {
    await expect(solicitudes.rechazar(30, 1, { observacion: "  " })).rejects.toMatchObject({ status: 400 });
    expect(prisma.solicitudTutor.updateMany).not.toHaveBeenCalled();
  });

  test("ya revisada (otro administrador se adelantó) → 409", async () => {
    prisma.solicitudTutor.updateMany.mockResolvedValue({ count: 0 });
    prisma.solicitudTutor.findUnique.mockResolvedValue({ id: 30 });
    await expect(solicitudes.aprobar(30, 1, {})).rejects.toMatchObject({ status: 409 });
    expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
  });

  test("no existe → 404", async () => {
    prisma.solicitudTutor.updateMany.mockResolvedValue({ count: 0 });
    prisma.solicitudTutor.findUnique.mockResolvedValue(null);
    await expect(solicitudes.rechazar(999, 1, { observacion: "x" })).rejects.toMatchObject({ status: 404 });
  });
});
