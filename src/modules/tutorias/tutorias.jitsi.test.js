import { beforeEach, describe, expect, test, vi } from "vitest";
import { horaADate } from "../../utils/fechas.js";

// Se simula la BD. $transaction ejecuta la función con el mismo objeto simulado.
vi.mock("../../lib/prisma.js", () => {
  const prisma = {
    tutoria: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    recurso: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    horario: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    reserva: { findFirst: vi.fn(), groupBy: vi.fn() },
    materiaTutor: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  };
  prisma.$transaction = vi.fn((fn) => fn(prisma));
  return { prisma };
});

const { prisma } = await import("../../lib/prisma.js");
const tutorias = await import("./tutorias.service.js");
const recursos = await import("../recursos/recursos.service.js");

const TUTOR = 9;
const SALA = { id: 77, nombre: "Sala Jitsi · SQL", tipo: "Virtual", capacidad: 100, id_estado: 1, generado: true };
const tutoria = (cambios = {}) => ({
  id: 5, id_tutor: TUTOR, id_estado: 1, titulo: "SQL", modalidad: "Virtual", cupo: 10, id_recurso_enlace: null, ...cambios,
});
// Lo que devuelve findUnique con el include del tutor
const conDetalle = (cambios = {}) => ({
  ...tutoria(cambios), horarios: [], enlace: { ubicacion: "https://meet.jit.si/SITA-ES-SQL-abc" },
});
const datosCrear = { id_materia: 3, titulo: "SQL", nivel: "Básico", modalidad: "Virtual", cupo: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.recurso.create.mockResolvedValue(SALA);
});

describe("crear tutoría", () => {
  beforeEach(() => prisma.materiaTutor.findUnique.mockResolvedValue({ id_tutor: TUTOR, id_materia: 3 }));

  test("Virtual → crea su sala Jitsi (recurso generado) y devuelve el enlace", async () => {
    prisma.tutoria.create.mockResolvedValue(tutoria());
    prisma.tutoria.findUnique.mockResolvedValue(conDetalle({ id_recurso_enlace: 77 }));

    const creada = await tutorias.crear(TUTOR, datosCrear);

    const sala = prisma.recurso.create.mock.calls[0][0].data;
    expect(sala).toMatchObject({ tipo: "Virtual", capacidad: 100, generado: true, id_estado: 1 });
    expect(sala.ubicacion).toMatch(/^https:\/\/meet\.jit\.si\/SITA-ES-SQL-/);
    expect(prisma.tutoria.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { id_recurso_enlace: 77 } });
    expect(creada.enlace_reunion).toBe("https://meet.jit.si/SITA-ES-SQL-abc");
    expect(creada).not.toHaveProperty("enlace");
  });

  test("Presencial → sin sala y enlace_reunion null", async () => {
    prisma.tutoria.create.mockResolvedValue(tutoria({ modalidad: "Presencial" }));
    prisma.tutoria.findUnique.mockResolvedValue({ ...conDetalle({ modalidad: "Presencial" }), enlace: null });

    const creada = await tutorias.crear(TUTOR, { ...datosCrear, modalidad: "Presencial" });

    expect(prisma.recurso.create).not.toHaveBeenCalled();
    expect(creada.enlace_reunion).toBeNull();
  });

  test("Virtual con cupo mayor que la sala → 400 sin tocar la BD", async () => {
    await expect(tutorias.crear(TUTOR, { ...datosCrear, cupo: 150 })).rejects.toMatchObject({ status: 400 });
    expect(prisma.tutoria.create).not.toHaveBeenCalled();
  });
});

describe("actualizar tutoría", () => {
  test("pasar a Virtual → se le crea la sala", async () => {
    prisma.tutoria.findUnique
      .mockResolvedValueOnce(tutoria({ modalidad: "Presencial" })) // obtenerPropia
      .mockResolvedValueOnce(conDetalle({ id_recurso_enlace: 77 })); // respuesta
    prisma.horario.findMany.mockResolvedValue([]);
    prisma.tutoria.update.mockResolvedValue(tutoria());

    const actualizada = await tutorias.actualizar(5, TUTOR, { modalidad: "Virtual" });

    expect(prisma.recurso.create).toHaveBeenCalledTimes(1);
    expect(actualizada.enlace_reunion).toMatch(/^https:\/\/meet\.jit\.si\//);
  });

  test("Virtual que ya tiene sala → no crea otra", async () => {
    prisma.tutoria.findUnique
      .mockResolvedValueOnce(tutoria({ id_recurso_enlace: 77 }))
      .mockResolvedValueOnce(conDetalle({ id_recurso_enlace: 77 }));
    prisma.horario.findMany.mockResolvedValue([]);
    prisma.tutoria.update.mockResolvedValue(tutoria({ id_recurso_enlace: 77, titulo: "SQL avanzado" }));

    await tutorias.actualizar(5, TUTOR, { titulo: "SQL avanzado" });

    expect(prisma.recurso.create).not.toHaveBeenCalled();
  });

  test("subir el cupo de una Virtual por encima de la sala → 400", async () => {
    prisma.tutoria.findUnique.mockResolvedValueOnce(tutoria({ id_recurso_enlace: 77 }));
    prisma.horario.findMany.mockResolvedValue([]);

    await expect(tutorias.actualizar(5, TUTOR, { cupo: 101 })).rejects.toMatchObject({ status: 400 });
    expect(prisma.tutoria.update).not.toHaveBeenCalled();
  });
});

describe("agregar horario", () => {
  const datosHorario = { dia: "Lunes", hora_inicio: "18:00", hora_fin: "19:00" };
  const horarioCreado = (idRecurso) => ({
    id: 40, id_tutoria: 5, id_estado: 1, dia: "Lunes",
    hora_inicio: horaADate("18:00"), hora_fin: horaADate("19:00"),
    recurso: { id: idRecurso, nombre: "Sala", tipo: "Virtual" },
  });

  test("Virtual sin id_recurso → usa la sala Jitsi de la tutoría", async () => {
    prisma.tutoria.findUnique.mockResolvedValue(tutoria({ id_recurso_enlace: 77 }));
    prisma.recurso.findUnique.mockResolvedValue(SALA);
    prisma.horario.findFirst.mockResolvedValue(null);
    prisma.reserva.findFirst.mockResolvedValue(null);
    prisma.horario.create.mockResolvedValue(horarioCreado(77));

    await tutorias.agregarHorario(5, TUTOR, datosHorario);

    expect(prisma.horario.create.mock.calls[0][0].data.id_recurso).toBe(77);
    expect(prisma.recurso.create).not.toHaveBeenCalled();
  });

  test("Virtual: un id_recurso enviado se ignora", async () => {
    prisma.tutoria.findUnique.mockResolvedValue(tutoria({ id_recurso_enlace: 77 }));
    prisma.recurso.findUnique.mockResolvedValue(SALA);
    prisma.horario.findFirst.mockResolvedValue(null);
    prisma.reserva.findFirst.mockResolvedValue(null);
    prisma.horario.create.mockResolvedValue(horarioCreado(77));

    await tutorias.agregarHorario(5, TUTOR, { ...datosHorario, id_recurso: 2 });

    expect(prisma.horario.create.mock.calls[0][0].data.id_recurso).toBe(77);
  });

  test("Virtual creada antes de las salas Jitsi → la sala se crea en ese momento", async () => {
    prisma.tutoria.findUnique.mockResolvedValue(tutoria());
    prisma.recurso.findUnique.mockResolvedValue(SALA);
    prisma.horario.findFirst.mockResolvedValue(null);
    prisma.reserva.findFirst.mockResolvedValue(null);
    prisma.horario.create.mockResolvedValue(horarioCreado(77));

    await tutorias.agregarHorario(5, TUTOR, datosHorario);

    expect(prisma.recurso.create).toHaveBeenCalledTimes(1);
    expect(prisma.horario.create.mock.calls[0][0].data.id_recurso).toBe(77);
  });

  test("Presencial sin id_recurso → 400", async () => {
    prisma.tutoria.findUnique.mockResolvedValue(tutoria({ modalidad: "Presencial" }));
    await expect(tutorias.agregarHorario(5, TUTOR, datosHorario)).rejects.toMatchObject({ status: 400 });
    expect(prisma.horario.create).not.toHaveBeenCalled();
  });
});

describe("recursos y salas generadas", () => {
  test("el listado nunca incluye las salas Jitsi", async () => {
    prisma.recurso.findMany.mockResolvedValue([]);
    await recursos.listar({ rol: 3 });
    expect(prisma.recurso.findMany.mock.calls[0][0].where).toEqual({ generado: false });
  });

  test("el administrador no puede editar una sala Jitsi → 409", async () => {
    prisma.recurso.findUnique.mockResolvedValue(SALA);
    await expect(recursos.actualizar(77, { capacidad: 5 })).rejects.toMatchObject({ status: 409 });
    expect(prisma.recurso.update).not.toHaveBeenCalled();
  });
});
