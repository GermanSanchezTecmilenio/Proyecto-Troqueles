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

DB_URL=jdbc:mysql://localhost:3306/tornos_sa_cv?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=America/Mexico_City
DB_USER=root
DB_PASSWORD=1234

APP_BOOTSTRAP_ADMIN_USERNAME=admin
APP_BOOTSTRAP_ADMIN_PASSWORD=AdminLocal2026!
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
| `npm audit` | Revisa vulnerabilidades npm. |

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
  password = "AdminLocal2026!"
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

Netlify sirve correctamente el frontend estatico, pero no ejecuta este backend Node/Express ni levanta MySQL como servidor permanente.

Para Netlify se agrego:

| Archivo | Uso |
|---|---|
| `netlify.toml` | Indica que Netlify publique `public/` y redirija rutas al `index.html`. |
| `scripts/write-netlify-config.mjs` | Genera `public/config.js` con la URL del backend. |
| `public/config.js` | Archivo generado durante build; define `window.TORNOS_API_BASE_URL`. |

Configuracion recomendada en Netlify:

| Campo | Valor |
|---|---|
| Build command | `node scripts/write-netlify-config.mjs` |
| Publish directory | `public` |
| Environment variable | `TORNOS_API_BASE_URL=https://URL-DE-TU-BACKEND` |

El backend debe hospedarse aparte en un servicio que soporte Node.js persistente y MySQL, por ejemplo Render, Railway, Azure App Service, Azure Container Apps o un VPS. Si no defines `TORNOS_API_BASE_URL`, el frontend intentara llamar `/api/**` en el mismo dominio de Netlify y el login no funcionara.

Si el despliegue muestra el mensaje antiguo `ZSISTEMA_API_BASE_URL`, vuelve a desplegar Netlify con la rama actual. El build tambien acepta `ZSISTEMA_API_BASE_URL` como alias para compatibilidad.

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
- Los passwords se almacenan con BCrypt usando `bcryptjs`.
- Los tokens son opacos, se generan con `crypto.randomBytes` y viven en memoria del proceso Node.
- El tiempo de vida del token se controla con `APP_TOKEN_TTL_MINUTES`.
- Los roles se guardan en `user_roles`; por defecto el bootstrap crea `ADMIN` y `OPERADOR`.
- `.env` nunca debe publicarse ni compartirse.
- `APP_ALLOWED_ORIGINS` permite limitar CORS cuando el frontend vive en otro dominio.
- En produccion se recomienda usar HTTPS mediante proxy o balanceador.
- Para invalidar todas las sesiones activas, reinicia el proceso Node.

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

### En Netlify aparece Error 404 al iniciar sesion

Significa que el frontend esta publicado, pero no hay backend disponible en ese dominio. Netlify esta sirviendo `public/`, pero `/api/auth/login` no existe ahi.

Solucion:

1. Publica el backend Node/MySQL en otro servicio.
2. Copia la URL publica del backend.
3. En Netlify, configura la variable:

```text
TORNOS_API_BASE_URL=https://URL-DE-TU-BACKEND
```

4. Vuelve a desplegar en Netlify.

### En Netlify aparece "API no configurada"

Configura en Netlify:

```text
TORNOS_API_BASE_URL=https://URL-DE-TU-BACKEND
```

Despues ejecuta un redeploy. La URL debe apuntar al backend Node publicado, no a MySQL ni al sitio de Netlify.

## Documentacion Complementaria

- [APIs REST](docs/api-rest.md)
- [Modelo de datos](docs/modelo-datos-inicial.md)
- [Seguridad operativa](docs/seguridad.md)
