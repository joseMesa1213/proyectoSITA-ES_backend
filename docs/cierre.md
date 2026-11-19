# SITA-ES — Cierre del proyecto

**Estado:** MVP terminado y desplegado. Backend, frontend y base de datos en producción.
**Fecha de cierre:** noviembre de 2026.

| | URL |
|---|---|
| Aplicación | https://proyectosita-es.onrender.com |
| API | https://proyectosita-es-backend.onrender.com/api/salud |
| Repositorio frontend | https://github.com/joseMesa1213/proyectoSITA-ES |
| Repositorio backend | https://github.com/joseMesa1213/proyectoSITA-ES_backend |
| Manual de usuario | https://github.com/joseMesa1213/proyectoSITA-ES/blob/main/docs/manual-usuario.md |

> Detalle técnico (instalación, convenciones, reglas, endpoints, migraciones y despliegue): [README del backend](../README.md) y [README del frontend](https://github.com/joseMesa1213/proyectoSITA-ES#readme).
> El arranque del proyecto quedó registrado en [etapa-1.md](etapa-1.md).

---

## 1. Qué se entregó

SITA-ES (Sistema de Tutorías Académicas) permite que estudiantes de la universidad reserven cupo en tutorías que publican otros estudiantes que actúan como tutores.

| Rol | Qué puede hacer |
|---|---|
| **Visitante** (sin sesión) | Ver el catálogo de tutorías con filtros por materia, nivel, modalidad y día; ver el detalle con horarios y valoraciones; registrarse con «Continuar con Google» (correo @udea.edu.co). |
| **Estudiante** (todos al registrarse) | Reservar un cupo eligiendo horario semanal y fecha de la sesión; ver su agenda (próximas, completadas, canceladas); cancelar; calificar de 1 a 5 una sesión completada; **solicitar ser tutor** (al registrarse o desde *Mi perfil*). |
| **Tutor** (solicitud aprobada) | Todo lo del estudiante (en tutorías de otros) y además: asociarse a materias, publicar y editar tutorías, agregar o desactivar horarios con su salón o enlace, ver las reservas recibidas por sesión y marcarlas como completadas o canceladas. |
| **Administrador** | Gestionar el catálogo de materias y los recursos (salones físicos y enlaces virtuales con capacidad) y **aprobar o rechazar las solicitudes para ser tutor**. Es **superusuario**: con la misma cuenta también hace todo lo del estudiante y del tutor (menú agrupado en «Tutor» y «Administración»). Se crea con `npm run crear-admin`. |
| **Todos** | **Asistente SITA**: chat guiado que busca tutorías por materia o por tema, con filtros de modalidad, nivel y día, y responde preguntas frecuentes según el rol (ver §4). |

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
- Backend organizado por módulos (`routes → controller → service`): `auth`, `catalogos`, `materias`, `recursos`, `tutorias`, `reservas`, `valoraciones`, `solicitudes`.
- Fechas y horas siempre en la zona `America/Bogota`.

---

## 3. Decisiones principales

| Tema | Decisión |
|---|---|
| Base de datos | PostgreSQL en Supabase. `prisma/schema.prisma` es la fuente de verdad; nadie modifica tablas a mano. |
| Acceso | **Solo con Google @udea.edu.co**, incluidos los administradores: no hay registro por formulario (`POST /auth/registro` responde 403) y el login con contraseña solo existe en desarrollo (`LOGIN_CONTRASENA=true`; en producción responde 403). Las cuentas creadas con Google tienen una contraseña aleatoria que nadie conoce. Ver [`despliegue-solo-google.md`](despliegue-solo-google.md). |
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
- **Busca por tema**: un diccionario relaciona temas con materias ("derivadas" → Cálculo Diferencial, "sql" → Bases de Datos, "mate" → materias de matemáticas). Si el tema no está en el diccionario, lo busca en el título y la descripción de las tutorías ("runge kutta").
- **Entiende filtros** escritos en la pregunta: modalidad ("virtual"), nivel ("básico") y día ("hoy", "mañana", "lunes"). Ej.: "cálculo virtual el martes". Para "hoy" descarta las sesiones que ya empezaron. Los enlaces abren el catálogo con los mismos filtros.
- **Consulta datos del usuario**: próximas reservas y sesiones por calificar (estudiante y tutor); estudiantes inscritos hoy (tutor).
- **Responde preguntas frecuentes** por rol: cómo reservar, cancelar o calificar; por qué no se pudo reservar; por qué no se puede crear un horario; horarios y modalidades; cómo elegir tutor (por valoraciones); cómo entrar con Google; estado de la solicitud para ser tutor; cómo gestionar materias, recursos y solicitudes de tutor (administrador). Si un visitante pregunta por sus reservas, le pide iniciar sesión.
- **Accesible**: el lector de pantalla anuncia cada respuesta nueva, se cierra con Escape y devuelve el foco al botón flotante; en el celular, botones más grandes y campo sin zoom.
- **Solo orienta**: no reserva, cancela ni crea nada; enlaza a la pantalla correspondiente. Así todas las reglas de negocio siguen en el backend.
- No necesita endpoints nuevos ni cambios en la BD. Única dependencia: [Fuse.js](https://www.fusejs.io/) (búsqueda difusa, gratuita).

| Archivo del frontend | Para qué |
|---|---|
| `src/asistente/clasificador.js` | Entiende el texto (función pura, sin API). |
| `src/asistente/temas.js` | Diccionario tema → materia. **Para que entienda un tema nuevo, agregar la palabra aquí.** |
| `src/asistente/intenciones.js` | Preguntas frecuentes por rol. **Para agregar una pregunta, agregar un objeto aquí.** |
| `src/asistente/motor.js` | Arma la respuesta: consulta tutorías y reservas, aplica los filtros y crea los enlaces. |
| `src/asistente/clasificador.test.js` | Pruebas con Vitest (`npm test`): tabla de frases → resultado esperado por rol. |

Las pruebas usan una copia fija de la semilla del backend; si la semilla cambia, hay que actualizar esa copia y los códigos de `temas.js`.

---

## 5. Datos y cuentas de demostración

La BD de producción tiene cargada la semilla (`npm run db:seed`): materias de Ingeniería de Sistemas de la UdeA con sus códigos, aulas de los bloques 19, 20 y 21, salas virtuales, tutorías con horarios, y sesiones pasadas y próximas. Las personas son ficticias.

Contraseña de todas las cuentas: `Udea123.` **Solo sirven en desarrollo** (base local con `LOGIN_CONTRASENA=true`):
en producción se entra solo con Google y estas cuentas se **inactivan** al publicar «solo Google»
([`docs/sql/inactivar-cuentas-demo.sql`](sql/inactivar-cuentas-demo.sql), paso 4 de
[`despliegue-solo-google.md`](despliegue-solo-google.md)). Sus tutorías siguen visibles en el catálogo hasta que haya tutorías reales;
entonces se ocultan con [`docs/sql/ocultar-tutorias-demo.sql`](sql/ocultar-tutorias-demo.sql) (paso 6 de la misma guía).

| Rol | Correo |
|---|---|
| Administrador | `coordinacion.sita-es@demo.sita-es.test` |
| Tutores | `valentina.restrepo@demo.sita-es.test`, `santiago.zapata@demo.sita-es.test`, `mariana.londono@demo.sita-es.test`, `julian.cardona@demo.sita-es.test`, `daniela.henao@demo.sita-es.test` |
| Estudiantes | `camila.gomez@demo.sita-es.test`, `andres.ospina@demo.sita-es.test`, `sara.mejia@demo.sita-es.test`, `tomas.arango@demo.sita-es.test`, `isabella.velez@demo.sita-es.test`, `juan.rios@demo.sita-es.test`, entre otros |

Las cuentas usan el dominio ficticio `@demo.sita-es.test` (`.test` no existe en internet) para que ninguna coincida con el
correo real de una persona de la UdeA, que podría entrar a ella con "Continuar con Google". Al principio usaban
`@udea.edu.co`; en una base ya cargada se cambian con [`docs/sql/cambiar-dominio-demo.sql`](sql/cambiar-dominio-demo.sql).

> ⚠️ Estas cuentas son públicas (están en el repositorio), por eso se inactivan en producción: si alguna vez se encendiera
> `LOGIN_CONTRASENA` por error, nadie podría entrar con ellas, en particular como el administrador de demostración.
> El administrador real se crea con `npm run crear-admin` y un correo @udea.edu.co (entra con Google).

**Antes de una demostración:** abrir https://proyectosita-es-backend.onrender.com/api/salud y esperar a que responda. En el plan gratuito de Render el backend se duerme tras unos 15 minutos sin uso y tarda entre 30 y 50 s en despertar.

---

## 6. Limitaciones conocidas

| Limitación | Situación actual |
|---|---|
| Contraseñas | No hay: se entra con la cuenta de Google @udea.edu.co. Quien no pueda entrar a su correo institucional acude al soporte de la Universidad. Personas sin correo @udea.edu.co no pueden usar SITA-ES. |
| Cambio de rol | Ser tutor: solicitud que aprueba un administrador. Administradores: `npm run crear-admin` (consola). No hay forma de quitarle a alguien el rol de tutor desde la app. |
| Notificaciones | No se envían correos ni recordatorios de las sesiones. |
| Asistente | Entiende materias, temas de un diccionario ("derivadas", "SQL") y filtros (modalidad, nivel, día), pero no frases complejas: no usa IA. Un tema que no esté en `temas.js` solo lo encuentra si aparece en el título o la descripción de una tutoría, y las tutorías recién publicadas pueden tardar hasta 5 minutos en aparecer en sus búsquedas (caché). |
| Filtro por día | Lo aplica el frontend sobre las tutorías ya cargadas; el backend no filtra por día. |
| Pruebas automatizadas | Pruebas unitarias con Vitest en backend (`npm test`, 76) y frontend (asistente, inicio de sesión y componentes de interfaz, 116); la API se verifica con la colección de Postman en `docs/postman/` (148 peticiones, 375 verificaciones; contra Render solo la carpeta Humo, sin sesión). No hay pruebas de interfaz automatizadas. |
| Plan gratuito de Render | El backend se duerme sin uso y la primera petición es lenta. |

---

## 7. Pendientes a cargo del equipo

- [x] **Colección de Postman**: exportarla a `docs/` con dos entornos (`local` → `http://localhost:3000/api` y `render` → `https://proyectosita-es-backend.onrender.com/api`), con casos correctos y de error por endpoint.
- [x] **Prueba del Asistente SITA** en producción con los cuatro roles (visitante, estudiante, tutor, administrador): búsquedas por materia y por tema con y sin errores de escritura, filtros, cada botón del menú y preguntas libres.
- [x] **Cambiar el dominio de las cuentas de demostración en producción**: [`docs/sql/cambiar-dominio-demo.sql`](sql/cambiar-dominio-demo.sql)
  aplicado en Supabase; las cuentas de demostración entran con `@demo.sita-es.test`.
- [x] **Publicar las solicitudes para ser tutor**: respaldo, migración y publicación hechos según
  [`docs/despliegue-solicitudes-tutor.md`](despliegue-solicitudes-tutor.md); los 7 tutores que existían quedaron con su
  solicitud aprobada. La compatibilidad temporal de `id_rol` en el registro ya se quitó: cualquier `id_rol` responde 400.
- [ ] **Publicar «solo Google»** (rama `feature/solo-google` en los dos repositorios): crear el administrador con
  `crear-admin`, publicar backend y frontend, **inactivar las cuentas de demostración** y verificar, en ese orden, según
  [`docs/despliegue-solo-google.md`](despliegue-solo-google.md).
- [x] **Rutas internas del frontend en Render**: regla *Rewrite* `/*` → `/index.html` configurada (ver el [README del frontend](https://github.com/joseMesa1213/proyectoSITA-ES#despliegue-render)). Sin ella, abrir o recargar directamente una ruta como `/mis-reservas` responde `Not Found`.

---

## 8. Mantenimiento

| Tarea | Cómo |
|---|---|
| Cambiar el esquema de la BD | Editar `schema.prisma`, generar la migración y aplicarla con `npm run db:migrate` **antes** de desplegar ([README §6](../README.md#6-base-de-datos-y-migraciones)). |
| Desplegar | Push o merge a `main` en cada repositorio; Render despliega solo ([README §7](../README.md#7-despliegue-render)). |
| Mantener la API despierta | Flujo de GitHub Actions `mantener-despierto.yml` (cada 5 min a `/api/materias`). Activarlo o desactivarlo en la pestaña *Actions* del repositorio del backend ([README §7](../README.md#7-despliegue-render)). |
| Permitir otro dominio del frontend | Agregarlo a `CORS_ORIGIN` del backend en Render, separado por coma. |
| Cambiar la URL de la API en el frontend | Cambiar `VITE_API_URL` en Render y volver a desplegar el frontend (se lee al compilar). |
| Ampliar el asistente | Preguntas nuevas en `src/asistente/intenciones.js` y temas nuevos en `src/asistente/temas.js` del frontend; agregar el caso a `clasificador.test.js` y correr `npm test`. |
| Agregar una funcionalidad | **Revisar también el asistente** (README del frontend, sección *Asistente SITA*): respuestas que la mencionen, pregunta nueva con sus pruebas, y la ruta en `utils/titulos.js` (`enlaces.test.js` detecta enlaces rotos). |
