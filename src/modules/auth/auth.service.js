import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ESTADO, ROL } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos, validarOpcion } from "../../utils/validar.js";

const incluirPerfil = {
  rol: true,
  tipoDocumento: true,
  estudiante: { select: { nombre_programa: true, semestre: true } },
};

const firmarToken = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.id_rol }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

export async function registrar(datos) {
  requerirCampos(datos, [
    "nombre", "apellido", "id_tipo_documento", "num_documento", "correo",
    "contrasena", "id_rol", "nombre_programa", "semestre",
  ]);
  // El administrador no se registra por la API: se crea directamente en la BD.
  validarOpcion(Number(datos.id_rol), [ROL.ESTUDIANTE, ROL.TUTOR], "id_rol");
  if (String(datos.contrasena).length < 8) {
    throw new AppError(400, "La contraseña debe tener al menos 8 caracteres");
  }

  const usuario = await prisma.usuario.create({
    data: {
      nombre: datos.nombre,
      apellido: datos.apellido,
      id_tipo_documento: aEntero(datos.id_tipo_documento, "id_tipo_documento"),
      num_documento: String(datos.num_documento),
      correo: String(datos.correo).trim().toLowerCase(),
      celular: datos.celular ?? null,
      contrasena_hash: await bcrypt.hash(String(datos.contrasena), 10),
      id_rol: Number(datos.id_rol),
      id_estado: ESTADO.ACTIVO,
      estudiante: {
        create: {
          nombre_programa: datos.nombre_programa,
          semestre: aEntero(datos.semestre, "semestre"),
        },
      },
    },
    include: incluirPerfil,
  });

  return { token: firmarToken(usuario), usuario };
}

export async function iniciarSesion({ correo, contrasena } = {}) {
  requerirCampos({ correo, contrasena }, ["correo", "contrasena"]);

  const usuario = await prisma.usuario.findUnique({
    where: { correo: String(correo).trim().toLowerCase() },
    omit: { contrasena_hash: false },
    include: incluirPerfil,
  });
  const valida = usuario && (await bcrypt.compare(String(contrasena), usuario.contrasena_hash));
  if (!valida) throw new AppError(401, "Credenciales inválidas");
  if (usuario.id_estado !== ESTADO.ACTIVO) throw new AppError(403, "Usuario inactivo");

  const { contrasena_hash, ...usuarioPublico } = usuario;
  return { token: firmarToken(usuario), usuario: usuarioPublico };
}

export async function obtenerPerfil(idUsuario) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: idUsuario },
    include: incluirPerfil,
  });
  if (!usuario) throw new AppError(404, "Usuario no encontrado");
  return usuario;
}
