-- =============================================================================
-- SITA-ES — ¿Ya hay tutorías reales publicadas?
--
-- Solo LEE: no modifica nada. Supabase → SQL Editor → pegar → Run.
-- Sirve para decidir cuándo ocultar las tutorías de demostración
-- (docs/sql/ocultar-tutorias-demo.sql, paso 6 de docs/despliegue-solo-google.md).
--   1. Tutores activos @udea.edu.co y cuántas tutorías tienen visibles en el catálogo.
--   2. Resumen: catálogo actual (visibles) separado en real y demostración.
-- «Visible» = tutoría activa con al menos un horario activo (lo que muestra el catálogo con horarios).
-- =============================================================================

-- 1. Tutores reales (activos, @udea.edu.co) y sus tutorías
SELECT u.id, u.nombre || ' ' || u.apellido AS tutor, u.correo,
       count(DISTINCT t.id) FILTER (WHERE t.id_estado = 1) AS tutorias_activas,
       count(DISTINCT t.id) FILTER (WHERE t.id_estado = 1 AND h.id_estado = 1) AS tutorias_con_horario,
       count(h.id) FILTER (WHERE t.id_estado = 1 AND h.id_estado = 1) AS horarios_activos
FROM tbl_usuario u
LEFT JOIN tbl_tutoria t ON t.id_tutor = u.id
LEFT JOIN tbl_horario h ON h.id_tutoria = t.id
WHERE u.id_rol = 2 AND u.id_estado = 1 AND lower(u.correo) LIKE '%@udea.edu.co'
GROUP BY u.id, u.nombre, u.apellido, u.correo
ORDER BY tutorias_con_horario DESC, u.id;

-- 2. Catálogo actual: tutorías activas de tutores reales y de demostración
SELECT CASE WHEN lower(u.correo) LIKE '%@demo.sita-es.test' THEN 'demostración' ELSE 'real' END AS origen,
       count(DISTINCT t.id) AS tutorias_activas,
       count(DISTINCT t.id) FILTER (WHERE h.id_estado = 1) AS tutorias_con_horario,
       count(DISTINCT t.id_materia) AS materias
FROM tbl_tutoria t
JOIN tbl_usuario u ON u.id = t.id_tutor
LEFT JOIN tbl_horario h ON h.id_tutoria = t.id
WHERE t.id_estado = 1
GROUP BY 1
ORDER BY 1;
