# SITA-ES — Cierre del proyecto

**Estado:** MVP terminado y desplegado. Backend, frontend y base de datos en producción.
**Fecha de cierre:** noviembre de 2026.

| | URL |
|---|---|
| Aplicación | https://proyectosita-es.onrender.com |
| API | https://proyectosita-es-backend.onrender.com/api/salud |
| Repositorio frontend | https://github.com/joseMesa1213/proyectoSITA-ES |
| Repositorio backend | https://github.com/joseMesa1213/proyectoSITA-ES_backend |

> Detalle técnico (instalación, convenciones, reglas, endpoints, migraciones y despliegue): [README del backend](../README.md) y [README del frontend](https://github.com/joseMesa1213/proyectoSITA-ES#readme).
> El arranque del proyecto quedó registrado en [etapa-1.md](etapa-1.md).

---

## 1. Qué se entregó

SITA-ES (Sistema de Tutorías Académicas) permite que estudiantes de la universidad reserven cupo en tutorías que publican otros estudiantes que actúan como tutores.

| Rol | Qué puede hacer |
|---|---|
| **Visitante** (sin sesión) | Ver el catálogo de tutorías con filtros por materia, nivel y modalidad; ver el detalle con horarios y valoraciones; registrarse. |
| **Estudiante** (todos al registrarse) | Reservar un cupo eligiendo horario semanal y fecha de la sesión; ver su agenda (próximas, completadas, canceladas); cancelar; calificar de 1 a 5 una sesión completada; **solicitar ser tutor** (al registrarse o desde *Mi perfil*). |
| **Tutor** (solicitud aprobada) | Todo lo del estudiante (en tutorías de otros) y además: asociarse a materias, publicar y editar tutorías, agregar o desactivar horarios con su salón o enlace, ver las reservas recibidas por sesión y marcarlas como completadas o canceladas. |
| **Administrador** | Gestionar el catálogo de materias y los recursos (salones físicos y enlaces virtuales con capacidad) y **aprobar o rechazar las solicitudes para ser tutor**. No reserva. Se crea con `npm run crear-admin`. |
| **Todos** | **Asistente SITA**: chat guiado que busca tutorías por materia y responde preguntas frecuentes según el rol (ver §4). |

---

## 2. Arquitectura

```
Navegador ──► Frontend (Render, Static Site)         React 19 · Vite · Tailwind CSS 4 · React Router 7
                 │  fetch + JWT (Authorization: Bearer)
                 ▼
              Backend (Render, Web Service)          Node.js · Express 5 · Prisma 7 · JWT · bcryptjs
                 │  pooler (puerto 6543)
                 ▼
              PostgreSQL (Supabase)
```

- Respuestas con un formato único: `{ ok: true, data }` o `{ ok: false, error: { mensaje, detalles } }`.
- Backend organizado por módulos (`routes → controller → service`): `auth`, `catalogos`, `materias`, `recursos`, `tutorias`, `reservas`, `valoraciones`.
- Fechas y horas siempre en la zona `America/Bogota`.

---

## 3. Decisiones principales

| Tema | Decisión |
|---|---|
| Base de datos | PostgreSQL en Supabase. `prisma/schema.prisma` es la fuente de verdad; nadie modifica tablas a mano. |
| Roles | `id_rol` es un **nivel de permisos**: 1 Estudiante (todos), 2 Estudiante + Tutor (solicitud aprobada), 3 Administrador (`npm run crear-admin`). Nadie elige rol al registrarse. El rol se lee de la BD en cada petición, así que aprobar o inactivar aplica de inmediato. |
| Ser tutor | Se solicita (`tbl_solicitud_tutor`, con historial) y lo aprueba un administrador. Una sola solicitud pendiente por usuario (índice único parcial). |
| Horarios | `tbl_horario` es un bloque **semanal** (ej. lunes 10:00–12:00); la reserva guarda el día concreto en `fecha_sesion`. |
| Recursos | El salón o enlace pertenece al **horario**, no a cada reserva; la reserva lo copia. |
| Tutores | También pueden reservar, pero no en sus propias tutorías. |
| Estados de reserva | `ACTIVO → COMPLETADO` (lo marca el tutor cuando la sesión terminó) o `ACTIVO → CANCELADO`. `PENDIENTE`, `APROBADO` y `RECHAZADO` se usan en las solicitudes de tutor. |
| Borrado | No hay borrado físico: se cambia `id_estado`. |
| Datos en uso | Desactivar un horario o inactivar una tutoría cancela las reservas de sesiones que aún no empiezan. |
| Concurrencia | Transacciones con `SELECT ... FOR UPDATE` en el orden fijo `usuario → tutoría → horario → recurso`. |
| Asistente | Sin IA ni servicios externos, para no tener costos por uso (§4). |
| Alcance | Solo el MVP. Se descartaron extras como franjas institucionales, ventana de reserva o límite de cancelación. |

Las reglas completas (cupos, cruces de horario, capacidad del salón, modalidad compatible) están en el [README §4](../README.md#4-reglas-de-negocio).

### Migraciones aplicadas

| Migración | Cambio |
|---|---|
| `0_init` | Script original de la BD, registrado como línea base. |
| `20260929000000_contrasena_y_fecha_sesion` | Agrega `contrasena_hash` al usuario y `fecha_sesion` a la reserva. |
| `20261102000000_recurso_en_horario` | El recurso pasa a ser del horario (`tbl_horario.id_recurso`). |
| `20261116000000_solicitudes_tutor` | Tabla `tbl_solicitud_tutor`, estados Aprobado (6) y Rechazado (7). Los tutores existentes quedan con solicitud aprobada. Solo agrega datos. |

---

## 4. Asistente SITA

Botón flotante en todas las páginas del frontend.

- **Busca tutorías por materia** con nombre o código, aunque esté mal escrito o sin tildes ("kalkulo" → Cálculo Diferencial y Cálculo Integral).
- **Consulta datos del usuario**: próximas reservas y sesiones por calificar (estudiante y tutor); estudiantes inscritos hoy (tutor).
- **Responde preguntas frecuentes** por rol: cómo reservar, cancelar o calificar; por qué no se pudo reservar; por qué no se puede crear un horario; cómo gestionar materias y recursos.
- **Solo orienta**: no reserva, cancela ni crea nada; enlaza a la pantalla correspondiente. Así todas las reglas de negocio siguen en el backend.
- No necesita endpoints nuevos ni cambios en la BD. Única dependencia: [Fuse.js](https://www.fusejs.io/) (búsqueda difusa, gratuita).

**Para agregar una pregunta frecuente** basta con agregar un objeto en `src/asistente/intenciones.js` del frontend, con sus frases de ejemplo y su respuesta.

---

## 5. Datos y cuentas de demostración

La BD de producción tiene cargada la semilla (`npm run db:seed`): materias de Ingeniería de Sistemas de la UdeA con sus códigos, aulas de los bloques 19, 20 y 21, salas virtuales, tutorías con horarios, y sesiones pasadas y próximas. Las personas son ficticias.

Contraseña de todas las cuentas: `Udea123.`

| Rol | Correo |
|---|---|
| Administrador | `coordinacion.sita-es@demo.sita-es.test` |
| Tutores | `valentina.restrepo@demo.sita-es.test`, `santiago.zapata@demo.sita-es.test`, `mariana.londono@demo.sita-es.test`, `julian.cardona@demo.sita-es.test`, `daniela.henao@demo.sita-es.test` |
| Estudiantes | `camila.gomez@demo.sita-es.test`, `andres.ospina@demo.sita-es.test`, `sara.mejia@demo.sita-es.test`, `tomas.arango@demo.sita-es.test`, `isabella.velez@demo.sita-es.test`, `juan.rios@demo.sita-es.test`, entre otros |

Las cuentas usan el dominio ficticio `@demo.sita-es.test` (`.test` no existe en internet) para que ninguna coincida con el
correo real de una persona de la UdeA, que podría entrar a ella con "Continuar con Google". Al principio usaban
`@udea.edu.co`; en una base ya cargada se cambian con [`docs/sql/cambiar-dominio-demo.sql`](sql/cambiar-dominio-demo.sql).

> ⚠️ Estas cuentas son públicas (están en el repositorio). Si la plataforma llega a usarse con datos reales, hay que cambiar la contraseña del administrador y desactivar o borrar las cuentas de demostración.

**Antes de una demostración:** abrir https://proyectosita-es-backend.onrender.com/api/salud y esperar a que responda. En el plan gratuito de Render el backend se duerme tras unos 15 minutos sin uso y tarda entre 30 y 50 s en despertar.

---

## 6. Limitaciones conocidas

| Limitación | Situación actual |
|---|---|
| Recuperación de contraseña | No existe. La coordinación debe restablecerla desde la BD. |
| Cambio de rol | Ser tutor: solicitud que aprueba un administrador. Administradores: `npm run crear-admin` (consola). No hay forma de quitarle a alguien el rol de tutor desde la app. |
| Notificaciones | No se envían correos ni recordatorios de las sesiones. |
| Asistente | Entiende materias, temas de un diccionario ("derivadas", "SQL") y filtros (modalidad, nivel, día), pero no frases complejas: no usa IA. |
| Pruebas automatizadas | Pruebas unitarias con Vitest en backend (`npm test`) y frontend (asistente); la API se verifica con la colección de Postman en `docs/postman/` (152 peticiones, 383 verificaciones). No hay pruebas de interfaz automatizadas. |
| Plan gratuito de Render | El backend se duerme sin uso y la primera petición es lenta. |

---

## 7. Pendientes a cargo del equipo

- [x] **Colección de Postman**: exportarla a `docs/` con dos entornos (`local` → `http://localhost:3000/api` y `render` → `https://proyectosita-es-backend.onrender.com/api`), con casos correctos y de error por endpoint.
- [ ] **Prueba del Asistente SITA** en producción con los cuatro roles (visitante, estudiante, tutor, administrador): búsquedas por materia con y sin errores de escritura, cada botón del menú y preguntas libres.
- [ ] **Cambiar el dominio de las cuentas de demostración en producción**: correr [`docs/sql/cambiar-dominio-demo.sql`](sql/cambiar-dominio-demo.sql)
  en el SQL Editor de Supabase (lo hace el dueño de la BD) y avisar al equipo los correos nuevos.
- [ ] **Publicar las solicitudes para ser tutor**: respaldo, migración y orden de publicación en
  [`docs/despliegue-solicitudes-tutor.md`](despliegue-solicitudes-tutor.md). Después, quitar la compatibilidad de `id_rol` en el registro.
- [x] **Rutas internas del frontend en Render**: regla *Rewrite* `/*` → `/index.html` configurada (ver el [README del frontend](https://github.com/joseMesa1213/proyectoSITA-ES#despliegue-render)). Sin ella, abrir o recargar directamente una ruta como `/mis-reservas` responde `Not Found`.

---

## 8. Mantenimiento

| Tarea | Cómo |
|---|---|
| Cambiar el esquema de la BD | Editar `schema.prisma`, generar la migración y aplicarla con `npm run db:migrate` **antes** de desplegar ([README §6](../README.md#6-base-de-datos-y-migraciones)). |
| Desplegar | Push o merge a `main` en cada repositorio; Render despliega solo ([README §7](../README.md#7-despliegue-render)). |
| Permitir otro dominio del frontend | Agregarlo a `CORS_ORIGIN` del backend en Render, separado por coma. |
| Cambiar la URL de la API en el frontend | Cambiar `VITE_API_URL` en Render y volver a desplegar el frontend (se lee al compilar). |
| Ampliar el asistente | Agregar intenciones en `src/asistente/intenciones.js` del frontend. |
