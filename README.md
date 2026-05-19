# Tornos SA de CV

Sistema web/API para los flujos operativos de **Tornos SA de CV**: catalogos, produccion, compras, almacen, remisiones, reportes, seguridad y auditoria.

La version actual esta migrada a **Node.js + Express + MySQL**. No existe modo demo ni base en memoria; todos los datos operativos viven en MySQL.

## Accesos Rapidos

| Recurso | Liga |
|---|---|
| Aplicacion web | http://localhost:8080 |
| Health API | http://localhost:8080/api/health |
| Health compatible | http://localhost:8080/actuator/health |
| Documentacion API | [docs/api-rest.md](docs/api-rest.md) |
| Modelo de datos | [docs/modelo-datos-inicial.md](docs/modelo-datos-inicial.md) |
| Seguridad operativa | [docs/seguridad.md](docs/seguridad.md) |

## Stack Tecnico

| Capa | Tecnologia |
|---|---|
| Backend | Node.js, Express |
| Base de datos | MySQL 8.x |
| Driver DB | `mysql2` |
| Seguridad | Bearer token opaco, `bcryptjs`, roles en MySQL |
| Uploads | `multer` |
| Frontend | HTML, CSS y JavaScript sin framework |
| Configuracion | `.env` con `dotenv` |
| Migraciones | SQL versionado en `db/migrations` |

## Estructura del Proyecto

```text
.
|-- src/
|   `-- server.js      API REST, autenticacion, migraciones y servidor web
|-- public/            Frontend estatico
|   |-- index.html
|   |-- styles.css
|   `-- js/
|-- db/
|   `-- migrations/    Migraciones SQL versionadas; debe permanecer en raiz
|-- docs/              Documentacion tecnica y funcional en Markdown
|-- package.json       Scripts y dependencias Node
|-- package-lock.json  Versiones bloqueadas de dependencias
|-- docker-compose.yml MySQL opcional por Docker
|-- .env.example       Plantilla de configuracion
`-- .env               Configuracion local privada
```

## Instalacion

1. Instalar dependencias:

```powershell
npm install
```

2. Copiar `.env.example` como `.env` y configurar MySQL:

```properties
SERVER_PORT=8080
NODE_ENV=development

DB_URL=jdbc:mysql://localhost:3306/tornos_sa_cv?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=America/Mexico_City
DB_USER=tornos_app
DB_PASSWORD=CAMBIAR_password_largo_base_datos

APP_BOOTSTRAP_ADMIN_USERNAME=admin
APP_BOOTSTRAP_ADMIN_PASSWORD=CAMBIAR_Admin_2026!
APP_BOOTSTRAP_ADMIN_DISPLAY_NAME=Administrador
APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=false
```

3. Confirmar que MySQL este activo en `localhost:3306`.

4. Ejecutar:

```powershell
npm start
```

5. Abrir:

```text
http://localhost:8080
```

## Credenciales Locales

Las credenciales iniciales salen de `.env`:

```text
Usuario: admin
Password: valor de APP_BOOTSTRAP_ADMIN_PASSWORD
```

Si el usuario `admin` ya existe y necesitas sincronizar el password con `.env`, cambia temporalmente:

```properties
APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=true
```

Arranca una vez la aplicacion y despues regresa el valor a `false`.

## Scripts

| Comando | Uso |
|---|---|
| `npm start` | Arranca el sistema en `SERVER_PORT`. |
| `npm run dev` | Arranca con `node --watch`. |
| `npm run check` | Revisa sintaxis de `src/server.js`. |
| `npm run review:ai` | Genera una revision IA tecnica del repo, sin integrarse al frontend. |
| `npm audit` | Revisa vulnerabilidades npm. |

## Revision IA Tecnica

La herramienta IA vive fuera de la aplicacion web. Su objetivo es revisar codigo, seguridad de codigo, infraestructura y arquitectura del repositorio. No lee `.env`, `node_modules`, `logs` ni `uploads`, pero si envia contexto tecnico del repo al proveedor configurado por `OPENAI_API_KEY`.

Configura en `.env`:

```properties
OPENAI_API_KEY=tu_api_key
AI_REVIEW_OUTPUT=docs/ai-review-report.md
AI_REVIEW_MAX_CONTEXT_CHARS=120000
```

Ejecuta:

```powershell
npm run review:ai
```

Tambien puedes enfocar la revision:

```powershell
npm run review:ai -- --focus="seguridad y arquitectura"
```

## Prueba Rapida de APIs

### APIs publicas

Estas ligas abren directo en el navegador:

| API | Liga |
|---|---|
| Health principal | http://localhost:8080/api/health |
| Health compatible | http://localhost:8080/actuator/health |
| Frontend | http://localhost:8080 |

### Login y token

La mayoria de rutas `/api/**` requiere token Bearer. Para probar desde PowerShell:

```powershell
$loginBody = @{
  username = "admin"
  password = "VALOR_DE_APP_BOOTSTRAP_ADMIN_PASSWORD"
} | ConvertTo-Json

$login = Invoke-RestMethod `
  -Uri "http://localhost:8080/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $loginBody

$headers = @{ Authorization = "Bearer $($login.token)" }
```

### APIs protegidas para probar

Ejecuta estas llamadas despues de crear `$headers`:

```powershell
Invoke-RestMethod "http://localhost:8080/api/auth/me" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/clientes" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/proveedores" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/operadores" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/estatus-produccion" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/piezas" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/monitor-produccion" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/requisiciones" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/requisiciones/material-opciones" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/ordenes-compra" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/ordenes-trabajo" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/estimaciones" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/almacen/articulos" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/almacen/kardex" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/remisiones" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/facturas" -Headers $headers
```

## Publicacion en Netlify

Netlify publica el frontend estatico y redirige `/api/**` a una Netlify Function que ejecuta el backend Express. La base de datos debe ser remota; para Aiven for MySQL usa la URI del servicio con SSL.

Para Netlify se agrego:

| Archivo | Uso |
|---|---|
| `netlify.toml` | Publica `public/`, registra `netlify/functions` y redirige `/api/**` a la funcion. |
| `netlify/functions/api.mjs` | Adaptador serverless para Express. |
| `scripts/write-netlify-config.mjs` | Genera `public/config.js` con la URL del backend. |
| `public/config.js` | Archivo generado durante build; define `window.TORNOS_API_BASE_URL`. |
| `db/migrations/V18__netlify_aiven_runtime_storage.sql` | Agrega sesiones persistentes y almacenamiento de dibujos en MySQL para Netlify. |

Configuracion recomendada en Netlify:

| Campo | Valor |
|---|---|
| Build command | `node scripts/write-netlify-config.mjs` |
| Publish directory | `public` |
| Functions directory | `netlify/functions` |

Variables minimas para Netlify + Aiven:

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

`APP_ALLOWED_ORIGINS` puede quedar vacio en Netlify si usas el mismo dominio, porque la funcion toma `URL` y `DEPLOY_PRIME_URL` del ambiente. Si usas dominio personalizado o backend externo, define el origen exacto, por ejemplo `https://tusitio.com`.

`TORNOS_API_BASE_URL` ya no es obligatorio cuando el backend corre como Netlify Function en el mismo sitio. Solo usalo si decides hospedar el backend en otro servicio y quieres que Netlify sea un frontend estatico apuntando a esa URL.

El primer acceso a la funcion aplica migraciones pendientes en Aiven. Esto crea tablas faltantes, pero no copia automaticamente datos desde tu MySQL local; para conservar informacion local debes exportarla e importarla en Aiven con una herramienta MySQL antes o despues del despliegue.

## Endpoints Principales

| Modulo | Metodo | Ruta | Uso |
|---|---|---|---|
| Salud | `GET` | `/api/health` | Estado de Node/MySQL. |
| Seguridad | `POST` | `/api/auth/login` | Iniciar sesion. |
| Seguridad | `GET` | `/api/auth/me` | Usuario autenticado. |
| Seguridad | `POST` | `/api/auth/logout` | Cerrar sesion. |
| Catalogos | `GET/POST` | `/api/clientes` | Listar/crear clientes. |
| Catalogos | `GET/POST` | `/api/proveedores` | Listar/crear proveedores. |
| Catalogos | `GET/POST` | `/api/operadores` | Listar/crear operadores. |
| Produccion | `GET/POST` | `/api/piezas` | Listar/crear piezas. |
| Produccion | `POST` | `/api/piezas/dibujos` | Subir dibujo/archivo. |
| Produccion | `GET` | `/api/piezas/{id}/pdf` | Ficha PDF de pieza con notas y estimaciones. |
| Produccion | `PUT` | `/api/piezas/{id}/estatus` | Cambiar estatus y agregar nota. |
| Produccion | `GET/POST` | `/api/piezas/{id}/estimaciones` | Consultar/capturar estimaciones del monitor. |
| Produccion | `GET` | `/api/estimaciones` | Consolidado de estimaciones para reportes. |
| Produccion | `GET/POST` | `/api/ordenes-trabajo` | Listar/crear OT. |
| Produccion | `GET` | `/api/ordenes-trabajo/{id}/pdf` | Documento PDF de OT. |
| Produccion | `GET` | `/api/monitor-produccion` | Monitor operativo. |
| Produccion | `GET/POST` | `/api/tiempos` | Consultar/capturar tiempos. |
| Compras | `GET/POST` | `/api/requisiciones` | Listar/crear requisiciones. |
| Compras | `GET/POST` | `/api/ordenes-compra` | Listar/crear ordenes de compra. |
| Almacen | `GET/POST` | `/api/almacen/articulos` | Articulos de almacen. |
| Almacen | `POST` | `/api/almacen/entradas` | Entrada de inventario. |
| Almacen | `POST` | `/api/almacen/salidas` | Salida de inventario. |
| Remisiones | `GET/POST` | `/api/remisiones` | Listar/crear remisiones. |
| Remisiones | `GET` | `/api/remisiones/{id}/pdf` | Documento PDF de remision. |
| Facturacion | `GET/POST` | `/api/facturas` | Control administrativo de facturas. |
| Facturacion | `GET` | `/api/facturas/{id}/pdf` | Documento PDF de factura administrativa. |

## Seguridad Integrada

- Las rutas bajo `/api/**` requieren `Authorization: Bearer <token>`, excepto `POST /api/auth/login`.
- El backend valida permisos por modulo y accion antes de ejecutar rutas operativas.
- Los passwords se almacenan con BCrypt usando `bcryptjs`.
- Los tokens son opacos, se generan con `crypto.randomBytes`; en servidor local viven en memoria y en Netlify pueden persistirse en MySQL con `APP_SESSION_STORAGE=database`.
- El tiempo de vida del token se controla con `APP_TOKEN_TTL_MINUTES`.
- El login aplica bloqueo por intentos fallidos y rate limiting por IP/usuario.
- En produccion (`NODE_ENV=production`) la conexion a MySQL debe usar TLS validado y `APP_ALLOWED_ORIGINS` debe estar configurado.
- Los roles se guardan en `user_roles`; por defecto el bootstrap crea `ADMIN` y `OPERADOR`.
- `.env` nunca debe publicarse ni compartirse.
- `APP_ALLOWED_ORIGINS` permite limitar CORS cuando el frontend vive en otro dominio.
- En produccion se recomienda usar HTTPS mediante proxy o balanceador.
- Para invalidar todas las sesiones activas en local, reinicia el proceso Node; en Netlify elimina registros de `user_sessions` o rota el password de usuarios.

## Base de Datos y Migraciones

Al iniciar, `src/server.js`:

1. Lee `.env`.
2. Conecta a MySQL.
3. Crea la base `tornos_sa_cv` si el usuario tiene permisos.
4. Crea `schema_migrations` si no existe.
5. Ejecuta migraciones pendientes desde `db/migrations`.
6. Crea o actualiza el usuario administrador inicial.

La carpeta `db/` si debe estar en el proyecto porque contiene migraciones SQL. No contiene datos productivos ni archivos fisicos de MySQL; la base real vive en el servidor MySQL configurado en `.env`.

No modificar migraciones ya aplicadas. Para cambios nuevos, agregar un archivo con el siguiente numero:

```text
db/migrations/V12__descripcion_del_cambio.sql
```

## Solucion de Problemas

### Puerto 8080 ocupado

```powershell
Get-NetTCPConnection -LocalPort 8080
Stop-Process -Id <PID>
```

### Login incorrecto aunque el password sea correcto

Activa una vez:

```properties
APP_BOOTSTRAP_ADMIN_RESET_PASSWORD=true
```

Arranca `npm start`, confirma login y vuelve a dejarlo en `false`.

### MySQL no conecta

Verifica servicio y credenciales:

```powershell
Get-Service | Where-Object { $_.Name -match "mysql" }
```

Tambien confirma que `.env` tenga `DB_USER`, `DB_PASSWORD` y `DB_URL` correctos.

### En Netlify no inicia sesion

Revisa el log de Functions en Netlify. Las causas comunes son:

- `DB_URL`, `DB_SSL` o `DB_SSL_CA_BASE64` no apuntan a Aiven correctamente.
- `APP_BOOTSTRAP_ADMIN_PASSWORD` no esta definido.
- Aiven todavia no tiene los datos importados desde MySQL local.
- El primer arranque fallo aplicando migraciones por permisos o por una tabla ya modificada manualmente.

## Documentacion Complementaria

- [APIs REST](docs/api-rest.md)
- [Modelo de datos](docs/modelo-datos-inicial.md)
- [Seguridad operativa](docs/seguridad.md)
- [Netlify + Aiven for MySQL](docs/aiven-netlify.md)
