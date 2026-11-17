# Pruebas de la API con Postman

Colección: `SITA-ES.postman_collection.json` (148 peticiones: 28 de humo y 120 del flujo completo).
Entornos: `SITA-ES-local.postman_environment.json` y `SITA-ES-render.postman_environment.json`.

En producción **solo se entra con Google @udea.edu.co**: el login con contraseña responde 403 (salvo con
`LOGIN_CONTRASENA=true`, solo en desarrollo) y el registro por formulario responde 403 siempre. Por eso:

| Carpeta | Qué prueba | Dónde correrla |
|---|---|---|
| **1. Humo (solo lectura)** | Sin iniciar sesión: salud, catálogos, consultas públicas (materias, tutorías, detalle, valoraciones), filtros, 401 sin token o con token falso, errores de Google que no necesitan una cuenta real, y el 403 del login con contraseña y del registro por formulario. No escribe nada. | Local y Render |
| **2. Flujo completo (solo local)** | Entra con las cuentas de la semilla (necesita `LOGIN_CONTRASENA=true`), consultas y permisos con sesión, registro con Google (`/auth/google/registro`) con «Quiero ser tutor», solicitud aprobada y rechazada, registro con `id_rol` rechazado (400), materias, recursos, tutorías, horarios, reservas, cupos, cruces, cancelar, completar, valorar y desactivar. Crea datos de prueba. | Solo contra el backend local |

Todas las respuestas se revisan también con una prueba general: `ok: true` si la respuesta es exitosa, y `ok: false` con `error.mensaje` si es un error.

Variables de los entornos:

| Variable | local | Render | Para qué |
|---|---|---|---|
| `baseUrl` | `http://localhost:3000/api` | `https://proyectosita-es-backend.onrender.com/api` | Servidor |
| `login_contrasena` | `true` | `false` | Lo que se espera del login con contraseña: 401 con un correo inexistente (`true`) o 403 «use Google» (`false`). Debe coincidir con `LOGIN_CONTRASENA` del backend. |
| `jwt_secret` | vacío (se pasa al correr) | — | El `JWT_SECRET` del `.env` local. **No se guarda en el archivo.** |

## Cómo se registran usuarios nuevos sin una cuenta de Google

En la aplicación, «Continuar con Google» devuelve un `token_registro` (firmado por el backend, dura 15 minutos) y la
pantalla «Completar registro» lo envía a `POST /auth/google/registro` con los datos que faltan.

Postman no puede iniciar sesión en Google, así que la petición *Calcular fechas, sufijo y tokens de registro*
(carpeta *Preparación*) **firma esos `token_registro` ella misma**, igual que el backend: JWT HS256 con el secreto
`JWT_SECRET + ":registro-google"` y `{ tipo: "registro_google", correo, nombre, apellido }`. Por eso necesita
`jwt_secret`. Solo sirve en local: el `JWT_SECRET` de producción no se usa para pruebas.

## Correr por línea de comandos (recomendado)

Con el backend local encendido (`npm run dev`), la semilla cargada y `LOGIN_CONTRASENA=true` en el `.env`:

```bash
npm run postman:local
```

```bash
npm run postman:local -- -i "1. Humo (solo lectura)"
```

`scripts/postman-local.js` lee `JWT_SECRET` del `.env`, lo pone en una copia temporal del entorno local (se borra al
terminar; el secreto no aparece en pantalla) y corre Postman CLI. Se niega a correr si `DATABASE_URL` no apunta a
una base local.

Humo contra Render (no inicia sesión ni escribe):

```bash
postman collection run docs/postman/SITA-ES.postman_collection.json -e docs/postman/SITA-ES-render.postman_environment.json -i "1. Humo (solo lectura)"
```

Antes, abrir https://proyectosita-es-backend.onrender.com/api/salud y esperar a que responda (el backend se duerme sin uso).
Los dos 403 (login y registro) solo pasan cuando la versión «solo Google» esté desplegada; antes de eso el registro
responde 400 (la petición va incompleta a propósito para que nunca cree una cuenta).

Si Postman o el backend se cierran con *out of memory*, es el equipo con poca RAM libre: cerrar programas o arrancar
el backend sin nodemon (`node --env-file=.env src/server.js`) y volver a correr.

## Correr desde la aplicación de Postman

1. **Import** → arrastrar los tres archivos `.json`.
2. Elegir el entorno **SITA-ES local** y escribir en `jwt_secret` (columna *Current value*, que no se exporta) el
   `JWT_SECRET` del `.env` local. Sin él, la preparación falla con «jwt_secret definido».
3. Clic derecho en la colección (o en una carpeta) → **Run**, dejando el orden: cada petición guarda tokens e ids que
   usan las siguientes.

Las cuentas de la semilla (`npm run db:seed`, contraseña `Udea123.`) están en las variables de la colección.

## Por qué el flujo completo no va contra producción

El flujo inicia sesión con contraseña (apagado en producción), crea un tutor y un estudiante, una materia, tres
recursos, una tutoría y reservas. Al final desactiva lo que creó, pero **la materia queda en el catálogo** (no hay
borrado) y deja una valoración de prueba en una tutoría de la semilla. Por eso se corre solo contra la base local
(PostgreSQL en Docker, contenedor `sita-es-db`).

La colección se puede repetir sobre la misma base: cada corrida usa datos con un sufijo distinto. "Completar una sesión pasada" usa sesiones de la semilla; si después de muchas corridas ya no quedan, esas cuatro peticiones se omiten. Para tener de nuevo todas las sesiones, se vuelve a crear la base y se carga la semilla.
