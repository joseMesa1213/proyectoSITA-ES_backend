-- =============================================================================
-- SITA-ES — Cambiar el dominio de las cuentas de demostración
--   @udea.edu.co  →  @demo.sita-es.test
--
-- Por qué: con "Continuar con Google", una persona real de la UdeA cuyo correo coincida
-- con una cuenta de demostración (por ejemplo, valentina.restrepo@udea.edu.co) entraría a
-- esa cuenta. .test es un dominio reservado que no existe en internet.
--
-- Qué hace:
--   - Cambia SOLO las 16 cuentas que crea prisma/seed.js (lista explícita abajo).
--     No toca a ningún usuario real que se haya registrado con su correo @udea.edu.co.
--   - No cambia contraseñas, roles ni datos: las sesiones abiertas siguen funcionando
--     (el token guarda el id del usuario, no el correo).
--   - Se puede volver a correr: si ya se aplicó, no cambia nada.
--
-- Cómo correrlo (lo hace el dueño de la BD):
--   Supabase → SQL Editor → pegar todo el archivo → Run.
--   Si algo falla, la transacción se deshace completa y la BD queda como estaba.
--
-- Después: avisar al equipo que las cuentas de demostración ahora entran con
-- @demo.sita-es.test (misma contraseña). Ver docs/cierre.md §5.
-- =============================================================================

BEGIN;

-- Cuentas de la semilla (prisma/seed.js): administrador, 5 tutores y 10 estudiantes
CREATE TEMP TABLE cuentas_demo (correo_viejo text PRIMARY KEY, correo_nuevo text NOT NULL) ON COMMIT DROP;

INSERT INTO cuentas_demo (correo_viejo, correo_nuevo)
SELECT correo, replace(correo, '@udea.edu.co', '@demo.sita-es.test')
FROM (VALUES
  ('coordinacion.sita-es@udea.edu.co'),
  ('valentina.restrepo@udea.edu.co'),
  ('santiago.zapata@udea.edu.co'),
  ('mariana.londono@udea.edu.co'),
  ('julian.cardona@udea.edu.co'),
  ('daniela.henao@udea.edu.co'),
  ('camila.gomez@udea.edu.co'),
  ('andres.ospina@udea.edu.co'),
  ('sara.mejia@udea.edu.co'),
  ('tomas.arango@udea.edu.co'),
  ('isabella.velez@udea.edu.co'),
  ('juan.rios@udea.edu.co'),
  ('laura.munoz@udea.edu.co'),
  ('mateo.giraldo@udea.edu.co'),
  ('sofia.correa@udea.edu.co'),
  ('samuel.agudelo@udea.edu.co')
) AS semilla (correo);

-- 1. Antes: qué cuentas se van a cambiar
SELECT u.id, u.correo AS correo_actual, c.correo_nuevo, u.id_rol
FROM tbl_usuario u
JOIN cuentas_demo c ON c.correo_viejo = u.correo
ORDER BY u.id;

DO $$
DECLARE
  conflictos integer;
  cambiadas integer;
BEGIN
  -- 2. Seguridad: si el correo nuevo ya existe (y el viejo también), no se puede cambiar
  --    sin romper la restricción de correo único. Se detiene todo sin modificar nada.
  SELECT count(*) INTO conflictos
  FROM cuentas_demo c
  JOIN tbl_usuario viejo ON viejo.correo = c.correo_viejo
  JOIN tbl_usuario nuevo ON nuevo.correo = c.correo_nuevo;
  IF conflictos > 0 THEN
    RAISE EXCEPTION 'Hay % correo(s) @demo.sita-es.test que ya existen junto al correo viejo. Revisar a mano.', conflictos;
  END IF;

  -- 3. Cambio
  UPDATE tbl_usuario u
  SET correo = c.correo_nuevo
  FROM cuentas_demo c
  WHERE u.correo = c.correo_viejo;
  GET DIAGNOSTICS cambiadas = ROW_COUNT;

  IF cambiadas = 0 THEN
    RAISE NOTICE 'No se cambió ninguna cuenta: el script ya se había aplicado o la semilla no está cargada.';
  ELSE
    RAISE NOTICE 'Cuentas cambiadas: % de 16.', cambiadas;
  END IF;
END $$;

-- 4. Después: deben aparecer las cuentas con el dominio nuevo y ninguna con el viejo
SELECT u.id, u.correo, u.id_rol
FROM tbl_usuario u
JOIN cuentas_demo c ON u.correo IN (c.correo_viejo, c.correo_nuevo)
ORDER BY u.id;

COMMIT;
