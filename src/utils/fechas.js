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
export const esFechaValida = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v ?? "") && !Number.isNaN(new Date(v).getTime());
