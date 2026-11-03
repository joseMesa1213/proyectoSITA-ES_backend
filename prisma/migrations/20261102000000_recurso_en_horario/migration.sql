-- El salón/enlace se asigna al bloque semanal (no a cada estudiante): así se valida
-- que dos horarios no ocupen el mismo recurso a la misma hora.
-- Requiere que tbl_horario esté vacía (NOT NULL sin valor por defecto).
ALTER TABLE "tbl_horario" ADD COLUMN "id_recurso" INTEGER NOT NULL;

ALTER TABLE "tbl_horario" ADD CONSTRAINT "fk_horario_recurso" FOREIGN KEY ("id_recurso") REFERENCES "tbl_recurso"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
