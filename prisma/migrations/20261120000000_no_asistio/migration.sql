-- Inasistencia: el tutor cancela, después de que terminó la sesión, la reserva de quien no fue.
-- La reserva queda CANCELADA (no puede valorarse) y se marca no_asistio para mostrar «No asistió».
-- Solo agrega una columna con valor por defecto: las reservas existentes quedan en false.
ALTER TABLE "tbl_reserva" ADD COLUMN "no_asistio" BOOLEAN NOT NULL DEFAULT false;
