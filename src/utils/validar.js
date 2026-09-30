import { AppError } from "./AppError.js";

// Lanza 400 si falta alguno de los campos en el objeto (body/query).
export function requerirCampos(obj, campos) {
  const faltantes = campos.filter(
    (c) => obj?.[c] === undefined || obj?.[c] === null || obj?.[c] === ""
  );
  if (faltantes.length) {
    throw new AppError(400, "Faltan campos obligatorios", { faltantes });
  }
}

// Convierte a entero positivo o lanza 400. Úsese con params (:id) y body numérico.
export function aEntero(valor, nombre) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError(400, `El campo '${nombre}' debe ser un entero positivo`);
  }
  return n;
}

// Lanza 400 si el valor no está en la lista permitida.
export function validarOpcion(valor, opciones, nombre) {
  if (!opciones.includes(valor)) {
    throw new AppError(400, `Valor inválido para '${nombre}'`, { permitidos: opciones });
  }
}
