# Despliegue: solo Google @udea.edu.co

Pasos para publicar la rama `feature/solo-google` (backend y frontend). Los hace el dueño de la BD y de Render (José).
Comandos para **PowerShell**, desde la carpeta `proyectoSITA-ES_backend`, con Docker Desktop abierto.

## Qué cambia

- **Solo se entra con «Continuar con Google»** y un correo @udea.edu.co, también los administradores.
- `POST /auth/login` (correo y contraseña) responde **403** «use Google», salvo con `LOGIN_CONTRASENA=true`, que es
  **solo para desarrollo** (cuentas de la semilla y Postman en local). En Render **no se define**.
- `POST /auth/registro` responde **403** siempre. El registro es solo con Google (pantalla «Completar registro», con
  la casilla «Quiero ser tutor»). El frontend ya no tiene la página `/registro` (redirige a `/login`).
- `npm run crear-admin` no pide contraseña para correos @udea.edu.co: el administrador entra con Google.
  El rol sigue saliendo de la BD y solo `crear-admin` lo pone en 3.
- **No hay migración**: la base no cambia de estructura.
- Las cuentas de demostración (`@demo.sita-es.test`, contraseña conocida) se **inactivan** en producción: es obligatorio.

## Orden

| Paso | Qué | Si falla |
|---|---|---|
| 0 | Respaldo de producción | No seguir |
| 1 | Crear el administrador de José con `crear-admin` (correo @udea.edu.co) | No seguir: sin él, nadie administra después del paso 2 |
| 2 | Merge del PR del **backend** → Render despliega | Revertir el merge (el paso 1 no estorba al código anterior) |
| 3 | Merge del PR del **frontend** → Render despliega | Revertir el merge |
| 4 | **Inactivar las cuentas de demostración** (SQL) | El script se deshace solo si falla; ver abajo |
| 5 | Verificación | — |
| 6 | **Después**, cuando ya haya tutorías reales publicadas: ocultar las tutorías de demostración (SQL) | El script se deshace solo si falla; si no hay tutorías reales, se niega |

Los pasos 2 a 5 conviene hacerlos seguidos, el mismo día. El paso 6 no tiene fecha: se hace cuando los tutores
reales ya hayan publicado sus tutorías desde la app.

## 0. Preparar y respaldar

```powershell
git fetch
git switch feature/solo-google
npm install
npm run respaldo -- .env.produccion
```

El respaldo solo **lee** la base y deja `respaldos/sita-es-produccion-AAAAMMDD-HHMMSS.dump` (ignorado por git, con
datos personales: no subirlo). Si dice "pg_dump terminó con error", no seguir. Para restaurarlo, ver
`docs/despliegue-solicitudes-tutor.md`, «Si hay que volver atrás».

## 1. Crear el administrador (José)

`crear-admin` usa el archivo `.env`: se cambia por el de producción solo durante este paso.

```powershell
Copy-Item .env .env.local -Force          # guarda el .env local
Copy-Item .env.produccion .env -Force     # ahora .env apunta a PRODUCCIÓN

npm run crear-admin

Copy-Item .env.local .env -Force          # IMPORTANTE: volver al .env local
```

- Muestra a qué servidor se conecta y pide escribir `SI`.
- Correo: el **@udea.edu.co** de José. No pide contraseña.
  - Si José **ya tiene cuenta** (entró antes con Google como estudiante o tutor), ofrece convertirla en administrador
    (escribir `SI`). Conserva sus datos.
  - Si **no tiene cuenta**, pide nombre, apellido y documento y la crea como administrador.
- Termina con «Entra con «Continuar con Google»». Hasta el paso 2 todavía no puede entrar (el backend publicado
  bloquea a los administradores en Google); es normal.
- Si escribe un correo de otro dominio, el script avisa que **no** podrá entrar con Google y que solo sirve en
  desarrollo: en producción, responder que no.

## 2. Backend

1. En Render → servicio del backend → **Environment**, revisar:

   | Variable | Valor |
   |---|---|
   | `LOGIN_CONTRASENA` | **No debe existir** (si existe, borrarla). Cualquier valor distinto de `true` también la deja apagada. |
   | `GOOGLE_CLIENT_ID` | El ID de cliente OAuth (el mismo `VITE_GOOGLE_CLIENT_ID` del frontend). Sin él, nadie puede entrar. |
   | `GOOGLE_DOMINIO` | `udea.edu.co` o no definida (es el valor por defecto). |

2. Merge del PR del backend a `main`. Render despliega solo.
3. Abrir https://proyectosita-es-backend.onrender.com/api/salud y esperar a que responda.
4. Correr la carpeta segura de Postman (no inicia sesión ni escribe):

   ```powershell
   postman collection run docs/postman/SITA-ES.postman_collection.json -e docs/postman/SITA-ES-render.postman_environment.json -i "1. Humo (solo lectura)"
   ```

   Debe pasar todo (28 peticiones), incluidos «Login con contraseña → 403» y «Registro por formulario → 403».
   Si el login responde 401 en vez de 403, `LOGIN_CONTRASENA=true` quedó definida en Render: borrarla.

## 3. Frontend

1. En Render → sitio del frontend → **Environment**, revisar:

   | Variable | Valor |
   |---|---|
   | `VITE_LOGIN_CONTRASENA` | **No debe existir**. Si existiera con `true`, el formulario de contraseña aparecería (el backend igual respondería 403). |
   | `VITE_GOOGLE_CLIENT_ID` | El mismo `GOOGLE_CLIENT_ID` del backend. Si falta, la página de inicio de sesión no muestra ninguna forma de entrar. |
   | `VITE_API_URL` | `https://proyectosita-es-backend.onrender.com/api` (sin cambios). |

   Las variables `VITE_` se leen **al compilar**: si se cambia alguna, hacer **Manual Deploy → Clear build cache & deploy**.
2. Merge del PR del frontend a `main`. Render despliega solo.
3. En Google Cloud Console → Credenciales → el ID de cliente OAuth: `https://proyectosita-es.onrender.com` debe seguir
   en «Orígenes autorizados de JavaScript» (ya está, porque el botón de Google funciona hoy).

## 4. Inactivar las cuentas de demostración (obligatorio)

Las 16 cuentas de la semilla (`@demo.sita-es.test`: un administrador, 5 tutores y 10 estudiantes) tienen la
contraseña `Udea123.`, que está en la documentación. Con `LOGIN_CONTRASENA` apagada nadie puede usarla, pero si algún
día se enciende por error, cualquiera entraría — y como **administrador de demostración**, podría aprobar tutores o
cambiar el catálogo. Inactivas, no entran de ninguna forma.

1. Supabase → **SQL Editor** → pegar todo `docs/sql/inactivar-cuentas-demo.sql` → **Run**.
   - Pone `id_estado = 2` (Inactivo) **solo** a correos que terminan en `@demo.sita-es.test`. No borra nada ni cambia
     contraseñas, roles, tutorías, reservas o valoraciones.
   - Antes comprueba que exista un administrador **activo** con correo @udea.edu.co (el del paso 1). Si no lo hay, se
     detiene con «Primero: npm run crear-admin» y no cambia nada.
   - Debe mostrar «Cuentas de demostración inactivadas: 16» (o «ninguna» si ya se había corrido).
     Si la primera consulta sale vacía y nunca se había corrido, revisar que `docs/sql/cambiar-dominio-demo.sql` esté
     aplicado (las cuentas de demostración deben tener `@demo.sita-es.test`, no `@udea.edu.co`).
2. Pegar y correr `docs/sql/verificar-cuentas-demo.sql` (solo lee). Qué esperar:
   1. Una fila: `Inactivo | 16`.
   2. Vacío (ninguna cuenta de demostración activa).
   3. El administrador de José, con «entra con Google». Ninguno con «REVISAR».
   4. y 5. Informativas: ver la sección siguiente.

Las sesiones abiertas de esas cuentas dejan de servir en la siguiente petición (el backend lee el estado de la BD).

### Qué pasa con las tutorías de demostración

Inactivar a un usuario **no** inactiva sus tutorías: las de los 5 tutores de demostración (consulta 4) siguen en el
catálogo y se pueden reservar, pero su tutor ya no puede entrar a marcar sesiones como completadas ni cancelar.
Las reservas activas que involucran cuentas de demostración aparecen en la consulta 5.
Se dejan así a propósito para que el catálogo no quede vacío mientras los tutores reales publican las suyas.
Se ocultan después, en el paso 6. No se reasignan a tutores reales: se mostrarían a nombre de alguien que no
eligió esos horarios, con valoraciones que no son suyas, y se saltarían las validaciones de la app (cruces,
capacidad, modalidad).

## 5. Verificación

1. https://proyectosita-es.onrender.com/login: solo el botón «Continuar con Google» (sin correo ni contraseña, sin
   enlace para registrarse). `/registro` lleva a `/login`.
2. José entra con Google → ve el menú de administrador (Materias, Recursos, Solicitudes de tutor).
3. Alguien con un correo @udea.edu.co que nunca haya entrado → «Completar registro» → queda como estudiante (y con
   solicitud pendiente si marcó «Quiero ser tutor»). José la ve en **Solicitudes de tutor**.
4. Una cuenta de Google que no sea @udea.edu.co → SITA-ES la rechaza con el mensaje del dominio.
5. Postman: la carpeta Humo contra Render (paso 2.4) pasa completa.
6. SQL de verificación (paso 4.2) como se describe.

## 6. Después: ocultar las tutorías de demostración

Se hace **cuando ya haya tutorías reales publicadas** (días o semanas después del despliegue), para que nadie
reserve una sesión de un tutor de demostración que ya no puede entrar.

1. **¿Ya es el momento?** Supabase → SQL Editor → `docs/sql/contar-tutorias-reales.sql` (solo lee):
   - Consulta 1: los tutores activos @udea.edu.co y cuántas tutorías tiene cada uno con horario.
   - Consulta 2: el catálogo actual separado en «real» y «demostración» (tutorías y materias).

   Si la fila «real» tiene pocas tutorías o materias, conviene esperar o pedir a los tutores que publiquen.
2. **Ocultar:** pegar todo `docs/sql/ocultar-tutorias-demo.sql` → **Run**. Hace lo mismo que el botón
   «Inactivar tutoría» de la app (que no se puede usar porque nadie entra con esas cuentas):
   - Cancela solo las reservas **activas** de sesiones que **aún no empiezan** (fecha futura, o de hoy con hora de
     inicio por venir, hora de Bogotá).
   - Inactiva los horarios activos y las tutorías de los tutores `@demo.sita-es.test`.
   - **No toca** reservas pasadas o ya empezadas, valoraciones, materias, recursos ni tutorías de otros tutores. No borra nada.
   - Si no hay ninguna tutoría real activa con horario, se detiene sin cambiar nada (el catálogo quedaría vacío).
   - Debe mostrar «Tutorías ocultadas: N. Horarios inactivados: N. Reservas futuras canceladas: N…».
3. **Verificar:** `docs/sql/verificar-tutorias-demo.sql` (solo lee). Qué esperar:
   1. `0 | 0` (ninguna tutoría ni horario de demostración activo).
   2. Vacío (ninguna reserva futura activa en tutorías de demostración).
   3. Informativa: el historial (completadas, canceladas, valoraciones) sigue ahí.
   4. Un número mayor que 0 (tutorías reales visibles).

Las reservas canceladas eran de cuentas de demostración (inactivas) o de alguien real que reservó con un tutor de
demostración. En ese segundo caso la persona verá la reserva como cancelada en «Mi agenda»; no se envían correos.

Prueba hecha en la base local (dentro de una transacción con `ROLLBACK`, sin dejar cambios): primero se negó por
falta de tutorías reales; con una tutoría real de prueba ocultó 10 tutorías, inactivó 18 horarios y canceló las 103
reservas futuras activas. Las 124 reservas pasadas, las 69 valoraciones y las tutorías de otros tutores quedaron igual.

## Qué pasa si se hace en otro orden

| Si… | Qué pasa | Cómo se arregla |
|---|---|---|
| Se publica el backend (2) **sin** haber creado el administrador (1) | El único administrador es el de demostración, que entraba con contraseña: ya no puede. **Nadie administra** (no se aprueban tutores ni se editan materias o recursos) hasta crear uno. Estudiantes y tutores no se ven afectados. | Correr el paso 1. |
| Se publica el frontend (3) **antes** que el backend (2) | El frontend nuevo no muestra el formulario, y el backend anterior **bloquea a los administradores en Google**: ningún administrador puede entrar. Además, el registro por formulario sigue abierto en la API. | Publicar el backend. |
| Pasa tiempo entre el backend (2) y el frontend (3) | El frontend anterior muestra el formulario de contraseña y la página de registro, pero el backend responde 403 con «Use «Continuar con Google»…». Molesto, no peligroso. | Publicar el frontend. |
| Se inactivan las cuentas demo (4) **antes** de crear el administrador (1) | El script se niega («Primero: npm run crear-admin») y no cambia nada. | Hacer el paso 1 y volver a correrlo. |
| Se inactivan las cuentas demo (4) **antes** del backend (2) | Funciona, pero mientras siga el backend anterior José no puede entrar como administrador (Google bloquea administradores y su contraseña es aleatoria): no hay administrador en esa ventana. | Publicar el backend. |
| **No** se inactivan las cuentas demo (4) | Todo funciona, pero queda el riesgo: si alguien define `LOGIN_CONTRASENA=true` en Render, cualquiera entra con `Udea123.`, incluso como administrador. | Correr el paso 4. |
| Se ocultan las tutorías demo (6) **antes** de que haya tutorías reales | El script se niega y no cambia nada. Si se forzara a mano, el catálogo quedaría vacío. | Esperar a que los tutores publiquen. |
| Se ocultan las tutorías demo (6) **antes** de inactivar las cuentas (4) | Funciona igual (no depende del paso 4). | — |
| **No** se ocultan nunca (6) | Alguien podría reservar una sesión de un tutor de demostración que no va a llegar. | Correr el paso 6. |
| `LOGIN_CONTRASENA=true` queda en Render | Vuelve el login con contraseña en producción. Con el paso 4 hecho, las cuentas demo igual no entran; las cuentas reales tienen contraseñas aleatorias. | Borrar la variable en Render. |

## Para desarrollo (local)

- Backend: `LOGIN_CONTRASENA=true` en el `.env` local (ya está en `.env.example`). Así entran las cuentas de la
  semilla y corre Postman (`npm run postman:local`).
- Frontend: `VITE_LOGIN_CONTRASENA=true` en el `.env` local muestra el formulario «Solo desarrollo».
- Las cuentas de demostración solo se inactivan en producción: en la base local siguen activas.
