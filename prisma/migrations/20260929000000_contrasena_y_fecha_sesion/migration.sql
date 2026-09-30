-- Contraseña cifrada (bcrypt) para el login con JWT.
-- Requiere que tbl_usuario esté vacía (NOT NULL sin valor por defecto).
ALTER TABLE "tbl_usuario" ADD COLUMN "contrasena_hash" VARCHAR(255) NOT NULL;

-- Día concreto en que ocurre la sesión reservada (tbl_horario es semanal/recurrente).
-- Requiere que tbl_reserva esté vacía.
ALTER TABLE "tbl_reserva" ADD COLUMN "fecha_sesion" DATE NOT NULL;
