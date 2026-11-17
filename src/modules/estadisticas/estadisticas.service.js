import { prisma } from "../../lib/prisma.js";
import { ESTADO } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";

// Estadísticas para el administrador. Solo lectura, sin tablas nuevas: todo sale de consultas
// agregadas. Las fechas se cuentan en hora de Bogotá, como el resto de la app.
//
// Período: las últimas `semanas` semanas (lunes a domingo), contando la actual.
// - Oferta actual (tutorías activas, horas semanales, tutores): no depende del período.
// - Reservas, cancelaciones, ocupación, valoraciones y solicitudes: sesiones o solicitudes del período.
// - "Reservas" = no canceladas (activas o completadas).
// - Ocupación de una sesión = reservas no canceladas / cupo actual de la tutoría, solo para sesiones
//   (horario + fecha) que tuvieron al menos una reserva. Las sesiones sin reservas no se pueden
//   contar: el horario semanal no guarda desde cuándo existe.

export const SEMANAS_POR_DEFECTO = 12;
const SEMANAS_MIN = 4;
const SEMANAS_MAX = 52;


function leerSemanas(valor) {
  if (valor === undefined || valor === "") return SEMANAS_POR_DEFECTO;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < SEMANAS_MIN || n > SEMANAS_MAX) {
    throw new AppError(400, `semanas debe ser un entero entre ${SEMANAS_MIN} y ${SEMANAS_MAX}`);
  }
  return n;
}

const redondear = (n, decimales = 1) => (n === null || n === undefined ? null : Number(Number(n).toFixed(decimales)));

/**
 * GET /api/estadisticas?semanas=12 — administrador.
 * { periodo, resumen, reservas_por_semana, por_materia, demanda_sin_oferta, valoraciones }
 */
export async function obtener({ semanas } = {}) {
  const n = leerSemanas(semanas);
  const ACTIVO = ESTADO.ACTIVO;
  const CANCELADO = ESTADO.CANCELADO;
  const ABIERTA = ESTADO.PENDIENTE;
  const VENCIDA = ESTADO.INACTIVO;

  // Lunes de la semana actual y lunes de la primera semana del período (Postgres: semanas ISO, desde lunes)
  const [{ desde, hasta, hoy }] = await prisma.$queryRaw`
    SELECT (date_trunc('week', hoy::timestamp) - make_interval(weeks => ${n - 1}))::date AS desde,
           (date_trunc('week', hoy::timestamp) + interval '6 days')::date AS hasta,
           hoy
    FROM (SELECT (now() AT TIME ZONE 'America/Bogota')::date AS hoy) AS h`;

  // Secuenciales: son pocas consultas y así no se compite por conexiones del pooler
  const [oferta] = await prisma.$queryRaw`
    SELECT count(DISTINCT t.id)::int AS tutorias_activas,
           count(DISTINCT t.id_tutor) FILTER (WHERE h.id IS NOT NULL)::int AS tutores_con_horarios,
           COALESCE(sum(EXTRACT(EPOCH FROM (h.hora_fin - h.hora_inicio)) / 3600), 0)::float8 AS horas_semanales
    FROM tbl_tutoria t
    LEFT JOIN tbl_horario h ON h.id_tutoria = t.id AND h.id_estado = ${ACTIVO}
    WHERE t.id_estado = ${ACTIVO}`;

  const [reservas] = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE id_estado <> ${CANCELADO})::int AS reservas,
           count(*) FILTER (WHERE id_estado = ${CANCELADO})::int AS canceladas
    FROM tbl_reserva WHERE fecha_sesion BETWEEN ${desde} AND ${hasta}`;

  const porSemana = await prisma.$queryRaw`
    SELECT s.semana::date AS semana,
           count(r.id) FILTER (WHERE r.id_estado <> ${CANCELADO})::int AS reservas,
           count(r.id) FILTER (WHERE r.id_estado = ${CANCELADO})::int AS canceladas
    FROM generate_series(${desde}::date::timestamp, (${hasta}::date - 6)::timestamp, interval '1 week') AS s(semana)
    LEFT JOIN tbl_reserva r ON date_trunc('week', r.fecha_sesion::timestamp) = s.semana
    GROUP BY s.semana ORDER BY s.semana`;

  const [ocupacion] = await prisma.$queryRaw`
    SELECT avg(LEAST(ses.reservas::float8 / NULLIF(t.cupo, 0), 1))::float8 AS promedio,
           count(*)::int AS sesiones
    FROM (
      SELECT r.id_horario, r.fecha_sesion, count(*) AS reservas
      FROM tbl_reserva r
      WHERE r.id_estado <> ${CANCELADO} AND r.fecha_sesion BETWEEN ${desde} AND ${hoy}
      GROUP BY r.id_horario, r.fecha_sesion
    ) AS ses
    JOIN tbl_horario h ON h.id = ses.id_horario
    JOIN tbl_tutoria t ON t.id = h.id_tutoria`;

  const distribucion = await prisma.$queryRaw`
    SELECT v.calificacion::int AS calificacion, count(*)::int AS cantidad
    FROM tbl_valoracion v JOIN tbl_reserva r ON r.id = v.id_reserva
    WHERE r.fecha_sesion BETWEEN ${desde} AND ${hasta}
    GROUP BY v.calificacion`;

  const porMateria = await prisma.$queryRaw`
    WITH oferta AS (
      SELECT t.id_materia, count(DISTINCT t.id)::int AS tutorias_activas,
             COALESCE(sum(EXTRACT(EPOCH FROM (h.hora_fin - h.hora_inicio)) / 3600), 0)::float8 AS horas_semanales
      FROM tbl_tutoria t LEFT JOIN tbl_horario h ON h.id_tutoria = t.id AND h.id_estado = ${ACTIVO}
      WHERE t.id_estado = ${ACTIVO} GROUP BY t.id_materia
    ), tutores AS (
      SELECT id_materia, count(*)::int AS tutores FROM tbl_materia_x_tutor GROUP BY id_materia
    ), sesiones AS (
      SELECT t.id_materia, r.id_horario, r.fecha_sesion, count(*) AS reservas, max(t.cupo) AS cupo
      FROM tbl_reserva r JOIN tbl_horario h ON h.id = r.id_horario JOIN tbl_tutoria t ON t.id = h.id_tutoria
      WHERE r.id_estado <> ${CANCELADO} AND r.fecha_sesion BETWEEN ${desde} AND ${hasta}
      GROUP BY t.id_materia, r.id_horario, r.fecha_sesion
    ), demanda AS (
      SELECT s.id_materia, sum(s.reservas)::int AS reservas,
             avg(LEAST(s.reservas::float8 / NULLIF(s.cupo, 0), 1)) FILTER (WHERE s.fecha_sesion <= ${hoy})::float8 AS ocupacion
      FROM sesiones s
      GROUP BY s.id_materia
    ), notas AS (
      SELECT t.id_materia, avg(v.calificacion)::float8 AS valoracion, count(*)::int AS valoraciones
      FROM tbl_valoracion v JOIN tbl_reserva r ON r.id = v.id_reserva
      JOIN tbl_horario h ON h.id = r.id_horario JOIN tbl_tutoria t ON t.id = h.id_tutoria
      WHERE r.fecha_sesion BETWEEN ${desde} AND ${hasta}
      GROUP BY t.id_materia
    ), pedidos AS (
      SELECT id_materia,
             count(*) FILTER (WHERE id_estado = ${ABIERTA})::int AS solicitudes_abiertas,
             count(*) FILTER (WHERE id_estado = ${VENCIDA} AND fecha >= ${desde})::int AS solicitudes_vencidas,
             count(*) FILTER (WHERE fecha >= ${desde})::int AS solicitudes_periodo
      FROM tbl_solicitud_tutoria GROUP BY id_materia
    )
    SELECT m.id, m.nombre, m.codigo,
           COALESCE(tu.tutores, 0) AS tutores,
           COALESCE(o.tutorias_activas, 0) AS tutorias_activas,
           COALESCE(o.horas_semanales, 0) AS horas_semanales,
           COALESCE(d.reservas, 0) AS reservas,
           d.ocupacion,
           n.valoracion, COALESCE(n.valoraciones, 0) AS valoraciones,
           COALESCE(p.solicitudes_abiertas, 0) AS solicitudes_abiertas,
           COALESCE(p.solicitudes_vencidas, 0) AS solicitudes_vencidas,
           COALESCE(p.solicitudes_periodo, 0) AS solicitudes_periodo
    FROM tbl_materia m
    LEFT JOIN tutores tu ON tu.id_materia = m.id
    LEFT JOIN oferta o ON o.id_materia = m.id
    LEFT JOIN demanda d ON d.id_materia = m.id
    LEFT JOIN notas n ON n.id_materia = m.id
    LEFT JOIN pedidos p ON p.id_materia = m.id
    WHERE COALESCE(tu.tutores, 0) + COALESCE(o.tutorias_activas, 0) + COALESCE(d.reservas, 0)
          + COALESCE(p.solicitudes_abiertas, 0) + COALESCE(p.solicitudes_periodo, 0) > 0
    ORDER BY COALESCE(d.reservas, 0) DESC, m.nombre`;

  const materias = porMateria.map((m) => ({
    ...m,
    horas_semanales: redondear(m.horas_semanales),
    ocupacion: redondear(m.ocupacion, 3),
    valoracion: redondear(m.valoracion, 2),
  }));
  const valoraciones = [1, 2, 3, 4, 5].map((c) => ({
    calificacion: c,
    cantidad: distribucion.find((d) => d.calificacion === c)?.cantidad ?? 0,
  }));
  const totalValoraciones = valoraciones.reduce((a, v) => a + v.cantidad, 0);
  const totalReservas = reservas.reservas + reservas.canceladas;

  return {
    periodo: { semanas: n, desde: fecha(desde), hasta: fecha(hasta), hoy: fecha(hoy) },
    resumen: {
      tutorias_activas: oferta.tutorias_activas,
      tutores_con_horarios: oferta.tutores_con_horarios,
      horas_semanales: redondear(oferta.horas_semanales),
      reservas: reservas.reservas,
      canceladas: reservas.canceladas,
      tasa_cancelacion: totalReservas ? redondear(reservas.canceladas / totalReservas, 3) : null,
      ocupacion_promedio: redondear(ocupacion.promedio, 3),
      sesiones_con_reservas: ocupacion.sesiones,
      valoracion_promedio: totalValoraciones
        ? redondear(valoraciones.reduce((a, v) => a + v.calificacion * v.cantidad, 0) / totalValoraciones, 2)
        : null,
      valoraciones: totalValoraciones,
      solicitudes_abiertas: materias.reduce((a, m) => a + m.solicitudes_abiertas, 0),
    },
    reservas_por_semana: porSemana.map((s) => ({ semana: fecha(s.semana), reservas: s.reservas, canceladas: s.canceladas })),
    por_materia: materias,
    // Materias que piden y no tienen ninguna tutoría activa: dónde hacen falta tutores
    demanda_sin_oferta: materias
      .filter((m) => m.tutorias_activas === 0 && m.solicitudes_abiertas + m.solicitudes_vencidas > 0)
      .map(({ id, nombre, codigo, tutores, solicitudes_abiertas, solicitudes_vencidas }) => ({
        id, nombre, codigo, tutores, solicitudes_abiertas, solicitudes_vencidas,
      }))
      .sort((a, b) => b.solicitudes_abiertas + b.solicitudes_vencidas - (a.solicitudes_abiertas + a.solicitudes_vencidas)),
    valoraciones,
  };
}

// DATE de Postgres (Date a medianoche UTC) → "2026-11-16"
const fecha = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
