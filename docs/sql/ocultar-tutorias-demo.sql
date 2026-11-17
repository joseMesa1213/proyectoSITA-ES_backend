-- =============================================================================
-- SITA-ES — Ocultar las tutorías de los tutores de demostración (@demo.sita-es.test)
--
-- Paso POSTERIOR al despliegue «solo Google» (paso 6 de docs/despliegue-solo-google.md):
-- se hace cuando ya haya tutorías reales publicadas (ver docs/sql/contar-tutorias-reales.sql).
--
-- Por qué: las cuentas de demostración están inactivas, así que sus tutores ya no pueden entrar a
-- completar ni cancelar sesiones. Sus tutorías seguían en el catálogo y alguien podría reservar una
-- sesión que nadie va a dar.
--
-- Qué hace: lo mismo que el botón «Inactivar tutoría» de la app (tutorias.service.js), que no se
-- puede usar porque nadie entra con esas cuentas:
--   1. Cancela (id_estado 4) las reservas ACTIVAS de sus horarios cuya sesión aún no empieza:
--      fecha posterior a hoy, o de hoy con hora de inicio todavía por venir (hora de Bogotá).
--   2. Inactiva (id_estado 2) sus horarios activos.
--   3. Inactiva (id_estado 2) sus tutorías activas.
-- No toca: reservas pasadas o ya empezadas (activas, completadas o canceladas), valoraciones,
-- materias, recursos ni tutorías de otros tutores. No borra nada.
-- Se puede volver a correr: si ya se aplicó, no cambia nada.
--
-- Seguridad: si no hay ninguna tutoría activa con horario activo de un tutor real (@udea.edu.co),
-- se detiene sin cambiar nada: el catálogo quedaría vacío.
--
-- Cómo correrlo (lo hace el dueño de la BD): Supabase → SQL Editor → pegar todo → Run.
-- Si algo falla, la transacción se deshace completa. Después: docs/sql/verificar-tutorias-demo.sql.
-- =============================================================================

BEGIN;

-- 1. Antes: tutorías de demostración activas, con sus horarios activos y reservas por cancelar
SELECT t.id, t.titulo, m.nombre AS materia, u.correo AS tutor,
       count(DISTINCT h.id) FILTER (WHERE h.id_estado = 1) AS horarios_activos
FROM tbl_tutoria t
JOIN tbl_usuario u ON u.id = t.id_tutor
JOIN tbl_materia m ON m.id = t.id_materia
LEFT JOIN tbl_horario h ON h.id_tutoria = t.id
WHERE t.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test'
GROUP BY t.id, t.titulo, m.nombre, u.correo
ORDER BY t.id;

DO $$
DECLARE
  hoy date := (now() AT TIME ZONE 'America/Bogota')::date;
  hora_actual time := (now() AT TIME ZONE 'America/Bogota')::time;
  reales integer;
  canceladas integer;
  horarios integer;
  tutorias integer;
BEGIN
  -- Seguridad: debe quedar algo en el catálogo
  SELECT count(DISTINCT t.id) INTO reales
  FROM tbl_tutoria t
  JOIN tbl_usuario u ON u.id = t.id_tutor
  JOIN tbl_horario h ON h.id_tutoria = t.id AND h.id_estado = 1
  WHERE t.id_estado = 1 AND u.id_estado = 1 AND lower(u.correo) LIKE '%@udea.edu.co';
  IF reales = 0 THEN
    RAISE EXCEPTION 'No hay tutorías reales (@udea.edu.co) activas con horario: el catálogo quedaría vacío. No se cambió nada.';
  END IF;

  -- Bloquea en el orden de la app (tutoría → horario) para no cruzarse con una reserva en curso
  PERFORM t.id FROM tbl_tutoria t JOIN tbl_usuario u ON u.id = t.id_tutor
  WHERE t.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test' ORDER BY t.id FOR UPDATE OF t;
  PERFORM h.id FROM tbl_horario h JOIN tbl_tutoria t ON t.id = h.id_tutoria JOIN tbl_usuario u ON u.id = t.id_tutor
  WHERE h.id_estado = 1 AND t.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test' ORDER BY h.id FOR UPDATE OF h;

  -- 2. Cancelar solo las reservas activas de sesiones que aún no empiezan
  UPDATE tbl_reserva r
  SET id_estado = 4
  FROM tbl_horario h, tbl_tutoria t, tbl_usuario u
  WHERE r.id_horario = h.id AND h.id_tutoria = t.id AND t.id_tutor = u.id
    AND lower(u.correo) LIKE '%@demo.sita-es.test'
    AND t.id_estado = 1 AND h.id_estado = 1 AND r.id_estado = 1
    AND (r.fecha_sesion > hoy OR (r.fecha_sesion = hoy AND h.hora_inicio > hora_actual));
  GET DIAGNOSTICS canceladas = ROW_COUNT;

  -- 3. Inactivar sus horarios activos
  UPDATE tbl_horario h
  SET id_estado = 2
  FROM tbl_tutoria t, tbl_usuario u
  WHERE h.id_tutoria = t.id AND t.id_tutor = u.id
    AND lower(u.correo) LIKE '%@demo.sita-es.test'
    AND t.id_estado = 1 AND h.id_estado = 1;
  GET DIAGNOSTICS horarios = ROW_COUNT;

  -- 4. Inactivar las tutorías
  UPDATE tbl_tutoria t
  SET id_estado = 2
  FROM tbl_usuario u
  WHERE t.id_tutor = u.id AND lower(u.correo) LIKE '%@demo.sita-es.test' AND t.id_estado = 1;
  GET DIAGNOSTICS tutorias = ROW_COUNT;

  RAISE NOTICE 'Tutorías ocultadas: %. Horarios inactivados: %. Reservas futuras canceladas: %. Tutorías reales visibles: %.',
    tutorias, horarios, canceladas, reales;
END $$;

-- 5. Después: no debe quedar ninguna tutoría de demostración activa
SELECT count(*) AS tutorias_demo_activas
FROM tbl_tutoria t
JOIN tbl_usuario u ON u.id = t.id_tutor
WHERE t.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test';

COMMIT;
