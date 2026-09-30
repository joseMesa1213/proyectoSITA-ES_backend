import { prisma } from "../../lib/prisma.js";
import { DIAS, MODALIDADES, NIVELES, TIPOS_RECURSO } from "../../constants/catalogos.js";

const porId = { orderBy: { id: "asc" } };

export const listarEstados = () => prisma.estado.findMany(porId);
export const listarRoles = () => prisma.rol.findMany(porId);
export const listarTiposDocumento = () => prisma.tipoDocumento.findMany(porId);

// Valores permitidos para los campos de texto libre (selects del frontend)
export const listarOpciones = () => ({
  dias: DIAS,
  niveles: NIVELES,
  modalidades: MODALIDADES,
  tiposRecurso: TIPOS_RECURSO,
});
