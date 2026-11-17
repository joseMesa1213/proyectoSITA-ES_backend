import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    notificacion: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    usuario: { findMany: vi.fn() },
  },
}));

const { prisma } = await import("../../lib/prisma.js");
const n = await import("./notificaciones.service.js");

beforeEach(() => vi.clearAllMocks());

describe("crear avisos", () => {
  test("notificar: createMany con campos opcionales en null y título recortado a 200", async () => {
    prisma.notificacion.createMany.mockResolvedValue({ count: 2 });
    await n.notificar(prisma, [
      { id_usuario: 1, tipo: n.TIPO.RESERVA_NUEVA, titulo: "x".repeat(250) },
      null, // los avisos vacíos se ignoran
      { id_usuario: 2, tipo: n.TIPO.SESION_COMPLETADA, titulo: "Valore", mensaje: "m", enlace: "/mis-reservas" },
    ]);
    const datos = prisma.notificacion.createMany.mock.calls[0][0].data;
    expect(datos).toHaveLength(2);
    expect(datos[0]).toMatchObject({ id_usuario: 1, mensaje: null, enlace: null });
    expect(datos[0].titulo).toHaveLength(200);
    expect(datos[1]).toMatchObject({ id_usuario: 2, mensaje: "m", enlace: "/mis-reservas" });
  });

  test("notificar sin avisos no toca la BD", async () => {
    expect(await n.notificar(prisma, [])).toBe(0);
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  test("notificarAdministradores: a cada administrador activo", async () => {
    prisma.usuario.findMany.mockResolvedValue([{ id: 3 }, { id: 9 }]);
    prisma.notificacion.createMany.mockResolvedValue({ count: 2 });
    await n.notificarAdministradores(prisma, { tipo: n.TIPO.SOLICITUD_TUTOR_NUEVA, titulo: "Nueva" });
    expect(prisma.usuario.findMany.mock.calls[0][0].where).toEqual({ id_rol: 3, id_estado: 1 });
    expect(prisma.notificacion.createMany.mock.calls[0][0].data.map((d) => d.id_usuario)).toEqual([3, 9]);
  });

  test("fechaLegible en español", () => {
    expect(n.fechaLegible("2026-11-20")).toMatch(/^vie\.?, 20 de nov/);
    expect(n.fechaLegible(new Date("2026-11-20T00:00:00Z"))).toMatch(/20 de nov/);
  });
});

describe("consultar y marcar", () => {
  test("listar: conteo de no leídas y las más recientes, no leídas primero; limpia las leídas viejas", async () => {
    prisma.notificacion.count.mockResolvedValue(2);
    prisma.notificacion.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.notificacion.deleteMany.mockResolvedValue({ count: 0 });
    const r = await n.listar(7);
    expect(r).toEqual({ no_leidas: 2, notificaciones: [{ id: 1 }] });
    expect(prisma.notificacion.count.mock.calls[0][0].where).toEqual({ id_usuario: 7, leida: false });
    const consulta = prisma.notificacion.findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({ id_usuario: 7 });
    expect(consulta.orderBy[0]).toEqual({ leida: "asc" });
    expect(consulta.take).toBe(30);
  });

  test("limpiarLeidas: borra solo las leídas hace más de 30 días", async () => {
    prisma.notificacion.deleteMany.mockResolvedValue({ count: 4 });
    expect(await n.limpiarLeidas({ forzar: true })).toBe(4);
    const { where } = prisma.notificacion.deleteMany.mock.calls[0][0];
    expect(where.leida).toBe(true);
    const dias = (Date.now() - where.fecha_leida.lt.getTime()) / 86400000;
    expect(Math.round(dias)).toBe(30);
  });

  test("marcarLeida: solo las propias; de otro usuario o inexistente → 404", async () => {
    prisma.notificacion.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await n.marcarLeida(5, 7)).toEqual({ id: 5, leida: true });
    expect(prisma.notificacion.updateMany.mock.calls[0][0].where).toEqual({ id: 5, id_usuario: 7, leida: false });

    prisma.notificacion.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.notificacion.findFirst.mockResolvedValueOnce(null);
    await expect(n.marcarLeida(6, 7)).rejects.toMatchObject({ status: 404 });
  });

  test("marcarLeida: una ya leída no es error", async () => {
    prisma.notificacion.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.notificacion.findFirst.mockResolvedValueOnce({ id: 5 });
    expect(await n.marcarLeida(5, 7)).toEqual({ id: 5, leida: true });
  });

  test("marcarTodas: las no leídas del usuario", async () => {
    prisma.notificacion.updateMany.mockResolvedValue({ count: 3 });
    expect(await n.marcarTodas(7)).toEqual({ marcadas: 3 });
    expect(prisma.notificacion.updateMany.mock.calls[0][0].where).toEqual({ id_usuario: 7, leida: false });
  });

  test("avisarSinFallar: registra el error y no lo propaga", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(n.avisarSinFallar(() => Promise.reject(new Error("x")))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
