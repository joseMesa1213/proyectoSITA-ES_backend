# SITA-ES — Backend

API REST del Sistema de Tutorías Académicas. Estudiantes reservan cupo en tutorías que publican los tutores; el administrador gestiona materias y recursos.

**Stack:** Node.js ≥ 20 · Express 5 · Prisma 7 · PostgreSQL (Supabase) · JWT · bcryptjs

> Alcance: **solo el MVP**. Si algo no está en la tabla de endpoints, no se construye sin acordarlo con el equipo.

---

## 1. Puesta en marcha

```bash
npm install                 # instala y genera el cliente Prisma (postinstall)
cp .env.example .env        # completar DATABASE_URL, DIRECT_URL y JWT_SECRET
npm run dev                 # http://localhost:3000/api/salud
```

Las URLs de conexión están en Supabase → **Project Settings → Database → Connection string**:

| Variable | Puerto | La usa |
|---|---|---|
| `DATABASE_URL` | 6543 (pooler) | la app en ejecución |
| `DIRECT_URL` | 5432 (directa) | la CLI de Prisma (migraciones) |

> ⚠️ Instalar Prisma siempre en la versión **7.x** (`npm i -D prisma@7`). `npm i prisma` sin versión trae una 8.0 *release candidate*.

---

## 2. Estructura

```
prisma/
  schema.prisma            ← fuente de verdad del modelo de datos
  migrations/              ← historial de cambios a la BD (versionado en Git)
prisma.config.ts           ← config de la CLI de Prisma
src/
  server.js                ← arranca el servidor
  app.js                   ← express, cors, json, rutas, errores
  routes.js                ← monta cada módulo bajo /api/<modulo>
  config/env.js            ← variables de entorno validadas
  lib/prisma.js            ← ÚNICA instancia de PrismaClient
  constants/catalogos.js   ← ESTADO, ROL, DIAS, NIVELES, MODALIDADES, TIPOS_RECURSO
  middlewares/             ← autenticar, autorizar, manejo de errores
  utils/                   ← AppError, validaciones, conversión de fechas/horas
  modules/<modulo>/
    <modulo>.routes.js     ← rutas + permisos
    <modulo>.controller.js ← lee req, llama al service, responde
    <modulo>.service.js    ← reglas de negocio + Prisma
```

**Módulos de referencia ya implementados:** `auth` y `catalogos`. Copiar su patrón.

---

## 3. Convenciones (el "idioma común")

### Capas
- **routes** → solo declara rutas y middlewares (`autenticar`, `autorizar`).
- **controller** → convierte `req` en argumentos (`aEntero(req.params.id, "id")`, `req.usuario.id`, `req.body`) y responde. Sin lógica de negocio ni Prisma.
- **service** → valida, aplica reglas, consulta con `prisma`. Nunca toca `req`/`res`.

### Respuestas
```jsonc
// Éxito
{ "ok": true, "data": { ... } }
// Error
{ "ok": false, "error": { "mensaje": "Texto para mostrar", "detalles": { ... } } }
```

### Errores
Desde el service: `throw new AppError(status, "mensaje", detalles?)`. No hace falta `try/catch`: Express 5 captura los errores de funciones `async` y `middlewares/error.middleware.js` responde. Además traduce los de Prisma: `P2002` → 409 (duplicado), `P2003` → 400 (FK inválida), `P2025` → 404.

| Código | Cuándo |
|---|---|
| 400 | Datos faltantes o inválidos |
| 401 | Sin token o token inválido |
| 403 | Autenticado pero sin permiso (rol o no es el dueño) |
| 404 | No existe |
| 409 | Conflicto de negocio (duplicado, sin cupo, estado no permitido) |

### Nombres
- Código, rutas, variables y mensajes **en español**. Funciones en `camelCase` con verbo: `listar`, `obtener`, `crear`, `actualizar`, `cancelar`.
- Rutas en minúscula y con guiones: `/api/tipos-documento`.
- Modelos Prisma en PascalCase singular (`prisma.tutoria`, `prisma.materiaTutor`); **campos con el mismo nombre de la columna** (`id_estado`, `id_usuario_estudiante`). Las tablas reales en Postgres están en minúscula: `tbl_usuario`, `tbl_reserva`…
- Nunca números mágicos: `ESTADO.ACTIVO`, `ROL.TUTOR`.

### Datos
- **No hay borrado físico** de tutorías, horarios, recursos ni reservas: se cambia `id_estado`.
- Horas como `"HH:MM"` y fechas como `"YYYY-MM-DD"` en la API; convertir con `utils/fechas.js`.
- `contrasena_hash` está omitido por defecto en todas las consultas de usuario. No exponer correo ni documento de otros usuarios en endpoints públicos.
- `es_administrador` está en desuso: el rol se decide solo con `id_rol`.

### Autenticación
Header `Authorization: Bearer <token>`. Tras `autenticar`, `req.usuario = { id, rol }`. El token dura `JWT_EXPIRES_IN` (8h por defecto).

---

## 4. Reglas de negocio

- **Roles:** 1 Estudiante · 2 Tutor · 3 Administrador. El registro solo permite 1 o 2; el administrador se crea directamente en la BD.
- Todo usuario registrado tiene fila en `tbl_estudiante` (programa y semestre).
- Un **tutor** solo publica tutorías de materias que tiene asociadas en `tbl_materia_x_tutor`.
- Un **tutor también puede reservar**, pero no en sus propias tutorías.
- `tbl_horario` es un bloque **semanal** (ej. Lunes 10:00–12:00). La reserva indica el día concreto con `fecha_sesion`, que debe caer en ese día de la semana.
- **Reserva:** `ACTIVO → COMPLETADO` (lo marca el tutor) o `ACTIVO → CANCELADO`. `PENDIENTE` no se usa en el MVP.
- **Valoración:** solo quien reservó, solo si la reserva está `COMPLETADO`, una por reserva, calificación 1–5.

Cada función de `*.service.js` tiene en su comentario las validaciones exactas que debe cumplir.

---

## 5. Endpoints

Prefijo: `/api`. **Público** = sin token.

| Módulo | Método y ruta | Acceso | Estado |
|---|---|---|---|
| — | `GET /salud` | Público | ✅ |
| **auth** | `POST /auth/registro` | Público | ✅ |
| | `POST /auth/login` | Público | ✅ |
| | `GET /auth/perfil` | Autenticado | ✅ |
| **catalogos** | `GET /catalogos/estados` · `/roles` · `/tipos-documento` · `/opciones` | Público | ✅ |
| **materias** | `GET /materias?q=` | Público | ✅ |
| | `GET /materias/mias` | Tutor | ✅ |
| | `POST /materias` · `PUT /materias/:id` | Admin | ✅ |
| | `POST /materias/:id/tutor` · `DELETE /materias/:id/tutor` | Tutor | ✅ |
| **recursos** | `GET /recursos?tipo=` | Autenticado | ✅ |
| | `POST /recursos` · `PUT /recursos/:id` | Admin | ✅ |
| **tutorias** | `GET /tutorias?id_materia=&nivel=&modalidad=` · `GET /tutorias/:id` | Público | ✅ |
| | `GET /tutorias/mias` · `POST /tutorias` · `PUT /tutorias/:id` | Tutor (dueño) | ✅ |
| | `POST /tutorias/:id/horarios` · `PATCH /tutorias/:id/horarios/:idHorario/desactivar` | Tutor (dueño) | ✅ |
| **reservas** | `POST /reservas` · `GET /reservas/mias` · `PATCH /reservas/:id/cancelar` | Estudiante o Tutor | ✅ |
| | `GET /reservas/tutor?fecha_sesion=` · `PATCH /reservas/:id/completar` | Tutor | ✅ |
| **valoraciones** | `POST /valoraciones` | Estudiante o Tutor | ⏳ |
| | `GET /valoraciones/tutoria/:idTutoria` | Público | ⏳ |

⏳ = la ruta existe y responde **501** hasta que se implemente su service.

### Ejemplos de body
```jsonc
// POST /auth/registro
{ "nombre": "Ana", "apellido": "Gómez", "id_tipo_documento": 1, "num_documento": "1001",
  "correo": "ana@uni.edu.co", "contrasena": "minimo8chars", "celular": "3001234567",
  "id_rol": 1, "nombre_programa": "Ingeniería de Sistemas", "semestre": 4 }

// POST /tutorias
{ "id_materia": 3, "titulo": "Repaso de derivadas", "descripcion": "...",
  "nivel": "Básico", "modalidad": "Presencial", "cupo": 5 }

// POST /tutorias/:id/horarios
{ "dia": "Lunes", "hora_inicio": "10:00", "hora_fin": "12:00" }

// POST /reservas
{ "id_horario": 7, "id_recurso": 2, "fecha_sesion": "2026-10-05" }

// POST /valoraciones
{ "id_reserva": 12, "calificacion": 5, "comentario": "Muy clara la explicación" }
```

---

## 6. Base de datos y migraciones

`prisma/schema.prisma` es la referencia del modelo. **Nadie modifica tablas a mano en Supabase.**

### Configuración inicial (una sola vez, la hace el dueño de la BD)
La BD ya existía, así que la migración `0_init` (el script original) se marca como aplicada sin ejecutarla, y luego se aplican las pendientes:
```bash
npx prisma migrate resolve --applied 0_init
npm run db:migrate          # aplica 20260929000000_contrasena_y_fecha_sesion
npm run db:status           # debe decir "Database schema is up to date"
```

### Para cambiar el esquema
1. Editar `prisma/schema.prisma`.
2. Generar el SQL comparando la BD actual contra el esquema:
   ```bash
   mkdir prisma/migrations/AAAAMMDDHHMMSS_descripcion_corta
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script \
     > prisma/migrations/AAAAMMDDHHMMSS_descripcion_corta/migration.sql
   ```
3. Revisar el SQL, abrir PR y, una vez aprobado, aplicarlo: `npm run db:migrate`.
4. Todos ejecutan `npm run prisma:generate` después de hacer pull.

### Otros
- `npm run db:studio` → explorador visual de datos.
- Para crear un administrador: registrar el usuario por la API y cambiar su `id_rol` a 3 desde Supabase o Prisma Studio.

---

## 7. Flujo de trabajo en Git

- Rama por módulo: `feature/<modulo>` (ej. `feature/reservas`) desde `main`.
- Commits cortos en español: `reservas: valida cupo al crear`.
- PR a `main` con al menos una revisión. Probar los endpoints en Postman antes de abrir el PR.
- Solo tocar archivos de tu módulo. Cambios en `src/` compartido (`middlewares`, `utils`, `constants`) o en `schema.prisma` se avisan al equipo.
