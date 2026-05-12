# zSistema Modern Prototype

Sistema web/API para modernizar los flujos operativos de **Tornos SA de CV / zSistema**: catalogos, produccion, compras, almacen, remisiones, reportes, seguridad y auditoria.

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
|-- server.js          API REST, autenticacion, migraciones y servidor web
|-- public/            Frontend estatico
|   |-- index.html
|   |-- styles.css
|   `-- js/
|-- db/
|   `-- migrations/    Migraciones MySQL V1..V9
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

DB_URL=jdbc:mysql://localhost:3306/Godmisa?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=America/Mexico_City
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
| `npm run check` | Revisa sintaxis de `server.js`. |
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
Invoke-RestMethod "http://localhost:8080/api/almacen/articulos" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/almacen/kardex" -Headers $headers
Invoke-RestMethod "http://localhost:8080/api/remisiones" -Headers $headers
```

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
| Produccion | `PUT` | `/api/piezas/{id}/estatus` | Cambiar estatus y agregar nota. |
| Produccion | `GET/POST` | `/api/ordenes-trabajo` | Listar/crear OT. |
| Produccion | `GET` | `/api/monitor-produccion` | Monitor operativo. |
| Produccion | `GET/POST` | `/api/tiempos` | Consultar/capturar tiempos. |
| Compras | `GET/POST` | `/api/requisiciones` | Listar/crear requisiciones. |
| Compras | `GET/POST` | `/api/ordenes-compra` | Listar/crear ordenes de compra. |
| Almacen | `GET/POST` | `/api/almacen/articulos` | Articulos de almacen. |
| Almacen | `POST` | `/api/almacen/entradas` | Entrada de inventario. |
| Almacen | `POST` | `/api/almacen/salidas` | Salida de inventario. |
| Remisiones | `GET/POST` | `/api/remisiones` | Listar/crear remisiones. |

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

Al iniciar, `server.js`:

1. Lee `.env`.
2. Conecta a MySQL.
3. Crea la base `Godmisa` si el usuario tiene permisos.
4. Crea `schema_migrations` si no existe.
5. Ejecuta migraciones pendientes desde `db/migrations`.
6. Crea o actualiza el usuario administrador inicial.

No modificar migraciones ya aplicadas. Para cambios nuevos, agregar un archivo con el siguiente numero:

```text
db/migrations/V10__descripcion_del_cambio.sql
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

## Documentacion Complementaria

- [APIs REST](docs/api-rest.md)
- [Modelo de datos inicial](docs/modelo-datos-inicial.md)
- [Seguridad operativa](docs/seguridad.md)
- [Pendientes de validacion](docs/pendientes-validacion.md)
#   P r o y e c t o - T r o q u e l e s  
 