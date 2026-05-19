# Netlify + Aiven for MySQL

Guia corta para publicar el sistema en Netlify usando Aiven como MySQL remoto.

## 1. Crear MySQL en Aiven

1. Crea un servicio Aiven for MySQL.
2. Copia host, puerto, usuario, password, database y CA certificate.
3. Usa la base que venga en la URI del servicio, por ejemplo `defaultdb`, o crea una base dedicada si tu plan/permisos lo permiten.

## 2. Preparar el CA para Netlify

Netlify permite variables de entorno, por eso es mas practico guardar el CA PEM en base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\ca.pem"))
```

Copia el resultado en `DB_SSL_CA_BASE64`.

## 3. Variables en Netlify

Configura en Site configuration > Environment variables:

```properties
NODE_ENV=production
DB_URL=mysql://avnadmin:TU_PASSWORD@TU_HOST_AIVEN:TU_PUERTO/defaultdb?ssl-mode=REQUIRED
DB_SSL=true
DB_SSL_CA_BASE64=BASE64_DEL_CA_PEM_DE_AIVEN
APP_BOOTSTRAP_ADMIN_USERNAME=admin
APP_BOOTSTRAP_ADMIN_PASSWORD=CAMBIAR_Admin_2026!
APP_SESSION_STORAGE=database
APP_UPLOAD_STORAGE=database
DB_POOL_SIZE=2
```

No configures `TORNOS_API_BASE_URL` si el backend correra en Netlify Functions dentro del mismo sitio.

## 4. Migrar datos locales sin perder informacion

El codigo aplica migraciones, pero no mueve datos desde tu MySQL local. Para copiar datos usa `mysqldump` desde tu maquina:

```powershell
mysqldump --host=localhost --port=3306 --user=tornos_app --password tornos_sa_cv --single-transaction --routines --triggers --set-gtid-purged=OFF > tornos_sa_cv.sql
```

Luego importa a Aiven:

```powershell
mysql --host=TU_HOST_AIVEN --port=TU_PUERTO --user=avnadmin --password --ssl-mode=REQUIRED --ssl-ca=.\ca.pem defaultdb < tornos_sa_cv.sql
```

Si importas antes de desplegar, la primera ejecucion en Netlify solo registrara o aplicara migraciones pendientes. Si importas despues, hazlo con el sitio detenido o sin usuarios capturando datos para evitar diferencias.

## 5. Desplegar

En Netlify:

```text
Build command: node scripts/write-netlify-config.mjs
Publish directory: public
Functions directory: netlify/functions
```

Despues de publicar, prueba:

```text
https://TU-SITIO.netlify.app/api/health
```

Si responde `{"status":"UP","database":"mysql"}`, el sitio ya esta usando la funcion y MySQL remoto.
