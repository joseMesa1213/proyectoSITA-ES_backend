// IDs fijos de los catálogos sembrados en la BD (migración 0_init).
// Usar estas constantes en lugar de números sueltos en el código.

export const ESTADO = Object.freeze({
  ACTIVO: 1,
  INACTIVO: 2,
  PENDIENTE: 3, // reservado; el MVP no lo usa
  CANCELADO: 4,
  COMPLETADO: 5,
});

export const ROL = Object.freeze({
  ESTUDIANTE: 1,
  TUTOR: 2,
  ADMINISTRADOR: 3,
});

// Índice = Date.getUTCDay() (0 = Domingo). Así se guarda en tbl_horario.dia
export const DIAS = Object.freeze([
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
]);

export const NIVELES = Object.freeze(["Básico", "Intermedio", "Avanzado"]);
export const MODALIDADES = Object.freeze(["Presencial", "Virtual", "Híbrida"]);
export const TIPOS_RECURSO = Object.freeze(["Físico", "Virtual"]);
