import { prisma } from "../../lib/prisma.js";
import { DIAS, ESTADO, MODALIDADES, NIVELES } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";
import { aEntero, requerirCampos, validarOpcion } from "../../utils/validar.js";
import { dateAHora, esHoraValida, horaADate } from "../../utils/fechas.js";

// Datos públicos del tutor: nunca correo ni documento
const tutorPublico = { select: { id: true, nombre: true, apellido: true } };
const materiaResumen = { select: { id: true, nombre: true, codigo: true } };

const incluir = (soloHorariosActivos) => ({
  materia: materiaResumen,
  tutor: tutorPublico,
  horarios: soloHorariosActivos ? { where: { id_estado: ESTADO.ACTIVO } } : true,
});

const formatearHorario = (h) => ({
  id: h.id,
  id_tutoria: h.id_tutoria,
  id_estado: h.id_estado,
  dia: h.dia,
  hora_inicio: dateAHora(h.hora_inicio),
  hora_fin: dateAHora(h.hora_fin),
});

// Lunes primero, Domingo al final; dentro del día, por hora de inicio
const ordenDia = (dia) => (DIAS.indexOf(dia) + 6) % 7;
const compararHorarios = (a, b) =>
  ordenDia(a.dia) - ordenDia(b.dia) || a.hora_inicio.localeCompare(b.hora_inicio);

const formatear = (t) => ({
  ...t,
  horarios: t.horarios.map(formatearHorario).sort(compararHorarios),
});

// Busca la tutoría y verifica que sea del tutor autenticado
async function obtenerPropia(id, idTutor) {
  const tutoria = await prisma.tutoria.findUnique({ where: { id } });
  if (!tutoria) throw new AppError(404, "Tutoría no encontrada");
  if (tutoria.id_tutor !== idTutor) {
    throw new AppError(403, "Solo el tutor dueño puede modificar esta tutoría");
  }
  return tutoria;
}

// Toma solo los campos enviados y los valida. Se usa en crear y actualizar.
function datosTutoria({ titulo, descripcion, nivel, modalidad, cupo }) {
  const data = {};
  if (titulo !== undefined) {
    data.titulo = String(titulo).trim();
    if (!data.titulo) throw new AppError(400, "El título no puede estar vacío");
  }
  if (descripcion !== undefined) data.descripcion = descripcion ? String(descripcion) : null;
  if (nivel !== undefined) {
    validarOpcion(nivel, NIVELES, "nivel");
    data.nivel = nivel;
  }
  if (modalidad !== undefined) {
    validarOpcion(modalidad, MODALIDADES, "modalidad");
    data.modalidad = modalidad;
  }
  if (cupo !== undefined) data.cupo = aEntero(cupo, "cupo");
  return data;
}

/**
 * GET /api/tutorias?id_materia=&nivel=&modalidad= — público (divulgación).
 * Tutorías ACTIVAS con sus horarios ACTIVOS, más recientes primero.
 */
export async function listar({ id_materia, nivel, modalidad } = {}) {
  const where = { id_estado: ESTADO.ACTIVO };
  if (id_materia) where.id_materia = aEntero(id_materia, "id_materia");
  if (nivel) {
    validarOpcion(nivel, NIVELES, "nivel");
    where.nivel = nivel;
  }
  if (modalidad) {
    validarOpcion(modalidad, MODALIDADES, "modalidad");
    where.modalidad = modalidad;
  }

  const tutorias = await prisma.tutoria.findMany({
    where,
    include: incluir(true),
    orderBy: { fecha: "desc" },
  });
  return tutorias.map(formatear);
}

/**
 * GET /api/tutorias/mias — tutor.
 * Tutorías del tutor (activas e inactivas) con todos sus horarios.
 */
export async function listarDelTutor(idTutor) {
  const tutorias = await prisma.tutoria.findMany({
    where: { id_tutor: idTutor },
    include: incluir(false),
    orderBy: { fecha: "desc" },
  });
  return tutorias.map(formatear);
}

/**
 * GET /api/tutorias/:id — público.
 * Detalle con materia, tutor (datos públicos) y horarios activos. 404 si no existe.
 */
export async function obtener(id) {
  const tutoria = await prisma.tutoria.findUnique({ where: { id }, include: incluir(true) });
  if (!tutoria) throw new AppError(404, "Tutoría no encontrada");
  return formatear(tutoria);
}

/**
 * POST /api/tutorias — tutor.
 * Body: { id_materia, titulo, descripcion?, nivel, modalidad, cupo }
 * El tutor debe tener la materia asociada (si no → 403).
 */
export async function crear(idTutor, datos) {
  requerirCampos(datos, ["id_materia", "titulo", "nivel", "modalidad", "cupo"]);
  const idMateria = aEntero(datos.id_materia, "id_materia");
  const data = datosTutoria(datos);

  const asociada = await prisma.materiaTutor.findUnique({
    where: { id_tutor_id_materia: { id_tutor: idTutor, id_materia: idMateria } },
  });
  if (!asociada) {
    throw new AppError(403, "Debe asociarse a la materia antes de publicar tutorías de ella");
  }

  const tutoria = await prisma.tutoria.create({
    data: { ...data, id_tutor: idTutor, id_materia: idMateria, id_estado: ESTADO.ACTIVO },
    include: incluir(false),
  });
  return formatear(tutoria);
}

/**
 * PUT /api/tutorias/:id — tutor dueño.
 * Body: { titulo?, descripcion?, nivel?, modalidad?, cupo?, id_estado? }
 * id_estado solo ACTIVO o INACTIVO. No se cambia id_materia.
 */
export async function actualizar(id, idTutor, datos = {}) {
  await obtenerPropia(id, idTutor);

  const data = datosTutoria(datos);
  if (datos.id_estado !== undefined) {
    data.id_estado = Number(datos.id_estado);
    validarOpcion(data.id_estado, [ESTADO.ACTIVO, ESTADO.INACTIVO], "id_estado");
  }
  if (Object.keys(data).length === 0) {
    throw new AppError(
      400,
      "Envíe al menos uno de: titulo, descripcion, nivel, modalidad, cupo, id_estado"
    );
  }

  const tutoria = await prisma.tutoria.update({ where: { id }, data, include: incluir(false) });
  return formatear(tutoria);
}

/**
 * POST /api/tutorias/:id/horarios — tutor dueño.
 * Body: { dia, hora_inicio: "HH:MM", hora_fin: "HH:MM" }
 * No debe cruzarse con otro horario ACTIVO de cualquier tutoría del mismo tutor (409).
 */
export async function agregarHorario(idTutoria, idTutor, datos) {
  await obtenerPropia(idTutoria, idTutor);

  requerirCampos(datos, ["dia", "hora_inicio", "hora_fin"]);
  const { dia, hora_inicio, hora_fin } = datos;
  validarOpcion(dia, DIAS, "dia");
  if (!esHoraValida(hora_inicio) || !esHoraValida(hora_fin)) {
    throw new AppError(400, "Las horas deben tener formato HH:MM (24 horas)");
  }
  if (hora_fin <= hora_inicio) {
    throw new AppError(400, "hora_fin debe ser posterior a hora_inicio");
  }

  const inicio = horaADate(hora_inicio);
  const fin = horaADate(hora_fin);

  // Se cruzan si uno empieza antes de que el otro termine y viceversa
  const cruce = await prisma.horario.findFirst({
    where: {
      dia,
      id_estado: ESTADO.ACTIVO,
      tutoria: { id_tutor: idTutor },
      hora_inicio: { lt: fin },
      hora_fin: { gt: inicio },
    },
    include: { tutoria: { select: { titulo: true } } },
  });
  if (cruce) {
    throw new AppError(409, "El horario se cruza con otro horario activo suyo", {
      tutoria: cruce.tutoria.titulo,
      dia: cruce.dia,
      hora_inicio: dateAHora(cruce.hora_inicio),
      hora_fin: dateAHora(cruce.hora_fin),
    });
  }

  const horario = await prisma.horario.create({
    data: { id_tutoria: idTutoria, dia, hora_inicio: inicio, hora_fin: fin, id_estado: ESTADO.ACTIVO },
  });
  return formatearHorario(horario);
}

/**
 * PATCH /api/tutorias/:id/horarios/:idHorario/desactivar — tutor dueño.
 * Pone el horario en INACTIVO (no se borra: puede tener reservas).
 * 404 si el horario no pertenece a esa tutoría.
 */
export async function desactivarHorario(idTutoria, idHorario, idTutor) {
  await obtenerPropia(idTutoria, idTutor);

  const horario = await prisma.horario.findFirst({
    where: { id: idHorario, id_tutoria: idTutoria },
  });
  if (!horario) throw new AppError(404, "Horario no encontrado en esta tutoría");

  const actualizado = await prisma.horario.update({
    where: { id: idHorario },
    data: { id_estado: ESTADO.INACTIVO },
  });
  return formatearHorario(actualizado);
}
