-- Solicitudes para ser tutor.
-- id_rol pasa a ser un NIVEL de permisos: 1 Estudiante (todos), 2 Estudiante + Tutor, 3 Administrador.
-- Ser tutor ya no se elige al registrarse: se solicita y un administrador la aprueba (sube id_rol de 1 a 2).
--
-- Esta migración SOLO AGREGA (dos estados, una tabla y filas nuevas): no cambia ni borra datos existentes,
-- y el backend anterior sigue funcionando con la base ya migrada.

-- 1. Estados de la solicitud. Pendiente (3) ya existía y no se usaba.
INSERT INTO "tbl_estado" ("id", "nombre") VALUES (6, 'Aprobado'), (7, 'Rechazado')
ON CONFLICT ("id") DO NOTHING;
SELECT setval(pg_get_serial_sequence('tbl_estado', 'id'), (SELECT MAX("id") FROM "tbl_estado"));

-- 2. Tabla (generada con prisma migrate diff)
CREATE TABLE "tbl_solicitud_tutor" (
    "id" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_estado" INTEGER NOT NULL,
    "motivo" TEXT,
    "fecha_solicitud" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_revisor" INTEGER,
    "fecha_revision" TIMESTAMP(6),
    "observacion" TEXT,
    CONSTRAINT "tbl_solicitud_tutor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_solicitud_tutor_usuario" ON "tbl_solicitud_tutor"("id_usuario");

ALTER TABLE "tbl_solicitud_tutor" ADD CONSTRAINT "fk_solicitud_tutor_usuario" FOREIGN KEY ("id_usuario") REFERENCES "tbl_usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "tbl_solicitud_tutor" ADD CONSTRAINT "fk_solicitud_tutor_estado" FOREIGN KEY ("id_estado") REFERENCES "tbl_estado"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "tbl_solicitud_tutor" ADD CONSTRAINT "fk_solicitud_tutor_revisor" FOREIGN KEY ("id_revisor") REFERENCES "tbl_usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- 3. Una sola solicitud PENDIENTE (id_estado = 3) por usuario, aunque lleguen dos peticiones a la vez.
--    Índice único PARCIAL: Prisma no lo puede declarar en schema.prisma, por eso solo vive aquí.
CREATE UNIQUE INDEX "uq_solicitud_tutor_pendiente" ON "tbl_solicitud_tutor"("id_usuario") WHERE "id_estado" = 3;

-- 4. Los tutores que ya existían quedan como tutores APROBADOS (su id_rol = 2 no cambia).
--    Sin revisor: se aprobaron antes de que existieran las solicitudes.
INSERT INTO "tbl_solicitud_tutor" ("id_usuario", "id_estado", "fecha_solicitud", "fecha_revision", "observacion")
SELECT "id", 6, COALESCE("fecha_registro", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, 'Tutor existente antes de las solicitudes'
FROM "tbl_usuario"
WHERE "id_rol" = 2;
