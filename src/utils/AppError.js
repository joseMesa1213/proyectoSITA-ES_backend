// Error de negocio con código HTTP. Lanzarlo desde los services:
//   throw new AppError(404, "Tutoría no encontrada");
export class AppError extends Error {
  constructor(status, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

export const noImplementado = () => {
  throw new AppError(501, "Endpoint pendiente de implementar");
};
