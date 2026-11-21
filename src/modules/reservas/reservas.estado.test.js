import { beforeEach, describe, expect, test, vi } from "vitest";

// BD simulada; $transaction ejecuta la función con el mismo objeto
vi.mock("../../lib/prisma.js", () => {
  const prisma = {
    reserva: { findUnique: vi.fn(), updateMany: vi.fn() },
    notificacion: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.$transaction = vi.fn((fn) => fn(prisma));
  return { prisma };
});
vi.mock("./autocompletar.js", () => ({ completarVencidas: vi.fn() }));

const { prisma } = await import("../../lib/prisma.js");
const s = await import("./reservas.service.js");

const TUTOR = 20;
const ESTUDIANTE = 7;
const PASADA = "2020-03-02";
const FUTURA = "2099-03-02";

// Reserva como la devuelve la BD (fechas y horas como Date)
const fila = ({ fecha = PASADA, id_estado = 1, no_asistio = false } = {}) => ({
  id: 50,
  id_usuario_estudiante: ESTUDIANTE,
  id_estado,
  no_asistio,
  fecha_sesion: new Date(`${fecha}T00:00:00Z`),
  estado: { nombre: id_estado === 4 ? "Cancelado" : id_estado === 5 ? "Completado" : "Activo" },
  recurso: { id: 1, nombre: "Aula 1", tipo: "Salón", ubicacion: "Bloque 19" },
  valoracion: null,
  estudiante: { nombre: "Ana", apellido: "Pérez" },
  horario: {
    id: 9,
    dia: "Lunes",
    hora_inicio: new Date("1970-01-01T14:00:00Z"),
    hora_fin: new Date("1970-01-01T16:00:00Z"),
    tutoria: { id: 3, titulo: "Derivadas", id_tutor: TUTOR },
  },
});

// La primera lectura es la de obtenerReserva; la segunda, la de después del UPDATE
const prepararReserva = (fecha, estadoFinal, extra = {}) => {
  prisma.reserva.findUnique
    .mockResolvedValueOnce(fila({ fecha }))
    .mockResolvedValueOnce(fila({ fecha, id_estado: estadoFinal, ...extra }));
  prisma.reserva.updateMany.mockResolvedValue({ count: 1 });
};
const actualizacion = () => prisma.reserva.updateMany.mock.calls.at(-1)[0];
const aviso = () => prisma.notificacion.createMany.mock.calls.at(-1)[0].data[0];

beforeEach(() => vi.clearAllMocks());

describe("cancelar", () => {
  test("el tutor, con la sesión ya terminada → inasistencia: CANCELADO + no_asistio y aviso al estudiante", async () => {
    prepararReserva(PASADA, 4, { no_asistio: true });
    const r = await s.cancelar(50, TUTOR);
    expect(actualizacion()).toEqual({ where: { id: 50, id_estado: 1 }, data: { id_estado: 4, no_asistio: true } });
    expect(r).toMatchObject({ estado: "Cancelado", no_asistio: true });
    expect(aviso()).toMatchObject({
      id_usuario: ESTUDIANTE,
      tipo: "reserva_cancelada",
      titulo: "Inasistencia en «Derivadas»",
      enlace: "/mis-reservas",
    });
    expect(aviso().mensaje).toContain("registró que no asistió");
  });

  test("el tutor, antes de la sesión → cancelación normal, sin no_asistio", async () => {
    prepararReserva(FUTURA, 4);
    await s.cancelar(50, TUTOR);
    expect(actualizacion().data).toEqual({ id_estado: 4 });
    expect(aviso()).toMatchObject({ id_usuario: ESTUDIANTE, titulo: "Su tutor canceló su reserva en «Derivadas»" });
  });

  test("el estudiante, aunque la sesión ya pasó → cancelación normal y aviso al tutor", async () => {
    prepararReserva(PASADA, 4);
    await s.cancelar(50, ESTUDIANTE);
    expect(actualizacion().data).toEqual({ id_estado: 4 });
    expect(aviso()).toMatchObject({ id_usuario: TUTOR, titulo: "Reserva cancelada en «Derivadas»" });
  });

  test("ya no está ACTIVA → 409", async () => {
    prisma.reserva.findUnique.mockResolvedValueOnce(fila());
    prisma.reserva.updateMany.mockResolvedValue({ count: 0 });
    await expect(s.cancelar(50, TUTOR)).rejects.toMatchObject({ status: 409 });
    expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
  });

  test("otra persona → 403", async () => {
    prisma.reserva.findUnique.mockResolvedValueOnce(fila());
    await expect(s.cancelar(50, 99)).rejects.toMatchObject({ status: 403 });
  });
});

describe("completar", () => {
  test("sesión terminada → COMPLETADO y aviso para valorar", async () => {
    prepararReserva(PASADA, 5);
    const r = await s.completar(50, TUTOR);
    expect(actualizacion().data).toEqual({ id_estado: 5 });
    expect(r.estado).toBe("Completado");
    expect(aviso()).toMatchObject({ id_usuario: ESTUDIANTE, tipo: "sesion_completada" });
  });

  test("sesión que aún no termina → 409", async () => {
    prisma.reserva.findUnique.mockResolvedValueOnce(fila({ fecha: FUTURA }));
    await expect(s.completar(50, TUTOR)).rejects.toMatchObject({ status: 409 });
    expect(prisma.reserva.updateMany).not.toHaveBeenCalled();
  });
});
