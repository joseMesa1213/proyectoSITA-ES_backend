// Postgres TIME/DATE <-> texto. Prisma devuelve TIME como Date del 1970-01-01 en UTC.

// "14:30" -> Date para guardar en columnas TIME
export const horaADate = (hhmm) => new Date(`1970-01-01T${hhmm}:00Z`);

// Date de columna TIME -> "14:30"
export const dateAHora = (date) => date.toISOString().slice(11, 16);

// "2026-10-05" -> Date para guardar en columnas DATE
export const textoAFecha = (yyyymmdd) => new Date(`${yyyymmdd}T00:00:00Z`);

// Date de columna DATE -> "2026-10-05"
export const fechaATexto = (date) => date.toISOString().slice(0, 10);

export const esHoraValida = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v ?? "");

// La ida y vuelta descarta fechas imposibles: JS convierte "2026-02-30" en 2 de marzo
export const esFechaValida = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v ?? "")) return false;
  const fecha = textoAFecha(v);
  return !Number.isNaN(fecha.getTime()) && fechaATexto(fecha) === v;
};

// La universidad opera en Colombia: "hoy" se calcula en esa zona aunque el servidor esté en UTC
const ZONA_HORARIA = "America/Bogota";

// Fecha actual como "2026-10-05" (en-CA formatea como YYYY-MM-DD)
export const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date());
