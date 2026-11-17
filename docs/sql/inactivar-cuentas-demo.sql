-- =============================================================================
-- SITA-ES — Inactivar las cuentas de demostración (@demo.sita-es.test)
--
-- OBLIGATORIO en producción al pasar a «solo Google». Ver docs/despliegue-solo-google.md.
--
-- Por qué: las cuentas de la semilla tienen una contraseña conocida (Udea123.) y está en la
-- documentación. Con LOGIN_CONTRASENA apagada nadie puede usarla, pero si alguna vez se enciende
-- por error, cualquiera entraría, sobre todo como el administrador de demostración
-- (coordinacion.sita-es@demo.sita-es.test). Inactivas, no entran ni con contraseña ni con Google
-- (y @demo.sita-es.test no existe en Google: .test es un dominio reservado).
--
-- Qué hace:
--   - Pone id_estado = 2 (Inactivo) SOLO a usuarios cuyo correo termina en @demo.sita-es.test.
--   - No borra nada ni cambia contraseñas, roles, tutorías, horarios, reservas ni valoraciones.
--   - Las sesiones abiertas de esas cuentas dejan de servir de inmediato (el backend lee el
--     estado de la BD en cada petición y responde 401).
--   - Se puede volver a correr: si ya se aplicó, no cambia nada.
--
-- Seguridad: antes de inactivar, comprueba que exista al menos un administrador ACTIVO con correo
-- @udea.edu.co (el que se crea con `npm run crear-admin`). Si no lo hay, se detiene sin cambiar
-- nada: de lo contrario nadie podría administrar la aplicación.
--
-- Cómo correrlo (lo hace el dueño de la BD, después del despliegue y de crear el administrador):
--   Supabase → SQL Editor → pegar todo el archivo → Run.
--   Si algo falla, la transacción se deshace completa y la BD queda como estaba.
--   Después: correr docs/sql/verificar-cuentas-demo.sql.
--
-- Para revertirlo (por ejemplo, para una demostración local): el mismo UPDATE con id_estado = 1.
-- =============================================================================

BEGIN;

-- 1. Antes: cuentas de demostración y su estado actual
SELECT u.id, u.correo, u.id_rol, e.nombre AS estado
FROM tbl_usuario u
JOIN tbl_estado e ON e.id = u.id_estado
WHERE lower(u.correo) LIKE '%@demo.sita-es.test'
ORDER BY u.id_rol DESC, u.id;

DO $$
DECLARE
  admins_udea integer;
  inactivadas integer;
BEGIN
  -- 2. Seguridad: debe quedar al menos un administrador activo que entre con Google
  SELECT count(*) INTO admins_udea
  FROM tbl_usuario
  WHERE id_rol = 3 AND id_estado = 1 AND lower(correo) LIKE '%@udea.edu.co';
  IF admins_udea = 0 THEN
    RAISE EXCEPTION 'No hay ningún administrador activo con correo @udea.edu.co. Primero: npm run crear-admin. No se cambió nada.';
  END IF;

  -- 3. Inactivar (solo las que siguen activas o en otro estado distinto de Inactivo)
  UPDATE tbl_usuario
  SET id_estado = 2
  WHERE lower(correo) LIKE '%@demo.sita-es.test'
    AND id_estado <> 2;
  GET DIAGNOSTICS inactivadas = ROW_COUNT;

  IF inactivadas = 0 THEN
    RAISE NOTICE 'No se inactivó ninguna cuenta: ya estaban inactivas o no hay cuentas @demo.sita-es.test.';
  ELSE
    RAISE NOTICE 'Cuentas de demostración inactivadas: %. Administradores @udea.edu.co activos: %.', inactivadas, admins_udea;
  END IF;
END $$;

-- 4. Después: todas deben decir «Inactivo»
SELECT e.nombre AS estado, count(*) AS cuentas
FROM tbl_usuario u
JOIN tbl_estado e ON e.id = u.id_estado
WHERE lower(u.correo) LIKE '%@demo.sita-es.test'
GROUP BY e.nombre;

COMMIT;
