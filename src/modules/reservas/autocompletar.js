import { prisma } from "../../lib/prisma.js";
import { ESTADO } from "../../constants/catalogos.js";
import { TIPO } from "../notificaciones/notificaciones.service.js";

// Completar sesiones automáticamente: una reserva ACTIVA pasa a COMPLETADO cuando su sesión
// terminó hace más de HORAS_PARA_AUTOCOMPLETAR horas. Así el estudiante puede valorarla aunque
// el tutor no la marque. Dentro de ese plazo el tutor puede completarla él mismo o cancelar la de
// quien no asistió.
//
// No hay tarea programada (Render gratuito duerme el servidor): se ejecuta al consultar las
// reservas (GET /reservas/mias y /reservas/tutor), como máximo una vez cada INTERVALO_MS.
// Es una sola sentencia (UPDATE + aviso "valore su sesión" a cada estudiante, en el mismo INSERT);
// si falla, se registra y la consulta sigue normal.

export const HORAS_PARA_AUTOCOMPLETAR = 24;
const INTERVALO_MS = 5 * 60 * 1000;
let ultimaEjecucion = 0;

/** Devuelve cuántas reservas completó (0 si no tocaba ejecutarlo todavía). */
export async function completarVencidas({ forzar = false } = {}) {
  const momento = Date.now();
  if (!forzar && momento - ultimaEjecucion < INTERVALO_MS) return 0;
  ultimaEjecucion = momento;
  try {
    // fecha_sesion (DATE) + hora_fin (TIME) = fin de la sesión, en hora de Bogotá como el resto de la app.
    // Devuelve las filas insertadas en tbl_notificacion = una por reserva completada.
    return await prisma.$executeRaw`
      WITH completadas AS (
        UPDATE tbl_reserva AS r SET id_estado = ${ESTADO.COMPLETADO}
        FROM tbl_horario AS h
        JOIN tbl_tutoria AS t ON t.id = h.id_tutoria
        WHERE r.id_horario = h.id
          AND r.id_estado = ${ESTADO.ACTIVO}
          AND r.fecha_sesion + h.hora_fin
              < (now() AT TIME ZONE 'America/Bogota') - make_interval(hours => ${HORAS_PARA_AUTOCOMPLETAR})
        RETURNING r.id_usuario_estudiante, t.titulo, r.fecha_sesion
      )
      INSERT INTO tbl_notificacion (id_usuario, tipo, titulo, mensaje, enlace)
      SELECT id_usuario_estudiante, ${TIPO.SESION_COMPLETADA},
             left('Valore su sesión de «' || titulo || '»', 200),
             'Su sesión del ' || to_char(fecha_sesion, 'DD/MM/YYYY') || ' se completó automáticamente. Su valoración ayuda a otros estudiantes.',
             '/mis-reservas'
      FROM completadas`;
  } catch (err) {
    ultimaEjecucion = 0; // se reintenta en la próxima consulta
    console.error("No se pudieron completar las sesiones vencidas:", err.message);
    return 0;
  }
}
