# Despliegue: solicitudes para ser tutor

Pasos para publicar el cambio de la rama `feature/capacidad-tutor` (backend y frontend). Los hace el dueño de la BD (José).
Comandos para **PowerShell**, desde la carpeta `proyectoSITA-ES_backend`, con Docker Desktop abierto.

## Qué cambia

- `id_rol` pasa a ser un **nivel de permisos**: 1 Estudiante (todos al registrarse), 2 Estudiante + Tutor
  (cuando un administrador aprueba su solicitud), 3 Administrador (solo con `npm run crear-admin`).
- Nueva tabla `tbl_solicitud_tutor` y dos estados nuevos en `tbl_estado` (6 Aprobado, 7 Rechazado).
- La migración **solo agrega**: no cambia ni borra datos. Los tutores actuales quedan con una solicitud *Aprobada*
  y conservan su `id_rol = 2`. El backend que está publicado hoy sigue funcionando con la base ya migrada,
  por eso la migración va **antes** de publicar el código.

## Orden

| Paso | Qué | Si falla |
|---|---|---|
| 1 | Respaldo de producción | No seguir |
| 2 | Migración en producción | Restaurar el respaldo (ver abajo); el código publicado sigue igual |
| 3 | Merge del PR del **backend** → Render despliega | Revertir el merge; la base migrada sirve con el código anterior |
| 4 | Merge del PR del **frontend** → Render despliega | Revertir el merge |
| 5 | Revisar solicitudes que llegaron entre 3 y 4 | — |
| 6 | ✅ Hecho: PR que quita la compatibilidad de `id_rol` | — |

Entre los pasos 3 y 4 el frontend publicado todavía envía `id_rol` al registrarse. El backend lo acepta por
compatibilidad: `id_rol 1` → estudiante; `id_rol 2` → estudiante con solicitud de tutor **pendiente**
(quien eligió "Tutor" en esa ventana debe ser aprobado en el panel); cualquier otro → 400. Conviene hacer el paso 4
justo después del 3.

## 0. Preparar

```powershell
git fetch
git switch feature/capacidad-tutor
npm install
npx prisma generate
```

`.env.produccion` debe tener `DATABASE_URL` y `DIRECT_URL` de Supabase (la directa, puerto 5432).

## 1. Respaldo (antes de tocar nada)

```powershell
npm run respaldo -- .env.produccion
```

- Usa `pg_dump` 17 dentro de Docker (no hay que instalar PostgreSQL) y **solo lee** la base.
- Deja `respaldos/sita-es-produccion-AAAAMMDD-HHMMSS.dump` (ignorado por git). Tiene datos personales: no subirlo ni compartirlo.
- Si dice "pg_dump terminó con error", **no seguir**.

## 2. Migración

Prisma usa el archivo `.env`: se cambia por el de producción solo durante este paso.

```powershell
Copy-Item .env .env.local -Force          # guarda el .env local
Copy-Item .env.produccion .env -Force     # ahora .env apunta a PRODUCCIÓN

npm run db:status    # debe listar 1 migración pendiente: 20261116000000_solicitudes_tutor
npm run db:migrate   # la aplica
npm run db:status    # debe decir "Database schema is up to date!"

Copy-Item .env.local .env -Force          # IMPORTANTE: volver al .env local
```

### Verificación (Supabase → SQL Editor)

```sql
-- Estados nuevos: deben aparecer 6 Aprobado y 7 Rechazado
SELECT id, nombre FROM tbl_estado ORDER BY id;

-- Cada tutor existente tiene una solicitud aprobada: las dos cifras deben ser iguales
SELECT (SELECT count(*) FROM tbl_usuario WHERE id_rol = 2) AS tutores,
       (SELECT count(*) FROM tbl_solicitud_tutor WHERE id_estado = 6) AS solicitudes_aprobadas;

-- Índice que impide dos solicitudes pendientes del mismo usuario: debe devolver 1 fila
SELECT indexname FROM pg_indexes WHERE indexname = 'uq_solicitud_tutor_pendiente';
```

## 3 y 4. Publicar

1. En Render (backend), confirmar que existe `GOOGLE_CLIENT_ID` (el `.env.produccion` actual no la tiene).
2. Merge del PR del backend. Cuando Render termine: abrir `/api/salud` y correr la carpeta segura de Postman:
   ```powershell
   postman collection run docs/postman/SITA-ES.postman_collection.json -e docs/postman/SITA-ES-render.postman_environment.json -i "1. Humo (solo lectura)"
   ```
3. Merge del PR del frontend.

## 5. Revisar solicitudes

Entrar como administrador → **Solicitudes de tutor**. Aprobar a quien se registró como "Tutor" mientras el frontend
anterior seguía publicado.

## 6. Quitar la compatibilidad ✅ hecho

Se hizo en la rama `feature/quitar-compat-id-rol`, después de publicar el frontend nuevo: en
`src/modules/auth/auth.service.js`, la función `quiereSerTutor` ya no tiene el bloque de compatibilidad. Desde entonces
cualquier `id_rol` en el registro (normal o con Google), incluidos 1 y 2, responde 400 "El rol no se elige en el registro".

## Crear un administrador

```powershell
npm run crear-admin
```

Muestra a qué base se conectará y pide escribir `SI`. Pregunta correo, nombre, documento y contraseña (no se ve al
escribirla; mínimo 10 caracteres). Si el correo ya existe, ofrece convertir esa cuenta en administrador.
Para producción, hacer el mismo cambio temporal de `.env` del paso 2 (y volver al local al terminar).

## Si hay que volver atrás: restaurar el respaldo

Solo si la migración dejó la base en mal estado. **Reemplaza las tablas de SITA-ES** por las del respaldo.

```powershell
# 1. La URL directa SIN ?pgbouncer=true (copiar DIRECT_URL de .env.produccion). No queda en el historial si se pega aquí:
$env:PGURL = Read-Host "DIRECT_URL de producción"
# 2. Restaurar (cambiar el nombre del archivo)
docker run --rm -e PGURL -v "${PWD}\respaldos:/respaldos" postgres:17-alpine sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -d "$PGURL" /respaldos/sita-es-produccion-AAAAMMDD-HHMMSS.dump'
Remove-Item Env:PGURL
```

- El aviso `schema "public" already exists` es normal (el esquema ya existe en toda base).
- Si el servidor es anterior a PostgreSQL 17 también puede aparecer `unrecognized configuration parameter "transaction_timeout"`: tampoco afecta.
- Después, comprobar con `npm run db:status` (con el `.env` de producción) que la migración ya no figura como aplicada.
