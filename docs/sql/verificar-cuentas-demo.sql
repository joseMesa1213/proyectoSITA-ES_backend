-- =============================================================================
-- SITA-ES — Verificación después de inactivar las cuentas de demostración
--
-- Solo LEE: no modifica nada. Se puede correr cuantas veces se quiera (Supabase → SQL Editor).
-- Correr después de docs/sql/inactivar-cuentas-demo.sql. Qué esperar en cada consulta:
--   1. Una sola fila: «Inactivo» con todas las cuentas @demo.sita-es.test (16 si solo está la semilla).
--   2. Ninguna fila. Si aparece alguna, el UPDATE no se aplicó: volver a correr el script.
--   3. Al menos una fila: el administrador creado con crear-admin (correo @udea.edu.co).
--      Ningún administrador activo debe tener otro dominio.
--   4. y 5. Informativas (ver docs/despliegue-solo-google.md, «Qué pasa con las tutorías de demostración»).
-- =============================================================================

-- 1. Estado de las cuentas de demostración
SELECT e.nombre AS estado, count(*) AS cuentas
FROM tbl_usuario u
JOIN tbl_estado e ON e.id = u.id_estado
WHERE lower(u.correo) LIKE '%@demo.sita-es.test'
GROUP BY e.nombre;

-- 2. Cuentas de demostración que todavía podrían entrar (debe salir vacío)
SELECT id, correo, id_rol
FROM tbl_usuario
WHERE lower(correo) LIKE '%@demo.sita-es.test' AND id_estado = 1;

-- 3. Administradores activos (deben ser solo correos @udea.edu.co)
SELECT id, correo, nombre, apellido,
       CASE WHEN lower(correo) LIKE '%@udea.edu.co' THEN 'entra con Google' ELSE 'REVISAR: no entra con Google' END AS como_entra
FROM tbl_usuario
WHERE id_rol = 3 AND id_estado = 1
ORDER BY id;

-- 4. Tutorías activas de tutores de demostración (siguen visibles en el catálogo)
SELECT t.id, t.titulo, u.correo AS tutor, count(h.id) FILTER (WHERE h.id_estado = 1) AS horarios_activos
FROM tbl_tutoria t
JOIN tbl_usuario u ON u.id = t.id_tutor
LEFT JOIN tbl_horario h ON h.id_tutoria = t.id
WHERE t.id_estado = 1 AND lower(u.correo) LIKE '%@demo.sita-es.test'
GROUP BY t.id, t.titulo, u.correo
ORDER BY t.id;

-- 5. Reservas activas de sesiones que aún no pasan y que involucran cuentas de demostración
SELECT r.id, r.fecha_sesion, est.correo AS quien_reservo, tut.correo AS tutor
FROM tbl_reserva r
JOIN tbl_usuario est ON est.id = r.id_usuario_estudiante
JOIN tbl_horario h ON h.id = r.id_horario
JOIN tbl_tutoria t ON t.id = h.id_tutoria
JOIN tbl_usuario tut ON tut.id = t.id_tutor
WHERE r.id_estado = 1
  AND r.fecha_sesion >= (now() AT TIME ZONE 'America/Bogota')::date
  AND (lower(est.correo) LIKE '%@demo.sita-es.test' OR lower(tut.correo) LIKE '%@demo.sita-es.test')
ORDER BY r.fecha_sesion, r.id;
