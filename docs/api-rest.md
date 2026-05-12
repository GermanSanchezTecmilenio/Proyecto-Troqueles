# APIs REST del MVP

Documento de referencia rapida para las rutas expuestas por el backend.

## Seguridad general

- Todas las rutas bajo `/api/**` requieren `Authorization: Bearer <token>`, excepto `POST /api/auth/login`.
- Las respuestas y peticiones operativas usan JSON, salvo descargas PDF/RTF.
- Las rutas reflejan el alcance actual del MVP; las reglas finales de autorizacion y calculo fiscal siguen sujetas a validacion.

## Salud

| Metodo | Ruta | Uso |
|---|---|---|
| `GET` | `/api/health` | Devuelve estado simple del servidor Node y MySQL. |
| `GET` | `/actuator/health` | Alias de compatibilidad para health checks existentes. |

## Seguridad

| Metodo | Ruta | Uso |
|---|---|---|
| `POST` | `/api/auth/login` | Inicia sesion y entrega token opaco. |
| `GET` | `/api/auth/me` | Devuelve el usuario autenticado. |
| `POST` | `/api/auth/logout` | Cierra la sesion actual. |

## Catalogos

| Metodo | Ruta | Uso |
|---|---|---|
| `GET` | `/api/clientes` | Lista clientes. |
| `POST` | `/api/clientes` | Crea cliente. |
| `PUT` | `/api/clientes/{id}` | Actualiza cliente. |
| `GET` | `/api/proveedores` | Lista proveedores. |
| `POST` | `/api/proveedores` | Crea proveedor. |
| `PUT` | `/api/proveedores/{id}` | Actualiza proveedor. |
| `GET` | `/api/operadores` | Lista operadores. |
| `POST` | `/api/operadores` | Crea operador. |
| `PUT` | `/api/operadores/{id}` | Actualiza operador. |
| `GET` | `/api/estatus-produccion` | Lista estatus de produccion. |

## Produccion

| Metodo | Ruta | Uso |
|---|---|---|
| `GET` | `/api/piezas` | Lista piezas. |
| `POST` | `/api/piezas` | Registra pieza. |
| `POST` | `/api/piezas/dibujos` | Sube o registra dibujo asociado a pieza. |
| `PUT` | `/api/piezas/{id}` | Actualiza pieza. |
| `PUT` | `/api/piezas/{id}/estatus` | Cambia estatus de pieza. |
| `GET` | `/api/piezas/{id}/notas` | Lista notas de pieza. |
| `POST` | `/api/piezas/{id}/notas` | Agrega nota a pieza. |
| `GET` | `/api/ordenes-trabajo` | Lista ordenes de trabajo. |
| `POST` | `/api/ordenes-trabajo` | Crea orden de trabajo. |
| `GET` | `/api/monitor-produccion` | Consulta monitor operativo. |
| `GET` | `/api/tiempos` | Lista tiempos capturados. |
| `POST` | `/api/tiempos` | Captura inicio/fin de operacion. |
| `GET` | `/api/dashboard` | Devuelve indicadores del dashboard. |

## Compras

| Metodo | Ruta | Uso |
|---|---|---|
| `GET` | `/api/requisiciones` | Lista requisiciones. |
| `POST` | `/api/requisiciones` | Crea requisicion. |
| `GET` | `/api/requisiciones/material-opciones` | Lista opciones de material y descripcion para requisiciones. |
| `GET` | `/api/requisiciones/{folio}/pdf` | Descarga requisicion en PDF. |
| `GET` | `/api/ordenes-compra` | Lista ordenes de compra. |
| `POST` | `/api/ordenes-compra` | Crea orden de compra. |
| `GET` | `/api/ordenes-compra/{id}/pdf` | Descarga orden de compra en PDF. |
| `GET` | `/api/ordenes-compra/{id}/word` | Descarga orden de compra como RTF editable compatible con Word. |

## Almacen

| Metodo | Ruta | Uso |
|---|---|---|
| `GET` | `/api/almacen/articulos` | Lista articulos de almacen. |
| `POST` | `/api/almacen/articulos` | Crea articulo. |
| `GET` | `/api/almacen/kardex` | Consulta movimientos de kardex. |
| `POST` | `/api/almacen/entradas` | Registra entrada de almacen. |
| `POST` | `/api/almacen/salidas` | Registra salida de almacen. |

## Remisiones

| Metodo | Ruta | Uso |
|---|---|---|
| `GET` | `/api/remisiones` | Lista remisiones. |
| `POST` | `/api/remisiones` | Crea remision. |
| `GET` | `/api/remisiones/{id}/pdf` | Descarga remision en PDF. |
