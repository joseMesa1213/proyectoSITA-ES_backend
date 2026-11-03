// =============================================================================
// SITA-ES — Datos de demostración (Universidad de Antioquia, Ingeniería de Sistemas)
// Uso: npm run db:seed
//
// - Solo AGREGA datos: no borra ni modifica lo que ya existe en la BD.
// - Si ya se sembró (existe el admin de demo), no hace nada.
// - Tutorías, horarios, reservas futuras y valoraciones se crean con los services de la
//   API, así que cumplen las mismas reglas (sin cruces de salón, cupo <= capacidad...).
//   Solo las sesiones pasadas se insertan directo, porque la API no reserva fechas pasadas.
// - Las fechas se calculan desde hoy: siempre hay sesiones pasadas y próximas.
// - Personas ficticias. Contraseña de todas las cuentas: Udea123.
// =============================================================================
import { prisma } from "../src/lib/prisma.js";
import { DIAS, ESTADO, ROL } from "../src/constants/catalogos.js";
import { fechaATexto, hoy, textoAFecha } from "../src/utils/fechas.js";
import * as auth from "../src/modules/auth/auth.service.js";
import * as materias from "../src/modules/materias/materias.service.js";
import * as tutorias from "../src/modules/tutorias/tutorias.service.js";
import * as reservas from "../src/modules/reservas/reservas.service.js";
import * as valoraciones from "../src/modules/valoraciones/valoraciones.service.js";

const CONTRASENA = "Udea123.";
const DOMINIO = "udea.edu.co";
const PROGRAMA = "Ingeniería de Sistemas";
const CEDULA = 1; // tbl_tipo_documento: Cédula de Ciudadanía

// --- Materias: matemáticas, físicas y algunas del pensum ---------------------
const MATERIAS = [
  ["2555101", "Álgebra y Trigonometría", 3],
  ["2555131", "Cálculo Diferencial", 3],
  ["2555121", "Geometría Vectorial y Analítica", 3],
  ["2555231", "Cálculo Integral", 3],
  ["2555221", "Álgebra Lineal", 3],
  ["2508207", "Matemáticas Discretas I", 3],
  ["2508303", "Matemáticas Discretas II", 3],
  ["2508407", "Ecuaciones Diferenciales y Métodos Numéricos", 3],
  ["2508308", "Teoría de la Probabilidad y Colas", 4],
  ["2508408", "Métodos Estadísticos", 3],
  ["2536101", "Descubriendo la Física", 3],
  ["2536201", "Física Mecánica", 3],
  ["2508208", "Lógica y Representación I", 3],
  ["2508307", "Técnicas de Programación y Laboratorio", 4],
  ["2508507", "Estructura de Datos y Laboratorio", 4],
  ["2508609", "Bases de Datos y Laboratorio", 4],
];

// --- Recursos: aulas <bloque>-<piso><número> y salas virtuales ---------------
// [bloque, aula, capacidad]
const AULAS = [
  [19, "105", 35], [19, "124", 30], [19, "224", 25], [19, "238", 40], [19, "312", 30], [19, "331", 35],
  [20, "105", 30], [20, "117", 40], [20, "210", 35], [20, "229", 25], [20, "303", 30], [20, "340", 20],
  [21, "109", 30], [21, "118", 35], [21, "215", 40], [21, "233", 25], [21, "307", 30], [21, "331", 35],
];
const AULA_INACTIVA = "Aula 20-340"; // para ver un recurso inactivo en el panel del admin
const SALAS_VIRTUALES = [
  ["Sala virtual 1", "https://meet.google.com/sit-aesv-001"],
  ["Sala virtual 2", "https://meet.google.com/sit-aesv-002"],
  ["Sala virtual 3", "https://meet.google.com/sit-aesv-003"],
];

// --- Personas ficticias -----------------------------------------------------
// [nombre, apellido, semestre]
const ADMIN = ["Coordinación", "SITA-ES", 9];
const TUTORES = [
  ["Valentina", "Restrepo Ochoa", 8],
  ["Santiago", "Zapata Gil", 7],
  ["Mariana", "Londoño Vélez", 9],
  ["Julián", "Cardona Ríos", 6],
  ["Daniela", "Henao Castaño", 8],
];
const ESTUDIANTES = [
  ["Camila", "Gómez Arango", 1],
  ["Andrés", "Ospina Mejía", 2],
  ["Sara", "Mejía Toro", 1],
  ["Tomás", "Arango Pérez", 3],
  ["Isabella", "Vélez Duque", 2],
  ["Juan Pablo", "Ríos Montoya", 4],
  ["Laura", "Muñoz Salazar", 3],
  ["Mateo", "Giraldo Patiño", 5],
  ["Sofía", "Correa Álvarez", 2],
  ["Samuel", "Agudelo Rendón", 4],
];

// Materias que cada tutor declara dominar (índice en TUTORES → códigos)
const MATERIAS_TUTOR = [
  ["2555101", "2555131", "2555231"],
  ["2536101", "2536201", "2555121"],
  ["2555221", "2508407", "2508408", "2508308"],
  ["2508208", "2508307", "2508507"],
  ["2508207", "2508303", "2508609"],
];

// --- Tutorías y horarios ----------------------------------------------------
// Bloques de 2 h: lunes a viernes de 06:00 a 20:00, sábados de 08:00 a 16:00.
// horarios: [día, hora de inicio, recurso]
const TUTORIAS = [
  { tutor: 0, materia: "2555131", titulo: "Repaso de límites y derivadas", nivel: "Básico", modalidad: "Presencial", cupo: 8,
    descripcion: "Límites, continuidad y reglas de derivación con ejercicios tipo parcial.",
    horarios: [["Lunes", "10:00", "Aula 19-105"], ["Miércoles", "10:00", "Aula 19-105"]] },
  { tutor: 0, materia: "2555231", titulo: "Técnicas de integración", nivel: "Intermedio", modalidad: "Híbrida", cupo: 10,
    descripcion: "Sustitución, por partes, fracciones parciales y sustitución trigonométrica.",
    horarios: [["Martes", "14:00", "Aula 20-210"], ["Sábado", "08:00", "Sala virtual 1"]] },
  { tutor: 1, materia: "2536201", titulo: "Cinemática y leyes de Newton", nivel: "Intermedio", modalidad: "Presencial", cupo: 6,
    descripcion: "Movimiento en una y dos dimensiones, diagramas de cuerpo libre y dinámica.",
    horarios: [["Martes", "08:00", "Aula 21-118"], ["Jueves", "08:00", "Aula 21-118"]] },
  { tutor: 1, materia: "2555121", titulo: "Vectores, rectas y planos", nivel: "Básico", modalidad: "Virtual", cupo: 15,
    descripcion: "Producto punto y cruz, ecuaciones de rectas y planos en el espacio.",
    horarios: [["Viernes", "18:00", "Sala virtual 1"]] },
  { tutor: 2, materia: "2555221", titulo: "Matrices, determinantes y sistemas", nivel: "Básico", modalidad: "Presencial", cupo: 10,
    descripcion: "Operaciones con matrices, eliminación de Gauss-Jordan y determinantes.",
    horarios: [["Lunes", "14:00", "Aula 20-210"], ["Miércoles", "14:00", "Aula 20-210"]] },
  { tutor: 2, materia: "2508407", titulo: "Taller de EDO para parciales", nivel: "Avanzado", modalidad: "Virtual", cupo: 12,
    descripcion: "Ecuaciones de primer y segundo orden, Laplace y métodos de Euler y Runge-Kutta.",
    horarios: [["Jueves", "18:00", "Sala virtual 2"], ["Sábado", "10:00", "Sala virtual 2"]] },
  { tutor: 3, materia: "2508208", titulo: "Primeros pasos en algoritmia", nivel: "Básico", modalidad: "Presencial", cupo: 8,
    descripcion: "Diagramas de flujo, estructuras de control y pruebas de escritorio.",
    horarios: [["Lunes", "16:00", "Aula 19-224"], ["Jueves", "16:00", "Aula 19-224"]] },
  { tutor: 3, materia: "2508507", titulo: "Listas, pilas y árboles", nivel: "Intermedio", modalidad: "Híbrida", cupo: 6,
    descripcion: "Implementación y recorridos de estructuras lineales y árboles binarios.",
    horarios: [["Miércoles", "18:00", "Aula 21-331"], ["Sábado", "12:00", "Sala virtual 3"]] },
  { tutor: 4, materia: "2508207", titulo: "Lógica proposicional y conjuntos", nivel: "Básico", modalidad: "Presencial", cupo: 8,
    descripcion: "Tablas de verdad, equivalencias lógicas, cuantificadores y teoría de conjuntos.",
    horarios: [["Martes", "10:00", "Aula 20-105"], ["Viernes", "10:00", "Aula 20-105"]] },
  { tutor: 4, materia: "2508609", titulo: "Modelo relacional y SQL", nivel: "Intermedio", modalidad: "Virtual", cupo: 10,
    descripcion: "Diseño entidad-relación, normalización y consultas SQL con JOIN y agregaciones.",
    horarios: [["Miércoles", "08:00", "Sala virtual 1"]] },
  // Inactiva: para ver el estado en "Mis tutorías"
  { tutor: 2, materia: "2508308", titulo: "Distribuciones de probabilidad", nivel: "Avanzado", modalidad: "Presencial", cupo: 5,
    descripcion: "Distribuciones discretas y continuas.", horarios: [], inactiva: true },
];

const COMENTARIOS = [
  [5, "Explica con mucha paciencia, me quedaron claros los ejercicios del parcial."],
  [5, "Excelente sesión, llevó ejercicios parecidos a los del profesor."],
  [4, "Muy buena, aunque el tiempo se quedó corto para todos los temas."],
  [5, "Me ayudó muchísimo, por fin entendí el tema."],
  [4, "Buena explicación, sería bueno que compartiera el material después."],
  [3, "Bien, pero fue algo rápido para quienes íbamos atrasados."],
  [5, null],
  [4, null],
];

// -----------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;
const fechaHoy = textoAFecha(hoy());
const sumarDias = (fecha, dias) => new Date(fecha.getTime() + dias * DIA_MS);
// Ocurrencia del día de la semana: semanas = 0 es la más cercana (nunca hoy)
const proxima = (dia, semanas = 0) =>
  sumarDias(fechaHoy, ((DIAS.indexOf(dia) - fechaHoy.getUTCDay() + 7) % 7 || 7) + 7 * semanas);
const anterior = (dia, semanas = 0) =>
  sumarDias(fechaHoy, -(((fechaHoy.getUTCDay() - DIAS.indexOf(dia) + 7) % 7 || 7) + 7 * semanas));

// "Valentina", "Restrepo Ochoa" → valentina.restrepo@udea.edu.co
const correo = (nombre, apellido) =>
  `${nombre.split(" ")[0]}.${apellido.split(" ")[0]}@${DOMINIO}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

let documento = 1036600000;
async function registrar([nombre, apellido, semestre], id_rol) {
  const { usuario } = await auth.registrar({
    nombre, apellido, id_tipo_documento: CEDULA, num_documento: String(++documento),
    correo: correo(nombre, apellido), contrasena: CONTRASENA,
    celular: `300${String(documento).slice(-7)}`, id_rol,
    nombre_programa: PROGRAMA, semestre,
  });
  return usuario;
}

// Toma n estudiantes rotando la lista, para repartir las reservas
const tomar = (lista, desde, n) => Array.from({ length: n }, (_, i) => lista[(desde + i) % lista.length]);

async function main() {
  const correoAdmin = correo(...ADMIN);
  if (await prisma.usuario.findUnique({ where: { correo: correoAdmin } })) {
    console.log(`La semilla ya fue aplicada (existe ${correoAdmin}). No se hizo nada.`);
    return;
  }
  const codigos = MATERIAS.map(([codigo]) => codigo);
  const yaExisten = await prisma.materia.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true } });
  if (yaExisten.length) {
    throw new Error(`Ya existen materias con estos códigos: ${yaExisten.map((m) => m.codigo).join(", ")}`);
  }

  console.log("Usuarios...");
  const admin = await registrar(ADMIN, ROL.ESTUDIANTE);
  await prisma.usuario.update({ where: { id: admin.id }, data: { id_rol: ROL.ADMINISTRADOR } });
  const tutores = [];
  for (const t of TUTORES) tutores.push(await registrar(t, ROL.TUTOR));
  const estudiantes = [];
  for (const e of ESTUDIANTES) estudiantes.push(await registrar(e, ROL.ESTUDIANTE));

  console.log("Materias y recursos...");
  const materiaPorCodigo = {};
  for (const [codigo, nombre, creditos] of MATERIAS) {
    materiaPorCodigo[codigo] = await materias.crear({ codigo, nombre, creditos });
  }
  for (const [i, codigosTutor] of MATERIAS_TUTOR.entries()) {
    for (const codigo of codigosTutor) await materias.asociarTutor(materiaPorCodigo[codigo].id, tutores[i].id);
  }

  const recursoPorNombre = {};
  for (const [bloque, aula, capacidad] of AULAS) {
    const nombre = `Aula ${bloque}-${aula}`;
    recursoPorNombre[nombre] = await prisma.recurso.create({
      data: {
        nombre, tipo: "Físico", capacidad,
        ubicacion: `Ciudad Universitaria, bloque ${bloque}, piso ${aula[0]}`,
        id_estado: nombre === AULA_INACTIVA ? ESTADO.INACTIVO : ESTADO.ACTIVO,
      },
    });
  }
  for (const [nombre, ubicacion] of SALAS_VIRTUALES) {
    recursoPorNombre[nombre] = await prisma.recurso.create({
      data: { nombre, tipo: "Virtual", ubicacion, capacidad: 50, id_estado: ESTADO.ACTIVO },
    });
  }

  console.log("Tutorías y horarios...");
  const horarios = []; // { horario, cupo }
  for (const t of TUTORIAS) {
    const tutor = tutores[t.tutor];
    const tutoria = await tutorias.crear(tutor.id, {
      id_materia: materiaPorCodigo[t.materia].id, titulo: t.titulo, descripcion: t.descripcion,
      nivel: t.nivel, modalidad: t.modalidad, cupo: t.cupo,
    });
    for (const [dia, inicio, recurso] of t.horarios) {
      const hora_fin = `${String(Number(inicio.slice(0, 2)) + 2).padStart(2, "0")}:00`;
      const horario = await tutorias.agregarHorario(tutoria.id, tutor.id, {
        dia, hora_inicio: inicio, hora_fin, id_recurso: recursoPorNombre[recurso].id,
      });
      horarios.push({ horario, cupo: t.cupo });
    }
    if (t.inactiva) await tutorias.actualizar(tutoria.id, tutor.id, { id_estado: ESTADO.INACTIVO });
  }

  console.log("Sesiones pasadas y valoraciones...");
  // Hace dos semanas: todas completadas y casi todas valoradas.
  // La semana pasada: una cancelada; en la mitad de los horarios el tutor aún no las completa.
  let comentario = 0;
  for (const [i, { horario }] of horarios.entries()) {
    for (const semanas of [1, 0]) {
      const fecha_sesion = anterior(horario.dia, semanas);
      const asistentes = tomar(estudiantes, i * 3 + semanas, 2 + ((i + semanas) % 4));
      for (const [j, estudiante] of asistentes.entries()) {
        let id_estado = ESTADO.COMPLETADO;
        if (semanas === 0 && j === 0) id_estado = ESTADO.CANCELADO;
        else if (semanas === 0 && i % 2 === 1) id_estado = ESTADO.ACTIVO;
        const reserva = await prisma.reserva.create({
          data: {
            id_usuario_estudiante: estudiante.id, id_horario: horario.id, id_recurso: horario.recurso.id,
            fecha_sesion, fecha: sumarDias(fecha_sesion, -2), id_estado,
          },
        });
        if (id_estado === ESTADO.COMPLETADO && (i + j) % 5 !== 4) {
          const [calificacion, texto] = COMENTARIOS[comentario++ % COMENTARIOS.length];
          await valoraciones.crear(estudiante.id, { id_reserva: reserva.id, calificacion, comentario: texto });
        }
      }
    }
  }

  console.log("Reservas próximas...");
  for (const [i, { horario, cupo }] of horarios.entries()) {
    // La primera sesión de "Cinemática" se llena para ver "No quedan cupos"
    const cuantos = i === 4 ? cupo : [3, 5, 2, 4][i % 4];
    for (const [semanas, n] of [[0, cuantos], [1, 1 + (i % 3)]]) {
      const fecha_sesion = fechaATexto(proxima(horario.dia, semanas));
      for (const estudiante of tomar(estudiantes, i * 2 + semanas, Math.min(n, estudiantes.length))) {
        await reservas.crear(estudiante.id, { id_horario: horario.id, fecha_sesion });
      }
    }
  }

  const [totalReservas, totalValoraciones] = await Promise.all([
    prisma.reserva.count({ where: { horario: { tutoria: { id_tutor: { in: tutores.map((t) => t.id) } } } } }),
    prisma.valoracion.count({ where: { id_usuario_evaluador: { in: estudiantes.map((e) => e.id) } } }),
  ]);
  console.log(`
Semilla aplicada:
  ${MATERIAS.length} materias, ${AULAS.length + SALAS_VIRTUALES.length} recursos, ${TUTORIAS.length} tutorías, ${horarios.length} horarios
  ${totalReservas} reservas, ${totalValoraciones} valoraciones

Cuentas (contraseña: ${CONTRASENA})
  Admin:       ${correoAdmin}
  Tutores:     ${tutores.map((t) => t.correo).join(", ")}
  Estudiantes: ${estudiantes.map((e) => e.correo).join(", ")}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
