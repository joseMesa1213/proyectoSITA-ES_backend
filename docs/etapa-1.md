# SITA-ES Backend — Cierre de la Etapa 1

**Estado:** columna del backend construida, conectada a Supabase y probada (registro, login y perfil funcionando).
**Siguiente etapa:** cada integrante implementa un módulo sobre esta base.

> Detalle técnico completo (instalación, convenciones, endpoints, migraciones): ver el [README](../README.md).

---

## 1. Qué se hizo

### Decisiones acordadas
| Tema | Decisión |
|---|---|
| Base de datos | PostgreSQL en Supabase (no MySQL). Tablas y columnas en minúscula: `tbl_usuario`, `id_estado`. |
| ORM | **Prisma 7.x**. `prisma/schema.prisma` es la fuente de verdad del modelo. |
| Autenticación | JWT + bcryptjs. Contraseña guardada como hash en `tbl_usuario.contrasena_hash`. |
| Roles | Se usa solo `id_rol` (1 Estudiante, 2 Tutor, 3 Administrador). `es_administrador` queda en desuso. |
| Fecha de la sesión | `tbl_horario` es un bloque **semanal**; la reserva guarda el día concreto en `tbl_reserva.fecha_sesion`. |
| Tutores | También pueden reservar tutorías (de otros tutores). |
| Estados de reserva | `ACTIVO → COMPLETADO` o `ACTIVO → CANCELADO`. `PENDIENTE` no se usa en el MVP. |
| Alcance | Solo el mínimo producto viable. Nada fuera de la lista de endpoints sin acordarlo. |

### Cambios a la base de datos
- `0_init` — script original registrado como línea base.
- `20260929000000_contrasena_y_fecha_sesion` — agrega `contrasena_hash` y `fecha_sesion`.

### Lo que ya está construido
- **Estructura por módulos** (`routes → controller → service`) en `src/modules/`.
- **Base compartida:** cliente Prisma único, middlewares `autenticar` y `autorizar`, manejo de errores centralizado con formato único de respuesta, constantes de catálogos (`ESTADO`, `ROL`, `DIAS`, `NIVELES`, `MODALIDADES`, `TIPOS_RECURSO`) y utilidades de validación y fechas.
- **Módulos terminados (sirven de ejemplo):**
  - `auth`: registro, login, perfil.
  - `catalogos`: estados, roles, tipos de documento y opciones para los selects del frontend.
- **Módulos preparados para el equipo:** `materias`, `recursos`, `tutorias`, `reservas`, `valoraciones`. Sus rutas, permisos y controladores ya existen; los endpoints responden **501** hasta que se implemente el service. Cada función del service tiene en su comentario las reglas que debe cumplir.

---

## 2. Cómo vamos a trabajar

### Arranque (cada integrante, una vez)
```bash
git clone <repo> && cd proyectoSITA-ES_backend
npm install
cp .env.example .env      # pedir los valores al dueño de la BD
npm run dev               # http://localhost:3000/api/salud
```

### Implementar un módulo
1. Crear la rama: `git checkout -b feature/<modulo>` desde `main` actualizado.
2. Abrir `src/modules/<modulo>/<modulo>.service.js` y reemplazar cada `noImplementado()` por la lógica descrita en su comentario.
3. Tomar como modelo `src/modules/auth/auth.service.js`.
4. Normalmente **solo se edita el service**. Las rutas y controladores ya están; si se necesita cambiarlos, se avisa.
5. Probar cada endpoint en Postman (casos correctos y de error) y guardar las peticiones en la colección del equipo.
6. Abrir PR a `main` con al menos una revisión.

### Reglas del equipo
- Usar `prisma` desde `src/lib/prisma.js`, las constantes de `src/constants/catalogos.js` y lanzar errores con `throw new AppError(status, "mensaje")`.
- Responder siempre `{ ok: true, data }`. Los errores los formatea el manejador; no hacer `try/catch` para responder.
- No se borra nada físicamente: se cambia `id_estado`.
- **Nadie modifica tablas a mano en Supabase.** Los cambios de esquema se hacen con una migración (ver README §6) y se avisan al equipo.
- Cambios en archivos compartidos (`middlewares`, `utils`, `constants`, `schema.prisma`) se avisan antes de hacer merge.

### Datos de prueba
Mientras un módulo del que dependes no esté listo, crea los datos que necesites con `npm run db:studio` (Prisma Studio). Para tener un administrador: registrarse por la API y cambiar `id_rol` a 3 en Studio.

---

## 3. Funcionalidades por desarrollar

Orden sugerido por dependencias (se puede trabajar en paralelo usando datos de prueba):

```
materias ──┐
           ├──> tutorias ──> reservas ──> valoraciones
recursos ──┘─────────────────────┘
```

### Módulo `materias` — Responsable: ____________
| Endpoint | Acceso | Qué hace |
|---|---|---|
| `GET /api/materias?q=` | Público | Lista materias; busca por nombre o código. |
| `POST /api/materias` | Admin | Crea materia (`nombre`, `codigo` único, `creditos`). |
| `PUT /api/materias/:id` | Admin | Edita materia. |
| `GET /api/materias/mias` | Tutor | Materias que el tutor tiene asociadas. |
| `POST /api/materias/:id/tutor` | Tutor | El tutor se asocia a una materia. |
| `DELETE /api/materias/:id/tutor` | Tutor | El tutor se desasocia. |

### Módulo `recursos` — Responsable: ____________
| Endpoint | Acceso | Qué hace |
|---|---|---|
| `GET /api/recursos?tipo=` | Autenticado | Admin ve todos; el resto solo los activos. |
| `POST /api/recursos` | Admin | Crea salón o enlace virtual con capacidad. |
| `PUT /api/recursos/:id` | Admin | Edita o activa/inactiva el recurso. |

### Módulo `tutorias` (incluye horarios) — Responsable: ____________
| Endpoint | Acceso | Qué hace |
|---|---|---|
| `GET /api/tutorias?id_materia=&nivel=&modalidad=` | Público | Divulgación: tutorías activas con sus horarios. |
| `GET /api/tutorias/:id` | Público | Detalle de una tutoría. |
| `GET /api/tutorias/mias` | Tutor | Tutorías propias. |
| `POST /api/tutorias` | Tutor | Publica tutoría (solo de materias asociadas). |
| `PUT /api/tutorias/:id` | Tutor dueño | Edita o inactiva la tutoría. |
| `POST /api/tutorias/:id/horarios` | Tutor dueño | Agrega bloque semanal sin cruces. |
| `PATCH /api/tutorias/:id/horarios/:idHorario/desactivar` | Tutor dueño | Desactiva un horario. |

### Módulo `reservas` — Responsable: ____________
El módulo con más reglas: cupo, capacidad del recurso, día correcto, duplicados y concurrencia (transacción).
| Endpoint | Acceso | Qué hace |
|---|---|---|
| `POST /api/reservas` | Estudiante o Tutor | Reserva un horario para una `fecha_sesion` con un recurso. |
| `GET /api/reservas/mias` | Estudiante o Tutor | Reservas propias. |
| `GET /api/reservas/tutor?fecha_sesion=` | Tutor | Reservas recibidas en sus tutorías. |
| `PATCH /api/reservas/:id/cancelar` | Quien reservó o el tutor | Cancela una reserva activa. |
| `PATCH /api/reservas/:id/completar` | Tutor | Marca la sesión como completada. |

### Módulo `valoraciones` — Responsable: ____________
| Endpoint | Acceso | Qué hace |
|---|---|---|
| `POST /api/valoraciones` | Quien reservó | Califica 1–5 una reserva completada (una sola vez). |
| `GET /api/valoraciones/tutoria/:idTutoria` | Público | Valoraciones de una tutoría con promedio y total. |

> `recursos` y `valoraciones` son los más cortos: quien los tome puede apoyar después en `reservas` o en la colección de Postman.

---

## 4. Cuándo un módulo está terminado

- [ ] Ningún endpoint del módulo responde 501.
- [ ] Se cumplen todas las reglas del comentario de cada función del service.
- [ ] Los errores devuelven el código correcto (400, 403, 404, 409).
- [ ] Endpoints públicos no exponen correo, documento ni contraseña de otros usuarios.
- [ ] Peticiones guardadas en la colección de Postman del equipo (casos correctos y de error).
- [ ] PR revisado y fusionado en `main`.
