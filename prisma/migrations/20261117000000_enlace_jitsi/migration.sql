-- Enlaces Jitsi automáticos: cada tutoría Virtual tiene su propia sala, guardada como un
-- recurso Virtual "generado" (no aparece en el panel de recursos ni en el selector).
-- No toca datos existentes: los horarios actuales conservan su sala virtual.
ALTER TABLE "tbl_recurso" ADD COLUMN "generado" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tbl_tutoria" ADD COLUMN "id_recurso_enlace" INTEGER;

CREATE UNIQUE INDEX "tbl_tutoria_id_recurso_enlace_key" ON "tbl_tutoria"("id_recurso_enlace");

ALTER TABLE "tbl_tutoria" ADD CONSTRAINT "fk_tutoria_recurso_enlace" FOREIGN KEY ("id_recurso_enlace") REFERENCES "tbl_recurso"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
