-- Notificaciones dentro de la plataforma (campanita). Solo agrega una tabla: el backend anterior
-- sigue funcionando con la base migrada. Borrar un usuario borra sus notificaciones (CASCADE).
-- CreateTable
CREATE TABLE "tbl_notificacion" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "mensaje" TEXT,
    "enlace" VARCHAR(255),
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_leida" TIMESTAMP(6),

    CONSTRAINT "tbl_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_notificacion_usuario" ON "tbl_notificacion"("id_usuario", "leida", "fecha" DESC);

-- AddForeignKey
ALTER TABLE "tbl_notificacion" ADD CONSTRAINT "fk_notificacion_usuario" FOREIGN KEY ("id_usuario") REFERENCES "tbl_usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

