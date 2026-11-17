import { beforeEach, describe, expect, test, vi } from "vitest";

// BD simulada; $transaction ejecuta la función con el mismo objeto
vi.mock("../../lib/prisma.js", () => {
  const prisma = {
    materia: { findUnique: vi.fn() },
    materiaTutor: { findMany: vi.fn() },
    solicitudTutoria: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    tutoria: { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn() },
    notificacion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: vi.fn(),
  };
  prisma.$transaction = vi.fn((fn) => fn(prisma));
  return { prisma };
});

const { prisma } = await import("../../lib/prisma.js");
const s = await import("./solicitudes-tutoria.service.js");

const ESTUDIANTE = { id: 7, rol: 1 };
const fila = (cambios = {}) => ({ id: 40, id_estudiante: 7, id_materia: 3, tema: "Integrales", id_estado: 3, estado: { nombre: "Pendiente" }, ...cambios });
const avisos = () => prisma.notificacion.createMany.mock.calls.at(-1)[0].data;

beforeEach(() => vi.clearAllMocks());

describe("crear", () => {
  beforeEach(() => {
    prisma.materia.findUnique.mockResolvedValue({ id: 3, nombre: "Cálculo Integral" });
    prisma.solicitudTutoria.count.mockResolvedValue(0);
    prisma.solicitudTutoria.create.mockResolvedValue(fila());
    prisma.materiaTutor.findMany.mockResolvedValue([{ id_tutor: 20 }, { id_tutor: 21 }]);
  });

  test("abierta y aviso a cada tutor activo de la materia (sin quien pide)", async () => {
    const r = await s.crear(ESTUDIANTE, { id_materia: "3", tema: "  Integrales por partes ", disponibilidad: "martes tarde" });
    expect(r.estado).toBe("Pendiente");
    expect(prisma.solicitudTutoria.create.mock.calls[0][0].data).toMatchObject({
      id_estudiante: 7, id_materia: 3, tema: "Integrales por partes", disponibilidad: "martes tarde", descripcion: null, id_estado: 3,
    });
    expect(prisma.materiaTutor.findMany.mock.calls[0][0].where).toMatchObject({ id_materia: 3, id_tutor: { not: 7 } });
    expect(avisos().map((a) => a.id_usuario)).toEqual([20, 21]);
    expect(avisos()[0]).toMatchObject({
      tipo: "solicitud_tutoria_nueva", titulo: "Piden una tutoría de Cálculo Integral: «Integrales por partes»",
      mensaje: "Disponibilidad: martes tarde", enlace: "/tutor/solicitudes",
    });
  });

  test("con 3 abiertas → 409 sin crear", async () => {
    prisma.solicitudTutoria.count.mockResolvedValue(3);
    await expect(s.crear(ESTUDIANTE, { id_materia: 3, tema: "x" })).rejects.toMatchObject({ status: 409 });
    expect(prisma.solicitudTutoria.create).not.toHaveBeenCalled();
  });

  test("tema vacío → 400; materia inexistente → 404; disponibilidad larga → 400", async () => {
    await expect(s.crear(ESTUDIANTE, { id_materia: 3, tema: "   " })).rejects.toMatchObject({ status: 400 });
    await expect(s.crear(ESTUDIANTE, { id_materia: 3, tema: "x", disponibilidad: "a".repeat(301) })).rejects.toMatchObject({ status: 400 });
    prisma.materia.findUnique.mockResolvedValue(null);
    await expect(s.crear(ESTUDIANTE, { id_materia: 99, tema: "x" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("retirar", () => {
  test("solo abiertas de quien la pidió", async () => {
    prisma.solicitudTutoria.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.solicitudTutoria.findUnique.mockResolvedValueOnce(fila({ id_estado: 4, estado: { nombre: "Cancelado" } }));
    expect((await s.retirar(40, 7)).id_estado).toBe(4);
    expect(prisma.solicitudTutoria.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 40, id_estudiante: 7, id_estado: 3 }, data: { id_estado: 4 },
    });
  });

  test("ajena → 404; ya atendida → 409", async () => {
    prisma.solicitudTutoria.updateMany.mockResolvedValue({ count: 0 });
    prisma.solicitudTutoria.findFirst.mockResolvedValueOnce(null);
    await expect(s.retirar(40, 8)).rejects.toMatchObject({ status: 404 });
    prisma.solicitudTutoria.findFirst.mockResolvedValueOnce({ id: 40 });
    await expect(s.retirar(40, 7)).rejects.toMatchObject({ status: 409 });
  });
});

describe("atender", () => {
  const TUTORIA = { id: 12, id_tutor: 20, id_materia: 3, id_estado: 1, titulo: "Integrales sin miedo" };

  test("con una tutoría propia y activa de la materia: atendida y aviso al estudiante con el enlace", async () => {
    prisma.tutoria.findUnique.mockResolvedValue(TUTORIA);
    prisma.solicitudTutoria.findUnique.mockResolvedValueOnce(fila()).mockResolvedValueOnce(fila({ id_estado: 5, estado: { nombre: "Completado" } }));
    prisma.solicitudTutoria.updateMany.mockResolvedValue({ count: 1 });
    prisma.usuario.findUnique.mockResolvedValue({ nombre: "Ana", apellido: "Ruiz" });

    const r = await s.atender(40, 20, { id_tutoria: 12 });
    expect(r.id_estado).toBe(5);
    expect(prisma.solicitudTutoria.updateMany.mock.calls[0][0].where).toEqual({ id: 40, id_estado: 3 });
    expect(prisma.solicitudTutoria.updateMany.mock.calls[0][0].data).toMatchObject({ id_estado: 5, id_tutor: 20, id_tutoria: 12 });
    expect(avisos()).toEqual([expect.objectContaining({
      id_usuario: 7, tipo: "solicitud_tutoria_atendida", enlace: "/tutorias/12",
      mensaje: "Ana Ruiz ofrece «Integrales sin miedo». Reserve uno de sus horarios.",
    })]);
  });

  test("tutoría ajena → 404; inactiva → 409", async () => {
    prisma.tutoria.findUnique.mockResolvedValueOnce({ ...TUTORIA, id_tutor: 99 });
    await expect(s.atender(40, 20, { id_tutoria: 12 })).rejects.toMatchObject({ status: 404 });
    prisma.tutoria.findUnique.mockResolvedValueOnce({ ...TUTORIA, id_estado: 2 });
    await expect(s.atender(40, 20, { id_tutoria: 12 })).rejects.toMatchObject({ status: 409 });
  });

  test("otro tutor se adelantó → 409 (y nadie recibe aviso)", async () => {
    prisma.tutoria.findUnique.mockResolvedValue(TUTORIA);
    prisma.solicitudTutoria.findUnique.mockResolvedValue(fila());
    prisma.solicitudTutoria.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.atender(40, 20, { id_tutoria: 12 })).rejects.toMatchObject({ status: 409 });
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  test("atenderEnTx: propia → 409; otra materia → 400", async () => {
    prisma.solicitudTutoria.findUnique.mockResolvedValueOnce(fila({ id_estudiante: 20 }));
    await expect(s.atenderEnTx(prisma, 40, 20, TUTORIA)).rejects.toMatchObject({ status: 409 });
    prisma.solicitudTutoria.findUnique.mockResolvedValueOnce(fila({ id_materia: 4 }));
    await expect(s.atenderEnTx(prisma, 40, 20, TUTORIA)).rejects.toMatchObject({ status: 400 });
  });
});

describe("listar y vencer", () => {
  test("para el tutor: abiertas de sus materias, sin las propias, la más antigua primero", async () => {
    prisma.solicitudTutoria.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([fila()]); // vencer, listar
    prisma.materiaTutor.findMany.mockResolvedValue([{ id_materia: 3 }, { id_materia: 5 }]);
    await s.vencerAntiguas({ forzar: true });
    const r = await s.listarParaTutor(20);
    expect(r).toHaveLength(1);
    const consulta = prisma.solicitudTutoria.findMany.mock.calls.at(-1)[0];
    expect(consulta.where).toEqual({ id_estado: 3, id_materia: { in: [3, 5] }, id_estudiante: { not: 20 } });
    expect(consulta.orderBy[0]).toEqual({ fecha: "asc" });
    // El include del estudiante nunca trae correo
    expect(consulta.include.estudiante.select).toEqual({ id: true, nombre: true, apellido: true });
  });

  test("tutor sin materias: lista vacía sin consultar solicitudes", async () => {
    prisma.materiaTutor.findMany.mockResolvedValue([]);
    expect(await s.listarParaTutor(20)).toEqual([]);
  });

  test("vencerAntiguas: abiertas de más de 30 días → vencidas, con aviso", async () => {
    prisma.solicitudTutoria.findMany.mockResolvedValue([{ id: 1, id_estudiante: 7, tema: "Series" }]);
    prisma.solicitudTutoria.updateMany.mockResolvedValue({ count: 1 });
    expect(await s.vencerAntiguas({ forzar: true })).toBe(1);
    const { where } = prisma.solicitudTutoria.findMany.mock.calls[0][0];
    expect(where.id_estado).toBe(3);
    expect(Math.round((Date.now() - where.fecha.lt.getTime()) / 86400000)).toBe(30);
    expect(prisma.solicitudTutoria.updateMany.mock.calls[0][0].data).toEqual({ id_estado: 2 });
    expect(avisos()[0]).toMatchObject({ id_usuario: 7, tipo: "solicitud_tutoria_vencida", enlace: "/solicitudes" });
  });
});
