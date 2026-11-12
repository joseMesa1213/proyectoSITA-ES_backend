# Pruebas de la API con Postman

Colección: `SITA-ES.postman_collection.json` (127 peticiones, 313 verificaciones).
Entornos: `SITA-ES-local.postman_environment.json` y `SITA-ES-render.postman_environment.json`.

| Carpeta | Qué prueba | Dónde correrla |
|---|---|---|
| **1. Humo (solo lectura)** | Salud, catálogos, login, perfil, consultas públicas y privadas, filtros, errores 400/401/403/404 y permisos por rol. No escribe nada. | Local y Render |
| **2. Flujo completo (solo local)** | Registro, materias, recursos, tutorías, horarios, reservas, cupos, cruces, cancelar, completar, valorar y desactivar. Crea datos de prueba. | Solo en una base de datos de pruebas |

Todas las respuestas se revisan también con una prueba general: `ok: true` si la respuesta es exitosa, y `ok: false` con `error.mensaje` si es un error.

## Importar

1. En Postman: **Import** → arrastrar los tres archivos `.json`.
2. Arriba a la derecha, elegir el entorno **SITA-ES local** o **SITA-ES Render**.

Las cuentas son las de la semilla (`npm run db:seed`, contraseña `Udea123.`). Están en las variables de la colección (pestaña **Variables**).

## Correr

1. Clic derecho en la colección (o en una carpeta) → **Run**.
2. Dejar el orden tal como está: cada petición guarda tokens e ids que usan las siguientes.
3. **Run SITA-ES API**. Al final, Postman muestra cuántas verificaciones pasaron y cuáles fallaron.

Para Render: abrir antes https://proyectosita-es-backend.onrender.com/api/salud y esperar a que responda (el backend se duerme sin uso).

## Por qué el flujo completo no va contra producción

El flujo crea un tutor y un estudiante, una materia, tres recursos, una tutoría y reservas. Al final desactiva lo que creó, pero **la materia queda en el catálogo** (no hay borrado) y deja una valoración de prueba en una tutoría de la semilla. Por eso se corre contra una base de datos de pruebas, no contra la de Supabase que usa Render.

Forma más sencilla: un segundo proyecto en Supabase solo para pruebas.

1. En Supabase, crear un proyecto nuevo (por ejemplo `sita-es-pruebas`).
2. En el backend, copiar `.env` a `.env.pruebas` y poner ahí las cadenas de conexión del proyecto nuevo.
3. Con ese `.env` activo: `npm run db:migrate` y luego `npm run db:seed`.
4. `npm run dev` y correr la colección completa con el entorno **SITA-ES local**.
5. Al terminar, volver al `.env` original.

La colección se puede repetir sobre la misma base: cada corrida usa datos con un sufijo distinto. "Completar una sesión pasada" usa sesiones de la semilla; si después de muchas corridas ya no quedan, esas cuatro peticiones se omiten. Para tener de nuevo todas las sesiones, se vuelve a crear la base y se carga la semilla.

## Por línea de comandos (opcional)

```bash
npx newman run docs/postman/SITA-ES.postman_collection.json -e docs/postman/SITA-ES-local.postman_environment.json
# Solo la carpeta segura, contra Render:
npx newman run docs/postman/SITA-ES.postman_collection.json -e docs/postman/SITA-ES-render.postman_environment.json --folder "1. Humo (solo lectura)"
```
