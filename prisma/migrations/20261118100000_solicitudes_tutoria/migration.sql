-- Solicitudes de tutoría: un estudiante pide una tutoría que no encuentra y la atiende un tutor de
-- esa materia. Solo agrega una tabla; usa estados que ya existen (3, 5, 4 y 2).
-- CreateTable
CREATE TABLE "tbl_solicitud_tutoria" (
    "id" SERIAL NOT NULL,
    "id_estudiante" INTEGER NOT NULL,
    "id_materia" INTEGER NOT NULL,
    "tema" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "disponibilidad" VARCHAR(300),
    "id_estado" INTEGER NOT NULL,
    "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_tutor" INTEGER,
    "id_tutoria" INTEGER,
    "fecha_atencion" TIMESTAMP(6),

    CONSTRAINT "tbl_solicitud_tutoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_solicitud_tutoria_materia" ON "tbl_solicitud_tutoria"("id_materia", "id_estado");

-- CreateIndex
CREATE INDEX "idx_solicitud_tutoria_estudiante" ON "tbl_solicitud_tutoria"("id_estudiante", "id_estado");

-- AddForeignKey
ALTER TABLE "tbl_solicitud_tutoria" ADD CONSTRAINT "fk_solicitud_tutoria_estudiante" FOREIGN KEY ("id_estudiante") REFERENCES "tbl_usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_solicitud_tutoria" ADD CONSTRAINT "fk_solicitud_tutoria_materia" FOREIGN KEY ("id_materia") REFERENCES "tbl_materia"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_solicitud_tutoria" ADD CONSTRAINT "fk_solicitud_tutoria_estado" FOREIGN KEY ("id_estado") REFERENCES "tbl_estado"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_solicitud_tutoria" ADD CONSTRAINT "fk_solicitud_tutoria_tutor" FOREIGN KEY ("id_tutor") REFERENCES "tbl_usuario"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_solicitud_tutoria" ADD CONSTRAINT "fk_solicitud_tutoria_tutoria" FOREIGN KEY ("id_tutoria") REFERENCES "tbl_tutoria"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

