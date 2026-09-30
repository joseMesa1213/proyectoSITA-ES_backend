-- =============================================================================
-- LÍNEA BASE: script original de SITA-ES (ya aplicado en Supabase).
-- Se registra como aplicada con: npx prisma migrate resolve --applied 0_init
-- NO se vuelve a ejecutar sobre la BD existente.
-- =============================================================================

-- 1. CATÁLOGOS BASE
CREATE TABLE tbl_Estado (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL
);

CREATE TABLE tbl_Rol (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL
);

CREATE TABLE tbl_Tipo_Documento (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL
);

CREATE TABLE tbl_Materia (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    creditos INT NOT NULL
);

CREATE TABLE tbl_Recurso (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    ubicacion VARCHAR(255) NOT NULL,
    capacidad INT NOT NULL DEFAULT 1,
    id_estado INT NOT NULL,
    CONSTRAINT fk_recurso_estado FOREIGN KEY (id_estado) REFERENCES tbl_Estado(id)
);

-- 2. USUARIOS Y DATOS ACADÉMICOS
CREATE TABLE tbl_Usuario (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    apellido VARCHAR(200) NOT NULL,
    id_tipo_documento INT NOT NULL,
    num_documento VARCHAR(50) NOT NULL UNIQUE,
    correo VARCHAR(200) NOT NULL UNIQUE,
    celular VARCHAR(20),
    es_administrador BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_Estado INT NOT NULL,
    id_Rol INT NOT NULL,
    CONSTRAINT fk_usuario_tipo_doc FOREIGN KEY (id_tipo_documento) REFERENCES tbl_Tipo_Documento(id),
    CONSTRAINT fk_usuario_estado FOREIGN KEY (id_Estado) REFERENCES tbl_Estado(id),
    CONSTRAINT fk_usuario_rol FOREIGN KEY (id_Rol) REFERENCES tbl_Rol(id)
);

CREATE TABLE tbl_Estudiante (
    id SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL UNIQUE,
    nombre_programa VARCHAR(200) NOT NULL,
    semestre INT NOT NULL,
    CONSTRAINT fk_estudiante_usuario FOREIGN KEY (id_usuario) REFERENCES tbl_Usuario(id) ON DELETE CASCADE
);

CREATE TABLE tbl_Materia_x_Tutor (
    id SERIAL PRIMARY KEY,
    id_tutor INT NOT NULL,
    id_materia INT NOT NULL,
    CONSTRAINT fk_matxtutor_tutor FOREIGN KEY (id_tutor) REFERENCES tbl_Usuario(id) ON DELETE CASCADE,
    CONSTRAINT fk_matxtutor_materia FOREIGN KEY (id_materia) REFERENCES tbl_Materia(id) ON DELETE CASCADE,
    CONSTRAINT unique_tutor_materia UNIQUE (id_tutor, id_materia)
);

-- 3. TUTORÍAS, HORARIOS Y RESERVAS
CREATE TABLE tbl_Tutoria (
    id SERIAL PRIMARY KEY,
    id_tutor INT NOT NULL,
    id_Materia INT NOT NULL,
    id_Estado INT NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT,
    nivel VARCHAR(50),
    modalidad VARCHAR(50),
    cupo INT NOT NULL DEFAULT 1,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tutoria_tutor FOREIGN KEY (id_tutor) REFERENCES tbl_Usuario(id),
    CONSTRAINT fk_tutoria_materia FOREIGN KEY (id_Materia) REFERENCES tbl_Materia(id),
    CONSTRAINT fk_tutoria_estado FOREIGN KEY (id_Estado) REFERENCES tbl_Estado(id)
);

CREATE TABLE tbl_Horario (
    id SERIAL PRIMARY KEY,
    id_Tutoria INT NOT NULL,
    id_Estado INT NOT NULL,
    dia VARCHAR(20) NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    CONSTRAINT fk_horario_tutoria FOREIGN KEY (id_Tutoria) REFERENCES tbl_Tutoria(id) ON DELETE CASCADE,
    CONSTRAINT fk_horario_estado FOREIGN KEY (id_Estado) REFERENCES tbl_Estado(id)
);

CREATE TABLE tbl_Reserva (
    id SERIAL PRIMARY KEY,
    id_Usuario_estudiante INT NOT NULL,
    id_Horario INT NOT NULL,
    id_Recurso INT NOT NULL,
    id_Estado INT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reserva_estudiante FOREIGN KEY (id_Usuario_estudiante) REFERENCES tbl_Usuario(id),
    CONSTRAINT fk_reserva_horario FOREIGN KEY (id_Horario) REFERENCES tbl_Horario(id),
    CONSTRAINT fk_reserva_recurso FOREIGN KEY (id_Recurso) REFERENCES tbl_Recurso(id),
    CONSTRAINT fk_reserva_estado FOREIGN KEY (id_Estado) REFERENCES tbl_Estado(id)
);

CREATE TABLE tbl_Valoracion (
    id SERIAL PRIMARY KEY,
    id_Reserva INT NOT NULL UNIQUE,
    calificacion INT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_Usuario_evaluador INT NOT NULL,
    CONSTRAINT fk_valoracion_reserva FOREIGN KEY (id_Reserva) REFERENCES tbl_Reserva(id) ON DELETE CASCADE,
    CONSTRAINT fk_valoracion_evaluador FOREIGN KEY (id_Usuario_evaluador) REFERENCES tbl_Usuario(id)
);

-- 4. DATOS SEMILLA
INSERT INTO tbl_Estado (id, nombre) VALUES
(1, 'Activo'), (2, 'Inactivo'), (3, 'Pendiente'), (4, 'Cancelado'), (5, 'Completado');

INSERT INTO tbl_Rol (id, nombre) VALUES
(1, 'Estudiante'), (2, 'Tutor'), (3, 'Administrador');

INSERT INTO tbl_Tipo_Documento (id, nombre) VALUES
(1, 'Cédula de Ciudadanía'), (2, 'Tarjeta de Identidad'), (3, 'Cédula de Extranjería'), (4, 'Pasaporte');

SELECT setval(pg_get_serial_sequence('tbl_Estado', 'id'), (SELECT MAX(id) FROM tbl_Estado));
SELECT setval(pg_get_serial_sequence('tbl_Rol', 'id'), (SELECT MAX(id) FROM tbl_Rol));
SELECT setval(pg_get_serial_sequence('tbl_Tipo_Documento', 'id'), (SELECT MAX(id) FROM tbl_Tipo_Documento));
