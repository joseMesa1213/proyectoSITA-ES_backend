-- =============================================================================
-- SITA-ES — Verificación después de ocultar las tutorías de demostración
--
-- Solo LEE: no modifica nada. Correr después de docs/sql/ocultar-tutorias-demo.sql. Qué esperar:
--   1. Cero tutorías y cero horarios de demostración activos.
--   2. Cero reservas activas de sesiones futuras en tutorías de demostración.
--   3. Informativa: las reservas pasadas y valoraciones de esas tutorías siguen ahí (no se tocaron).
--   4. Al menos una tutoría real visible en el catálogo.
-- =============================================================================

-- 1. Tutorías y horarios de demostración que siguen activos (ambos deben ser 0)
SELECT
  (SELECT count(*) FROM tbl_tutoria t JOIN tbl_usuario u ON u.id = t.id_tutor
   WHERE t.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test') AS tutorias_demo_activas,
  (SELECT count(*) FROM tbl_horario h JOIN tbl_tutoria t ON t.id = h.id_tutoria JOIN tbl_usuario u ON u.id = t.id_tutor
   WHERE h.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test') AS horarios_demo_activos;

-- 2. Reservas activas de sesiones que aún no empiezan en tutorías de demostración (debe salir vacío)
SELECT r.id, r.fecha_sesion, h.hora_inicio, t.titulo
FROM tbl_reserva r
JOIN tbl_horario h ON h.id = r.id_horario
JOIN tbl_tutoria t ON t.id = h.id_tutoria
JOIN tbl_usuario u ON u.id = t.id_tutor
WHERE r.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test'
  AND (r.fecha_sesion > (now() AT TIME ZONE 'America/Bogota')::date
       OR (r.fecha_sesion = (now() AT TIME ZONE 'America/Bogota')::date
           AND h.hora_inicio > (now() AT TIME ZONE 'America/Bogota')::time))
ORDER BY r.fecha_sesion, r.id;

-- 3. Historial conservado de las tutorías de demostración (informativo)
SELECT e.nombre AS estado_reserva, count(r.id) AS reservas, count(v.id) AS valoraciones
FROM tbl_reserva r
JOIN tbl_estado e ON e.id = r.id_estado
JOIN tbl_horario h ON h.id = r.id_horario
JOIN tbl_tutoria t ON t.id = h.id_tutoria
JOIN tbl_usuario u ON u.id = t.id_tutor
LEFT JOIN tbl_valoracion v ON v.id_reserva = r.id
WHERE lower(u.correo) LIKE '%@demo.sita-es.test'
GROUP BY e.nombre
ORDER BY e.nombre;

-- 4. Tutorías reales visibles en el catálogo (activas con al menos un horario activo; debe ser > 0)
SELECT count(DISTINCT t.id) AS tutorias_reales_visibles
FROM tbl_tutoria t
JOIN tbl_usuario u ON u.id = t.id_tutor
JOIN tbl_horario h ON h.id_tutoria = t.id AND h.id_estado = 1
WHERE t.id_estado = 1 AND lower(u.correo) NOT LIKE '%@demo.sita-es.test';
