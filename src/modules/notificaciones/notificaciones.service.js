import { prisma } from "../../lib/prisma.js";
import { ESTADO, ROL } from "../../constants/catalogos.js";
import { AppError } from "../../utils/AppError.js";

// Avisos dentro de la plataforma (la campanita del frontend).
// - Se crean en la MISMA transacción del evento cuando la hay (si el evento falla, no queda aviso suelto).
// - enlace: ruta del frontend a la que lleva el aviso.
// - Las leídas se borran a los DIAS_PARA_BORRAR_LEIDAS días (al consultar, como mucho una vez por hora).

export const TIPO = Object.freeze({
  RESERVA_NUEVA: "reserva_nueva", // al tutor
  RESERVA_CANCELADA: "reserva_cancelada", // al tutor (canceló el estudiante) o al estudiante (canceló el tutor o en cascada)
  SESION_COMPLETADA: "sesion_completada", // al estudiante: ya puede valorar
  SOLICITUD_TUTOR_NUEVA: "solicitud_tutor_nueva", // a los administradores
  SOLICITUD_TUTOR_APROBADA: "solicitud_tutor_aprobada",
  SOLICITUD_TUTOR_RECHAZADA: "solicitud_tutor_rechazada",
});

export const DIAS_PARA_BORRAR_LEIDAS = 30;
const MAXIMO_LISTADO = 30;

// "2026-11-20" (o Date de una columna DATE) → "vie, 20 de nov"
export const fechaLegible = (fecha) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    typeof fecha === "string" ? new Date(`${fecha}T00:00:00Z`) : fecha
  );

const recortar = (texto, maximo) => (texto && texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto);

/**
 * Crea uno o varios avisos. cliente: prisma o la transacción (tx) del evento.
 * avisos: [{ id_usuario, tipo, titulo, mensaje?, enlace? }]
 */
export async function notificar(cliente, avisos) {
  const lista = avisos.filter(Boolean);
  if (lista.length === 0) return 0;
  const { count } = await cliente.notificacion.createMany({
    data: lista.map((a) => ({
      id_usuario: a.id_usuario,
      tipo: a.tipo,
      titulo: recortar(a.titulo, 200),
      mensaje: a.mensaje ?? null,
      enlace: a.enlace ?? null,
    })),
  });
  return count;
}

/** Mismo aviso para cada administrador activo. */
export async function notificarAdministradores(cliente, aviso) {
  const administradores = await cliente.usuario.findMany({
    where: { id_rol: ROL.ADMINISTRADOR, id_estado: ESTADO.ACTIVO },
    select: { id: true },
  });
  return notificar(cliente, administradores.map((a) => ({ ...aviso, id_usuario: a.id })));
}

/**
 * Para eventos sin transacción propia (p. ej. una solicitud nueva): un fallo al avisar se registra
 * pero NO deshace ni rompe la acción principal, que ya se guardó.
 */
export async function avisarSinFallar(funcion) {
  try {
    await funcion();
  } catch (err) {
    console.error("No se pudo crear la notificación:", err.message);
  }
}

// Borra las leídas antiguas; como mucho una vez por hora (no hay tareas programadas en Render gratuito)
let ultimaLimpieza = 0;
export async function limpiarLeidas({ forzar = false } = {}) {
  const momento = Date.now();
  if (!forzar && momento - ultimaLimpieza < 60 * 60 * 1000) return 0;
  ultimaLimpieza = momento;
  const limite = new Date(momento - DIAS_PARA_BORRAR_LEIDAS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.notificacion.deleteMany({ where: { leida: true, fecha_leida: { lt: limite } } });
  return count;
}

/**
 * GET /api/notificaciones — autenticado.
 * { no_leidas, notificaciones: las MAXIMO_LISTADO más recientes (no leídas primero) }
 * El frontend la consulta cada minuto: son dos consultas por índice.
 */
export async function listar(idUsuario) {
  await avisarSinFallar(() => limpiarLeidas());
  const [no_leidas, notificaciones] = await Promise.all([
    prisma.notificacion.count({ where: { id_usuario: idUsuario, leida: false } }),
    prisma.notificacion.findMany({
      where: { id_usuario: idUsuario },
      orderBy: [{ leida: "asc" }, { fecha: "desc" }, { id: "desc" }],
      take: MAXIMO_LISTADO,
      select: { id: true, tipo: true, titulo: true, mensaje: true, enlace: true, leida: true, fecha: true },
    }),
  ]);
  return { no_leidas, notificaciones };
}

/**
 * PATCH /api/notificaciones/:id/leer — dueño del aviso. 404 si no existe o es de otra persona
 * (no se revela que existe). Marcar una ya leída no es error.
 */
export async function marcarLeida(id, idUsuario) {
  const { count } = await prisma.notificacion.updateMany({
    where: { id, id_usuario: idUsuario, leida: false },
    data: { leida: true, fecha_leida: new Date() },
  });
  if (count === 0) {
    const propia = await prisma.notificacion.findFirst({ where: { id, id_usuario: idUsuario }, select: { id: true } });
    if (!propia) throw new AppError(404, "Notificación no encontrada");
  }
  return { id, leida: true };
}

/** PATCH /api/notificaciones/leer-todas — autenticado. Devuelve cuántas marcó. */
export async function marcarTodas(idUsuario) {
  const { count } = await prisma.notificacion.updateMany({
    where: { id_usuario: idUsuario, leida: false },
    data: { leida: true, fecha_leida: new Date() },
  });
  return { marcadas: count };
}
