import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: { $executeRaw: vi.fn() } }));
vi.mock("../notificaciones/notificaciones.service.js", () => ({ TIPO: { SESION_COMPLETADA: "sesion_completada" } }));

const { prisma } = await import("../../lib/prisma.js");
const { completarVencidas, HORAS_PARA_AUTOCOMPLETAR } = await import("./autocompletar.js");

// SQL de la plantilla y sus valores ($executeRaw recibe [partes de texto], ...valores)
const consulta = () => {
  const [partes, ...valores] = prisma.$executeRaw.mock.calls.at(-1);
  return { sql: partes.join("?"), valores };
};

beforeEach(() => vi.clearAllMocks());

describe("completarVencidas", () => {
  test("pasa a COMPLETADO las ACTIVAS cuya sesión terminó hace más de 24 h (hora de Bogotá) y avisa a cada estudiante", async () => {
    prisma.$executeRaw.mockResolvedValue(3);
    expect(await completarVencidas({ forzar: true })).toBe(3);
    const { sql, valores } = consulta();
    expect(sql).toContain("UPDATE tbl_reserva");
    expect(sql).toContain("r.fecha_sesion + h.hora_fin");
    expect(sql).toContain("America/Bogota");
    expect(sql).toContain("INSERT INTO tbl_notificacion");
    expect(sql).toContain("RETURNING r.id_usuario_estudiante");
    expect(valores).toEqual([5, 1, HORAS_PARA_AUTOCOMPLETAR, "sesion_completada"]); // COMPLETADO, ACTIVO, 24, tipo
    expect(HORAS_PARA_AUTOCOMPLETAR).toBe(24);
  });

  test("como mucho una vez cada 5 minutos", async () => {
    prisma.$executeRaw.mockResolvedValue(0);
    await completarVencidas({ forzar: true });
    expect(await completarVencidas()).toBe(0);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  test("si la BD falla no rompe la consulta y se reintenta la próxima vez", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.$executeRaw.mockRejectedValueOnce(new Error("conexión perdida")).mockResolvedValueOnce(2);
    expect(await completarVencidas({ forzar: true })).toBe(0);
    expect(await completarVencidas()).toBe(2); // sin esperar los 5 minutos
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
