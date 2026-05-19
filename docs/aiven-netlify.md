# Netlify + Aiven for MySQL

Guia corta para publicar el sistema en Netlify usando Aiven como MySQL remoto. No guardar passwords ni certificados reales en Git.

## Servicio actual

| Campo | Valor |
|---|---|
| Proveedor | Aiven for MySQL |
| Version | MySQL 8.4 |
| Host | `mysql-19a2e940-germans-3052.e.aivencloud.com` |
| Puerto | `19533` |
| Usuario | `avnadmin` |
| Base | `defaultdb` |
| SSL | `REQUIRED` |

El password vive solo en `config/local/.env.aiven` y en variables de Netlify. Como ya fue expuesto durante la configuracion inicial, conviene rotarlo en Aiven antes de dejar el sitio productivo.

## 1. Crear MySQL en Aiven

1. Crea un servicio Aiven for MySQL.
2. Copia host, puerto, usuario, password, database y CA certificate.
3. Usa la base que venga en la URI del servicio, por ejemplo `defaultdb`, o crea una base dedicada si tu plan/permisos lo permiten.

## 2. Preparar el CA para Netlify

Netlify permite variables de entorno, por eso es mas practico guardar el CA PEM en base64:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\config\local\aiven-ca.pem"))
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

Si `TORNOS_API_BASE_URL` quedo configurada de un intento anterior, puedes eliminarla. El build actual no la publica en `public/config.js` salvo que tambien configures `NETLIFY_USE_EXTERNAL_API=true`.

## 4. Migrar datos locales sin perder informacion

El codigo aplica migraciones, pero no mueve datos desde tu MySQL local. Para automatizar la copia usa el script incluido.

Primero copia la plantilla privada:

```powershell
New-Item -ItemType Directory -Force config/local
Copy-Item config/env/.env.aiven.example config/local/.env.aiven
```

Edita `config/local/.env.aiven` con la URI y el CA del servicio Aiven:

```properties
AIVEN_DB_URL=mysql://avnadmin:TU_PASSWORD@mysql-19a2e940-germans-3052.e.aivencloud.com:19533/defaultdb?ssl-mode=REQUIRED
AIVEN_DB_SSL_CA_FILE=aiven-ca.pem
```

Guarda el CA PEM en `config/local/aiven-ca.pem`.

Revisa la conexion y conteos sin copiar datos:

```powershell
npm run aiven:check
```

Cuando el reporte se vea correcto, copia la informacion local hacia Aiven:

```powershell
npm run aiven:migrate
```

Este comando aplica migraciones pendientes en Aiven, limpia las tablas destino y las reemplaza con la copia local. Ejecutalo con el sitio detenido o sin usuarios capturando datos para evitar diferencias.

Estado validado: Aiven tiene las mismas 26 tablas y 397 registros que MySQL local.

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

Antes de publicar o despues de actualizar variables, valida localmente la configuracion equivalente a Netlify:

```powershell
npm run netlify:validate
```

Resultado esperado:

```text
Netlify/Aiven health status: 200
{"status":"UP","database":"mysql"}
```
