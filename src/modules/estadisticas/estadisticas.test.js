import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: { $queryRaw: vi.fn() } }));
const { prisma } = await import("../../lib/prisma.js");
const { obtener } = await import("./estadisticas.service.js");

const D = (t) => new Date(`${t}T00:00:00Z`);
// Respuestas en el orden en que el servicio consulta
function simular({ porMateria = [], distribucion = [], reservas = { reservas: 9, canceladas: 1 } } = {}) {
  prisma.$queryRaw
    .mockResolvedValueOnce([{ desde: D("2026-08-31"), hasta: D("2026-11-22"), hoy: D("2026-11-18") }])
    .mockResolvedValueOnce([{ tutorias_activas: 4, tutores_con_horarios: 3, horas_semanales: 10.5 }])
    .mockResolvedValueOnce([reservas])
    .mockResolvedValueOnce([{ semana: D("2026-11-09"), reservas: 4, canceladas: 1 }, { semana: D("2026-11-16"), reservas: 5, canceladas: 0 }])
    .mockResolvedValueOnce([{ promedio: 0.41666, sesiones: 6 }])
    .mockResolvedValueOnce(distribucion)
    .mockResolvedValueOnce(porMateria);
}

beforeEach(() => vi.clearAllMocks());

describe("estadísticas", () => {
  test("arma el resumen, las semanas, la distribución 1–5 y la demanda sin oferta", async () => {
    simular({
      distribucion: [{ calificacion: 5, cantidad: 3 }, { calificacion: 3, cantidad: 1 }],
      porMateria: [
        { id: 1, nombre: "Cálculo", codigo: "1", tutores: 2, tutorias_activas: 2, horas_semanales: 6.333, reservas: 9, ocupacion: 0.41666, valoracion: 4.5, valoraciones: 4, solicitudes_abiertas: 0, solicitudes_vencidas: 0, solicitudes_periodo: 0 },
        { id: 2, nombre: "Química", codigo: "2", tutores: 0, tutorias_activas: 0, horas_semanales: 0, reservas: 0, ocupacion: null, valoracion: null, valoraciones: 0, solicitudes_abiertas: 1, solicitudes_vencidas: 2, solicitudes_periodo: 3 },
        { id: 3, nombre: "Física", codigo: "3", tutores: 1, tutorias_activas: 0, horas_semanales: 0, reservas: 0, ocupacion: null, valoracion: null, valoraciones: 0, solicitudes_abiertas: 0, solicitudes_vencidas: 0, solicitudes_periodo: 0 },
      ],
    });
    const r = await obtener({});
    expect(r.periodo).toEqual({ semanas: 12, desde: "2026-08-31", hasta: "2026-11-22", hoy: "2026-11-18" });
    expect(r.resumen).toMatchObject({
      tutorias_activas: 4, horas_semanales: 10.5, reservas: 9, canceladas: 1, tasa_cancelacion: 0.1,
      ocupacion_promedio: 0.417, sesiones_con_reservas: 6, valoracion_promedio: 4.5, valoraciones: 4, solicitudes_abiertas: 1,
    });
    expect(r.reservas_por_semana).toEqual([
      { semana: "2026-11-09", reservas: 4, canceladas: 1 }, { semana: "2026-11-16", reservas: 5, canceladas: 0 },
    ]);
    expect(r.valoraciones.map((v) => v.cantidad)).toEqual([0, 0, 1, 0, 3]);
    expect(r.por_materia[0]).toMatchObject({ horas_semanales: 6.3, ocupacion: 0.417 });
    // Solo la que pide y no tiene tutorías activas (Física no tiene pedidos)
    expect(r.demanda_sin_oferta).toEqual([
      { id: 2, nombre: "Química", codigo: "2", tutores: 0, solicitudes_abiertas: 1, solicitudes_vencidas: 2 },
    ]);
  });

  test("sin reservas ni valoraciones: tasas y promedios en null (no 0 ni NaN)", async () => {
    simular({ reservas: { reservas: 0, canceladas: 0 } });
    const r = await obtener({ semanas: "4" });
    expect(r.periodo.semanas).toBe(4);
    expect(r.resumen.tasa_cancelacion).toBeNull();
    expect(r.resumen.valoracion_promedio).toBeNull();
  });

  test("semanas fuera de 4–52 o no entero → 400 sin consultar", async () => {
    for (const v of ["3", "53", "2.5", "x"]) {
      await expect(obtener({ semanas: v })).rejects.toMatchObject({ status: 400 });
    }
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
