# Tornos SA de CV

Sistema web/API para operacion administrativa de Tornos SA de CV: catalogos, produccion, compras, almacen, remisiones, reportes, seguridad y auditoria.

La aplicacion usa **Node.js + Express + MySQL**. No hay modo demo ni base local en memoria: todos los datos viven en MySQL.

## Estado Actual

| Area | Estado |
|---|---|
| Frontend | `public/`, publicado por Netlify |
| Backend | Express en `src/server.js` |
| Netlify | `/api/**` redirige a `netlify/functions/api.mjs` |
| Base remota | Aiven for MySQL 8.4 con SSL |
| Datos Aiven | Validado: 26 tablas, 397 registros, igual que MySQL local |
| Health validado | `npm run netlify:validate` responde `200 {"status":"UP","database":"mysql"}` |

## Estructura

```text
.
|-- src/                 Backend Express y logica de negocio
|-- public/              Frontend estatico
|-- netlify/functions/   Adaptador serverless para Netlify
|-- db/migrations/       Migraciones SQL versionadas
|-- config/env/          Plantillas de variables de entorno
|-- config/local/        Archivos privados locales ignorados por Git
|-- scripts/             Build, validacion y migracion Aiven
|-- docs/                Documentacion tecnica
|-- netlify.toml         Build, functions y redirects de Netlify
|-- package.json         Scripts npm y dependencias
`-- .env                 Configuracion local privada
```

No versionar `.env`, `config/local/`, `node_modules`, `logs` ni `uploads`.

## Scripts

| Comando | Uso |
|---|---|
| `npm install` | Instala dependencias. |
| `npm start` | Arranca localmente en `SERVER_PORT`. |
| `npm run dev` | Arranca con `node --watch`. |
| `npm run check` | Valida sintaxis de `src/server.js`. |
| `npm run aiven:check` | Compara conteos local vs Aiven sin copiar datos. |
| `npm run aiven:migrate` | Reemplaza Aiven con la copia de MySQL local. Usar con cuidado. |
| `npm run netlify:validate` | Simula Netlify Functions contra Aiven y prueba `/api/health`. |
| `npm audit --audit-level=moderate` | Revisa vulnerabilidades. |

## Desarrollo Local

1. Instala dependencias:

```powershell
npm install
```

2. Copia la plantilla:

```powershell
Copy-Item config/env/.env.example .env
```

3. Configura `.env` con tu MySQL local:

```properties
SERVER_PORT=8080
NODE_ENV=development
DB_URL=jdbc:mysql://localhost:3306/tornos_sa_cv?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=America/Mexico_City
DB_USER=tornos_app
DB_PASSWORD=CAMBIAR_password_largo_base_datos
APP_BOOTSTRAP_ADMIN_USERNAME=admin
APP_BOOTSTRAP_ADMIN_PASSWORD=CAMBIAR_Admin_2026!
APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=false
```

4. Arranca:

```powershell
npm start
```

5. Abre:

```text
http://localhost:8080
```

Credenciales iniciales:

```text
Usuario: valor de APP_BOOTSTRAP_ADMIN_USERNAME
Password: valor de APP_BOOTSTRAP_ADMIN_PASSWORD
```

Las credenciales reales del ambiente actual se documentan solo en `config/local/credenciales-acceso.txt`, que esta ignorado por Git.

Si el usuario ya existe y necesitas sincronizar password, cambia temporalmente `APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=true`, arranca una vez y vuelve a dejarlo en `false`.

`APP_BOOTSTRAP_ADMIN_PASSWORD` solo es obligatorio cuando la base esta vacia y el sistema debe crear el administrador inicial, o cuando activas `APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=true`.

## Aiven

Servicio configurado:

| Campo | Valor |
|---|---|
| Servicio | Aiven for MySQL |
| Host | `mysql-19a2e940-germans-3052.e.aivencloud.com` |
| Puerto | `19533` |
| Usuario | `avnadmin` |
| Base | `defaultdb` |
| SSL | `REQUIRED` |

Configura el archivo privado local:

```powershell
New-Item -ItemType Directory -Force config/local
Copy-Item config/env/.env.aiven.example config/local/.env.aiven
notepad config/local/.env.aiven
```

Formato esperado:

```properties
AIVEN_DB_URL=mysql://avnadmin:TU_PASSWORD@mysql-19a2e940-germans-3052.e.aivencloud.com:19533/defaultdb?ssl-mode=REQUIRED
AIVEN_DB_SSL_CA_FILE=aiven-ca.pem
AIVEN_DB_SSL_REJECT_UNAUTHORIZED=true
```

Guarda el certificado CA local en:

```text
config/local/aiven-ca.pem
```

Valida conexion y datos:

```powershell
npm run aiven:check
```

Resultado esperado:

```text
Local: tablas=26; tablas_con_datos=21; registros=397
Aiven: tablas=26; tablas_con_datos=21; registros=397
```

Para copiar local hacia Aiven:

```powershell
npm run aiven:migrate
```

Este comando limpia las tablas de Aiven y las reemplaza por la copia local. Ejecutarlo solo cuando nadie este capturando datos.

## Netlify

Netlify publica `public/` y ejecuta el backend mediante `netlify/functions/api.mjs`. No se necesita backend externo ni `TORNOS_API_BASE_URL`.

Configuracion de build:

| Campo | Valor |
|---|---|
| Build command | `node scripts/write-netlify-config.mjs` |
| Publish directory | `public` |
| Functions directory | `netlify/functions` |

Variables requeridas en Netlify:

```properties
NODE_ENV=production
DB_URL=mysql://avnadmin:TU_PASSWORD@mysql-19a2e940-germans-3052.e.aivencloud.com:19533/defaultdb?ssl-mode=REQUIRED
DB_SSL=true
DB_SSL_CA_BASE64=BASE64_DEL_CA_PEM_DE_AIVEN
APP_BOOTSTRAP_ADMIN_USERNAME=admin
APP_SESSION_STORAGE=database
APP_UPLOAD_STORAGE=database
DB_POOL_SIZE=2
```

Si Aiven ya tiene el usuario `admin` importado, `APP_BOOTSTRAP_ADMIN_PASSWORD` no es necesario en Netlify. Agregalo solo para crear el admin inicial en una base vacia o para resetearlo junto con `APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=true`.

El acceso operativo actual de `admin` debe mantenerse en el archivo privado `config/local/credenciales-acceso.txt`, no en documentacion versionada.

No definas `TORNOS_API_BASE_URL` para este despliegue. Si quedo de intentos anteriores, el build actual no la incrusta salvo que tambien definas `NETLIFY_USE_EXTERNAL_API=true`.

Para generar `DB_SSL_CA_BASE64`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\config\local\aiven-ca.pem"))
```

Despues del deploy, prueba:

```text
https://TU-SITIO.netlify.app/api/health
```

Debe responder:

```json
{"status":"UP","database":"mysql"}
```

## Validacion Antes De Deploy

Ejecuta:

```powershell
npm run check
npm run aiven:check
npm run netlify:validate
npm audit --audit-level=moderate
```

Tambien se valido que la Function pueda empaquetarse con esbuild en formato CJS, que era el error original de Netlify.

## Seguridad

- `.env` y `config/local/` son privados.
- Usar SSL validado hacia Aiven.
- En Netlify, las sesiones y archivos se guardan en MySQL con `APP_SESSION_STORAGE=database` y `APP_UPLOAD_STORAGE=database`.
- Los tokens son opacos y los passwords se guardan con BCrypt.
- La contrasena de Aiven fue expuesta durante configuracion inicial; rotarla en Aiven antes de dejar el sitio productivo.

## Problemas Comunes

| Problema | Solucion |
|---|---|
| Build falla por `Top-level await` | Confirmar que `src/server.js` tenga arranque con `start().catch(...)`, no `await start()`. |
| Netlify detecta `TORNOS_API_BASE_URL` como secreto | Eliminar esa variable de Netlify o mantener `SECRETS_SCAN_OMIT_KEYS` en `netlify.toml`. |
| Login falla en Netlify | Revisar `DB_URL`, `DB_SSL`, `DB_SSL_CA_BASE64`, usuario existente y password usado para iniciar sesion. |
| API 404 en Netlify | Revisar redirects de `netlify.toml` y que exista `netlify/functions/api.mjs`. |
| Aiven sin datos | Ejecutar `npm run aiven:check`; si Aiven esta vacio, correr `npm run aiven:migrate`. |
| Password admin no coincide | Usar temporalmente `APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=true`. |

## Documentacion

| Archivo | Contenido |
|---|---|
| [docs/api-rest.md](docs/api-rest.md) | Endpoints REST. |
| [docs/modelo-datos-inicial.md](docs/modelo-datos-inicial.md) | Modelo de datos. |
| [docs/seguridad.md](docs/seguridad.md) | Seguridad operativa. |
| [docs/aiven-netlify.md](docs/aiven-netlify.md) | Conexion Aiven y despliegue Netlify. |
