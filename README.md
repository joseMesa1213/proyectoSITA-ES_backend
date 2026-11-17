# SITA-ES — Backend

API REST del Sistema de Tutorías Académicas. Estudiantes reservan cupo en tutorías que publican los tutores; el administrador gestiona materias y recursos.

**Stack:** Node.js ≥ 20 · Express 5 · Prisma 7 · PostgreSQL (Supabase) · JWT · bcryptjs

> Alcance: **solo el MVP**. Si algo no está en la tabla de endpoints, no se construye sin acordarlo con el equipo.

| | URL |
|---|---|
| API en producción | https://proyectosita-es-backend.onrender.com/api/salud |
| Aplicación (frontend) | https://proyectosita-es.onrender.com |
| Repositorio del frontend | https://github.com/joseMesa1213/proyectoSITA-ES |

Estado final del proyecto, cuentas de prueba y pendientes: [docs/cierre.md](docs/cierre.md).

---

## 1. Puesta en marcha

```bash
npm install                 # instala y genera el cliente Prisma (postinstall)
cp .env.example .env        # completar DATABASE_URL, DIRECT_URL y JWT_SECRET
npm run dev                 # http://localhost:3000/api/salud
npm test                    # pruebas automáticas (Vitest), no usan la base de datos
npm run crear-admin         # crea un administrador (pide confirmación y datos por consola)
npm run respaldo            # respaldo de la base del .env con pg_dump en Docker (ver §6)
npm run postman:local       # colección de Postman contra este backend local (docs/postman/README.md)
```

**Solo se entra con Google @udea.edu.co.** Para desarrollar con las cuentas de la semilla (correo y contraseña) el
`.env` local necesita `LOGIN_CONTRASENA=true` (ya viene en `.env.example`). En producción esa variable no existe.

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
scripts/                   ← tareas de consola: crear-admin.js, respaldo.js
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
**En producción solo se entra con Google @udea.edu.co**, también los administradores:

| Ruta | Producción | Desarrollo (`LOGIN_CONTRASENA=true`) |
|---|---|---|
| `POST /auth/google` y `/auth/google/registro` | ✅ única forma de entrar y de registrarse | ✅ |
| `POST /auth/login` (correo y contraseña) | **403** «Use «Continuar con Google»…» (antes de validar nada) | ✅ cuentas de la semilla, Postman |
| `POST /auth/registro` (formulario) | **403** siempre | **403** siempre |

- `LOGIN_CONTRASENA` está apagada por defecto: solo `true` exacto la enciende (`env.loginContrasena`).
- La semilla sigue creando cuentas con contraseña con `registrarConContrasena` (`auth.service.js`), que no tiene ruta.
- Las cuentas de demostración se **inactivan** en producción ([`docs/sql/inactivar-cuentas-demo.sql`](docs/sql/inactivar-cuentas-demo.sql)):
  si alguna vez se encendiera `LOGIN_CONTRASENA` por error, nadie entraría con su contraseña conocida.
- Pasos de publicación y orden: [docs/despliegue-solo-google.md](docs/despliegue-solo-google.md).

Header `Authorization: Bearer <token>`. Tras `autenticar`, `req.usuario = { id, rol }`. El token dura `JWT_EXPIRES_IN` (8h por defecto).
**El rol y el estado se leen de la BD en cada petición** (no del token): al aprobar una solicitud de tutor o inactivar
a alguien, el cambio aplica en la siguiente petición, sin volver a iniciar sesión. Usuario inactivo o borrado → 401.
`autenticar` solo acepta tokens de sesión (con `id` y `rol` numéricos): cualquier otro JWT firmado, como el de registro con Google, responde 401.

### Inicio de sesión con Google
El botón "Continuar con Google" del frontend entrega un **ID token** (`credential`) que el backend verifica con
`google-auth-library` (firma de Google, `audience = GOOGLE_CLIENT_ID` y vencimiento). No se usa *client secret*.

1. `POST /auth/google { credential }`
   - Exige `email_verified` y un correo del dominio `GOOGLE_DOMINIO` (por defecto `udea.edu.co`). También revisa `hd`,
     que Google solo pone en cuentas administradas por la institución. Sin `GOOGLE_CLIENT_ID` responde **503**.
   - **Usuario existente y activo** → `{ token, usuario }`. Inactivo → 403. Incluye a los **administradores**: el rol
     no viene de Google, se lee de la BD (y solo `npm run crear-admin` lo pone en 3).
   - **Usuario nuevo** → `{ registro_pendiente: true, token_registro, perfil: { correo, nombre, apellido } }`.
     El `token_registro` dura **15 minutos** y se firma con un secreto distinto al de las sesiones.
2. `POST /auth/google/registro { token_registro, id_tipo_documento, num_documento, nombre_programa, semestre, celular?, nombre?, apellido?, quiero_ser_tutor?, motivo_tutor? }`
   → crea el usuario (estudiante; con solicitud de tutor pendiente si marcó «Quiero ser tutor») y devuelve `{ token, usuario }`.
   El **correo sale siempre del token** (nunca del body); nombre y apellido se pueden corregir.

| Caso | Respuesta |
|---|---|
| Falta `credential` o `token_registro` | 400 |
| Token de Google inválido, vencido o de otra app | 401 |
| Correo no verificado por Google | 403 |
| Correo de otro dominio, o cuenta personal sin `hd` institucional | 403 |
| Usuario inactivo | 403 |
| `token_registro` vencido, alterado o que no es de registro | 401 |
| Correo o documento ya registrados | 409 |

**Sin migración de BD.** Como `contrasena_hash` es obligatorio, a quien se registra con Google (y al administrador
creado con `crear-admin` y correo @udea.edu.co) se le guarda el hash de una contraseña aleatoria que nadie conoce:
- Esa persona **solo entra con Google**. Si pierde el acceso a su correo institucional, lo resuelve el soporte de la Universidad.
- Las cuentas se vinculan **por correo**: quien tenía cuenta de antes entra a la misma con Google.
- Como ya no hay registro por formulario, nadie puede crear una cuenta con el correo institucional de otra persona:
  cada correo lo verifica Google. Las cuentas de demostración usan el dominio ficticio `@demo.sita-es.test`, que no
  existe en Google, y en producción además están inactivas.

---

## 4. Reglas de negocio

- **`id_rol` es un nivel de permisos, no una elección:** 1 Estudiante (todos al registrarse) · 2 Estudiante + Tutor
  (cuando un administrador aprueba su solicitud) · 3 Administrador (solo con `npm run crear-admin`, nunca por la API).
- El registro (solo con Google) **no deja elegir rol**: quien quiere ser tutor marca "Quiero ser tutor"
  (`quiero_ser_tutor`, `motivo_tutor?`) y se crea una solicitud pendiente. Ver *Solicitudes para ser tutor*.
- Todo usuario registrado tiene fila en `tbl_estudiante` (programa y semestre). Los administradores creados con
  `crear-admin` no la tienen: no reservan.
- Un **tutor** solo publica tutorías de materias que tiene asociadas en `tbl_materia_x_tutor`.
- Un **tutor también puede reservar**, pero no en sus propias tutorías.
- `tbl_horario` es un bloque **semanal** (ej. Lunes 10:00–12:00). La reserva indica el día concreto con `fecha_sesion`, que debe caer en ese día de la semana.
- **Reserva:** `ACTIVO → COMPLETADO` (lo marca el tutor) o `ACTIVO → CANCELADO`. `PENDIENTE` solo se usa en las solicitudes de tutor.
- **Valoración:** solo quien reservó, solo si la reserva está `COMPLETADO`, una por reserva, calificación 1–5.

### Solicitudes para ser tutor
- `tbl_solicitud_tutor` guarda el historial: `PENDIENTE (3) → APROBADO (6)` o `PENDIENTE → RECHAZADO (7)`.
- **Una sola pendiente por usuario**, garantizado por un índice único parcial en la BD (`uq_solicitud_tutor_pendiente`,
  solo en la migración: Prisma no lo declara). Ya es tutor → 409.
- **Aprobar** sube `id_rol` de 1 a 2 en la misma transacción (a un administrador no se le cambia). **Rechazar** exige
  una observación, que el usuario ve en su perfil; puede volver a solicitar.
- Si dos administradores revisan a la vez, `UPDATE ... WHERE id_estado = PENDIENTE` deja pasar solo a uno (el otro, 409).
- Si el registro con Google trae `id_rol`, con cualquier valor, responde **400 "El rol no se elige en el
  registro"** y no crea nada (función `quiereSerTutor` en `auth.service.js`).

### Salones y cruces de horario
- El **recurso (salón o enlace) es del horario**, no de cada estudiante: el tutor lo elige al crear el bloque semanal y la reserva lo copia.
- Al crear un horario (409 si no se cumple):
  - La tutoría está activa.
  - El recurso está activo y es compatible con la modalidad (Presencial→Físico, Virtual→Virtual).
  - La capacidad del recurso es mayor o igual al cupo de la tutoría.
  - No se cruza con otro horario activo del tutor ni con otro horario activo **de cualquier tutor en el mismo recurso**.
  - No se cruza con una reserva futura que el tutor hizo como estudiante.
- Al reservar (409 si no se cumple):
  - El usuario no tiene otra reserva activa ese día que se solape en horas.
  - Si es tutor, no está dictando una tutoría suya en esa franja.
  - Si la fecha es hoy, la sesión aún no empieza.
- Solo se **completa** una sesión que ya terminó (hoy, después de `hora_fin`, o un día anterior).
- **Completado automático:** una reserva `ACTIVO` pasa sola a `COMPLETADO` **24 h** después de terminar la sesión
  (`src/modules/reservas/autocompletar.js`), así el estudiante puede valorarla aunque el tutor no la marque. Dentro de
  ese plazo el tutor la completa él mismo o **cancela** la de quien no asistió. No hay tarea programada (Render gratuito
  duerme el servidor): un solo `UPDATE` se ejecuta al consultar `GET /reservas/mias` o `/reservas/tutor`, como máximo
  cada 5 minutos; si falla, se registra en el log y la consulta responde normal.

### Salas Jitsi de las tutorías Virtuales
- Cada tutoría **Virtual** tiene **su propia sala de Jitsi Meet**, que se crea al publicarla (o al cambiarla a Virtual).
  No hay API ni credenciales: la URL es `JITSI_URL/SITA-ES-<título>-<12 caracteres aleatorios>` (`src/lib/jitsi.js`;
  `JITSI_URL` por defecto es `https://meet.jit.si`). La parte aleatoria impide adivinar la sala por el título.
- La sala se guarda como un recurso Virtual con `generado = true`, enlazado desde `tbl_tutoria.id_recurso_enlace`.
  Así la reserva la copia y "Mis reservas" muestra el enlace igual que antes, sin cambios en reservas.
- Al crear un horario de una tutoría Virtual **no se envía `id_recurso`** (si llega, se ignora): se usa su sala.
  Presencial e Híbrida siguen eligiendo recurso como siempre.
- Las salas generadas **no aparecen** en `GET /recursos` ni se editan con `PUT /recursos/:id` (409).
- Cupo máximo de una tutoría Virtual: **100** (`CAPACIDAD_SALA_JITSI`), 400 si se supera.
- El enlace lo ven solo el tutor dueño (`enlace_reunion` en `GET /tutorias/mias`, `POST` y `PUT /tutorias`) y
  quien reserva. Las rutas públicas no lo incluyen.
- Tutorías Virtuales anteriores a esta función: sus horarios conservan la sala virtual que tenían; reciben su sala
  Jitsi con el siguiente horario que se agregue o al editarlas. Las salas virtuales del administrador quedan para las Híbridas.
- En `meet.jit.si`, **quien abre la sala debe iniciar sesión** (Google, GitHub…); los demás entran solo con el enlace.

### Cambios sobre datos en uso
- **Desactivar un horario** o **inactivar una tutoría** cancela en cascada las reservas de sesiones que aún no empiezan; la respuesta trae `reservas_canceladas`. Inactivar la tutoría también inactiva sus horarios.
- **Cupo de la tutoría:** no puede superar la capacidad del recurso de sus horarios ni quedar por debajo de las reservas de una sesión futura. La **modalidad** debe seguir siendo compatible con esos recursos.
- **Recurso con horarios activos:** no se puede inactivar ni cambiar de tipo, y su capacidad no puede quedar por debajo del cupo de esas tutorías.

### Solicitudes de tutoría ("pedir una tutoría")
- Quien no encuentra lo que necesita la **pide**: materia, tema, descripción y disponibilidad (texto libre).
  Estados (catálogo existente): `PENDIENTE (3)` abierta → `COMPLETADO (5)` atendida · `CANCELADO (4)` la retiró ·
  `INACTIVO (2)` venció. Módulo `src/modules/solicitudes-tutoria/`.
- Máximo **3 abiertas** por persona (409); se bloquea la fila del usuario para que dos envíos a la vez no lo pasen.
- Al crearla se avisa a los **tutores activos de esa materia** (menos a quien la pide). Solo ven nombre y apellido.
- El tutor la **atiende** con una tutoría suya, activa y de la misma materia: una existente (`/atender`) o una nueva
  (`POST /tutorias` con `id_solicitud`). `UPDATE ... WHERE abierta`: si dos tutores la atienden a la vez, gana uno
  (el otro, 409; al publicar una nueva, la tutoría igual se crea y responde `solicitud_atendida: false`).
  Quien la pidió recibe un aviso con el enlace a la tutoría.
- **Vencen a los 30 días** sin respuesta (con aviso), al consultar, como mucho una vez por hora.

### Estadísticas (administrador)
- Solo lectura, sin tablas nuevas (`src/modules/estadisticas/`): consultas agregadas en hora de Bogotá.
- **Oferta actual** (no depende del período): tutorías activas, horas semanales de horarios activos, tutores con horarios.
- **Período** (últimas N semanas, lunes a domingo, incluida la actual): reservas no canceladas y canceladas por semana
  (fecha de la sesión), tasa de cancelación, valoraciones (promedio y distribución 1–5) y solicitudes de tutoría.
- **Ocupación** = reservas no canceladas / cupo actual, promediada sobre las sesiones (horario + fecha, ya ocurridas)
  que tuvieron al menos una reserva. Las sesiones sin reservas no se cuentan: el horario no guarda desde cuándo existe.
- **Demanda sin oferta**: materias con solicitudes abiertas o vencidas en el período y ninguna tutoría activa.

### Notificaciones (campanita)
- `tbl_notificacion`: aviso para un usuario con `tipo`, `titulo`, `mensaje`, `enlace` (ruta del frontend) y `leida`.
  Lógica en `src/modules/notificaciones/notificaciones.service.js` (`notificar`, `notificarAdministradores`).
- Se crean **en la misma transacción** del evento: si el evento falla, no queda un aviso suelto.

| Evento | Recibe el aviso |
|---|---|
| Reserva nueva | El tutor |
| El estudiante cancela | El tutor |
| El tutor cancela | El estudiante |
| Cancelación en cascada (desactivar horario o inactivar tutoría) | Cada estudiante afectado |
| Sesión completada (por el tutor o automáticamente) | El estudiante: "valore su sesión" |
| Solicitud para ser tutor (desde el perfil o al registrarse) | Cada administrador activo |
| Solicitud aprobada o rechazada (con el motivo) | Quien la hizo |
| Solicitud de tutoría nueva | Cada tutor activo de esa materia |
| Solicitud de tutoría atendida o vencida | Quien la pidió |

- La solicitud nueva no tiene transacción propia: si avisar falla, se registra y la solicitud igual se guarda (`avisarSinFallar`).
- El completado automático avisa en la misma sentencia (`WITH ... UPDATE ... RETURNING` + `INSERT`).
- Las **leídas se borran a los 30 días**, al consultar (como mucho una vez por hora; no hay tareas programadas).
- El frontend consulta `GET /notificaciones` cada minuto mientras la pestaña está visible.

### Concurrencia
Las validaciones que cuentan o buscan cruces se hacen en una transacción que bloquea filas con `SELECT ... FOR UPDATE`. Así, dos peticiones simultáneas se atienden de a una y la segunda ve lo que hizo la primera.

| Operación | Bloquea |
|---|---|
| Crear reserva | usuario que reserva → horario |
| Crear horario | tutor → tutoría → recurso |
| Editar o inactivar tutoría | tutoría → sus horarios activos → sus recursos |
| Desactivar horario | horario |
| Editar recurso | recurso |
| Cancelar o completar reserva | nada: `UPDATE ... WHERE id_estado = ACTIVO`; si llegan a la vez, una recibe 409 |

**Siempre en el orden `usuario → tutoría → horario → recurso`** (y varias filas de una tabla `ORDER BY id`). Bloquear en otro orden puede causar *deadlocks*.

Cada función de `*.service.js` tiene en su comentario las validaciones exactas que debe cumplir.

---

## 5. Endpoints

Prefijo: `/api`. **Público** = sin token.

| Módulo | Método y ruta | Acceso | Estado |
|---|---|---|---|
| — | `GET /salud` | Público | ✅ |
| **auth** | `POST /auth/google` · `POST /auth/google/registro` | Público | ✅ única forma de entrar en producción |
| | `POST /auth/login` | Público | ✅ solo con `LOGIN_CONTRASENA=true` (desarrollo); si no, 403 |
| | `POST /auth/registro` | Público | 403 siempre (el registro es con Google) |
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
| **valoraciones** | `POST /valoraciones` | Estudiante o Tutor | ✅ |
| | `GET /valoraciones/tutoria/:idTutoria` | Público | ✅ |
| **solicitudes-tutor** | `POST /solicitudes-tutor` | Estudiante (el tutor recibe 409) | ✅ |
| | `GET /solicitudes-tutor/mia` | Autenticado | ✅ |
| | `GET /solicitudes-tutor?estado=pendientes\|historial` | Admin | ✅ |
| | `PATCH /solicitudes-tutor/:id/aprobar` · `PATCH /solicitudes-tutor/:id/rechazar` | Admin | ✅ |
| **solicitudes-tutoria** | `POST /solicitudes-tutoria` `{ id_materia, tema, descripcion?, disponibilidad? }` | Estudiante o tutor | ✅ |
| | `GET /solicitudes-tutoria/mias` · `PATCH /solicitudes-tutoria/:id/retirar` | Estudiante o tutor (las propias) | ✅ |
| | `GET /solicitudes-tutoria/para-mi` (abiertas de sus materias) · `PATCH /solicitudes-tutoria/:id/atender` `{ id_tutoria }` | Tutor | ✅ |
| | `POST /tutorias` con `id_solicitud` → publica y la atiende en la misma transacción (`solicitud_atendida`) | Tutor | ✅ |
| **estadisticas** | `GET /estadisticas?semanas=12` (4–52) → resumen, reservas por semana, por materia, demanda sin oferta, valoraciones | Admin | ✅ |
| **notificaciones** | `GET /notificaciones` → `{ no_leidas, notificaciones }` (30 más recientes, no leídas primero) | Autenticado | ✅ |
| | `PATCH /notificaciones/:id/leer` (ajena o inexistente → 404) · `PATCH /notificaciones/leer-todas` | Autenticado | ✅ |

### Ejemplos de body
```jsonc
// POST /solicitudes-tutor  (desde el perfil)
{ "motivo": "Domino Cálculo Diferencial" }

// PATCH /solicitudes-tutor/:id/rechazar  (la observación es obligatoria al rechazar)
{ "observacion": "Indique qué materias domina" }

// POST /auth/google  (credential = ID token del botón de Google)
{ "credential": "eyJhbGciOiJSUzI1NiIs..." }

// POST /auth/google/registro  (token_registro = el que devolvió /auth/google; sin rol: todos entran como estudiantes)
{ "token_registro": "eyJhbGciOiJIUzI1NiIs...", "id_tipo_documento": 1, "num_documento": "1002",
  "celular": "3001234567", "nombre_programa": "Ingeniería de Sistemas", "semestre": 2,
  "quiero_ser_tutor": true, "motivo_tutor": "Domino Cálculo Diferencial" }

// POST /tutorias
{ "id_materia": 3, "titulo": "Repaso de derivadas", "descripcion": "...",
  "nivel": "Básico", "modalidad": "Presencial", "cupo": 5 }

// POST /tutorias/:id/horarios  (id_recurso no se envía si la tutoría es Virtual: usa su sala Jitsi)
{ "dia": "Lunes", "hora_inicio": "10:00", "hora_fin": "12:00", "id_recurso": 2 }

// POST /reservas  (el recurso sale del horario)
{ "id_horario": 7, "fecha_sesion": "2026-10-05" }

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
npm run db:migrate          # aplica las migraciones pendientes
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

### Datos de demostración
`npm run db:seed` carga datos inspirados en Ingeniería de Sistemas de la UdeA ([prisma/seed.js](prisma/seed.js)). Incluye:
- Materias de matemáticas, física y del pensum con sus códigos reales.
- Aulas de los bloques 19, 20 y 21, y salas virtuales.
- Tutorías con horarios en bloques de 2 h.
- Sesiones pasadas (completadas, valoradas y canceladas) y reservas próximas.

Personas ficticias; todas las cuentas usan la contraseña `Udea123.`. Admin: `coordinacion.sita-es@demo.sita-es.test`.
- Entran con correo y contraseña, así que **solo sirven en desarrollo** (`LOGIN_CONTRASENA=true`). En producción se
  inactivan con [`docs/sql/inactivar-cuentas-demo.sql`](docs/sql/inactivar-cuentas-demo.sql) (verificar con
  [`docs/sql/verificar-cuentas-demo.sql`](docs/sql/verificar-cuentas-demo.sql)).
- Los correos usan el dominio ficticio `@demo.sita-es.test` para que ninguno coincida con el de una persona real de la UdeA
  (que podría entrar con Google). En una base cargada antes con `@udea.edu.co`: [`docs/sql/cambiar-dominio-demo.sql`](docs/sql/cambiar-dominio-demo.sql).
- Solo agrega datos: no borra nada. Si ya se aplicó, no hace nada.
- Las fechas se calculan desde el día en que se ejecuta.

### Otros
- `npm run db:studio` → explorador visual de datos.
- **Crear un administrador:** `npm run crear-admin`. Usa la base del `.env`: muestra a qué servidor se conecta y pide
  escribir `SI`. Si el correo ya existe, ofrece convertir esa cuenta en administrador. No hay ninguna ruta de la API para esto.
  - Correo **@udea.edu.co** (producción): pide nombre, apellido y documento, **no** pide contraseña. Entra con Google.
  - Otro dominio (solo desarrollo, por ejemplo `@demo.sita-es.test`): avisa que no podrá entrar con Google, pide
    confirmar y una contraseña de al menos 10 caracteres (no se ve al escribirla). Solo entra con `LOGIN_CONTRASENA=true`.
- **Hacer tutor a alguien:** el administrador aprueba su solicitud en el panel *Solicitudes de tutor* (ya no se cambia
  `id_rol` a mano).

### Respaldo y restauración
```bash
npm run respaldo                       # respalda la base del .env (local)
npm run respaldo -- .env.produccion    # respalda producción: hacerlo ANTES de cada migración
```
- Usa `pg_dump` 17 en Docker (no hay que instalar PostgreSQL); respalda servidores 15, 16 y 17. **Solo lee** la base.
- Conecta por `DIRECT_URL` (5432; el pooler 6543 no sirve) y quita parámetros como `?pgbouncer=true`.
- Solo el esquema `public` (tablas de SITA-ES y `_prisma_migrations`), sin los esquemas internos de Supabase.
- La contraseña viaja como variable de entorno al contenedor: no queda en el historial de la terminal.
- Queda en `respaldos/` (ignorado por git). **Contiene datos personales**: no subirlo ni compartirlo.
- Restaurar: ver [docs/despliegue-solicitudes-tutor.md](docs/despliegue-solicitudes-tutor.md#si-hay-que-volver-atrás-restaurar-el-respaldo).

---

## 7. Despliegue (Render)

La API se publica como **Web Service** en Render, conectado a la rama `main` (cada push despliega). La base de datos sigue en Supabase.

| Campo | Valor |
|---|---|
| Build Command | `npm install` (el `postinstall` genera el cliente Prisma) |
| Start Command | `npm start` |
| Health Check Path | `/api/salud` (recomendado) |

Variables de entorno en Render:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Conexión por pooler de Supabase (puerto 6543) |
| `JWT_SECRET` | Cadena larga y aleatoria, distinta a la de desarrollo |
| `JWT_EXPIRES_IN` | Opcional (`8h` por defecto) |
| `CORS_ORIGIN` | `https://proyectosita-es.onrender.com,http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth de Google (termina en `.apps.googleusercontent.com`). Sin él, el login con Google responde 503 y el resto sigue igual |
| `GOOGLE_DOMINIO` | Opcional (`udea.edu.co` por defecto): dominio de correo permitido con Google |
| `LOGIN_CONTRASENA` | **No se define.** Solo para desarrollo: con `true` vuelve el login con correo y contraseña |

- `PORT` lo asigna Render; no se configura.
- `GOOGLE_CLIENT_ID` es obligatorio en la práctica: sin él nadie puede entrar (es la única forma de iniciar sesión).
- `GOOGLE_CLIENT_ID` debe ser **el mismo** que `VITE_GOOGLE_CLIENT_ID` del frontend. En Google Cloud Console →
  *APIs y servicios → Credenciales*, ese ID de cliente debe tener en **Orígenes autorizados de JavaScript**
  `https://proyectosita-es.onrender.com` y `http://localhost:5173`.
- `DIRECT_URL` no hace falta en Render: solo la usa la CLI de Prisma. Las **migraciones no se aplican al desplegar**:
  el dueño de la BD las aplica desde su equipo (`npm run db:migrate`, §6) **antes** de fusionar el código que las necesita.
- La raíz `/` responde `404 Ruta no encontrada` a propósito: todas las rutas están bajo `/api`.
- **Solo Google:** crear el administrador, publicar backend y frontend, inactivar las cuentas de demostración y
  verificar, en ese orden: [docs/despliegue-solo-google.md](docs/despliegue-solo-google.md).
- **Solicitudes para ser tutor:** pasos de respaldo, migración, verificación y orden de publicación en
  [docs/despliegue-solicitudes-tutor.md](docs/despliegue-solicitudes-tutor.md).
- En el plan gratuito el servicio se duerme tras unos 15 minutos sin uso y la primera petición tarda entre 30 y 50 s.

---

## 8. Flujo de trabajo en Git

- Rama por módulo: `feature/<modulo>` (ej. `feature/reservas`) desde `main`.
- Commits cortos en español: `reservas: valida cupo al crear`.
- PR a `main` con al menos una revisión. Probar los endpoints en Postman antes de abrir el PR.
- Solo tocar archivos de tu módulo. Cambios en `src/` compartido (`middlewares`, `utils`, `constants`) o en `schema.prisma` se avisan al equipo.
