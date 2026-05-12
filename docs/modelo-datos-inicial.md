# Modelo de datos

El backend aplica migraciones SQL versionadas en MySQL desde `db/migrations`. Las tablas usan nombres funcionales, tipos explicitos y llaves foraneas para mantener trazabilidad entre produccion, compras, almacen, remisiones y facturacion.

La carpeta `db/` debe permanecer en la raiz del proyecto porque el servidor lee ahi las migraciones al iniciar. No almacena los datos de MySQL.

## Alcance funcional

- Catalogos: clientes, proveedores, operadores y estatus de produccion.
- Produccion: piezas, ordenes de trabajo, notas, estimaciones, monitor y tiempos.
- Compras: requisiciones, ordenes de compra y partidas.
- Almacen: articulos y kardex.
- Embarque: remisiones y entregas parciales.
- Facturacion: facturas administrativas ligadas a clientes y remisiones.
- Seguridad: usuarios, roles y auditoria basica.

## Tablas principales

| Modulo | Tabla | Uso |
|---|---|---|
| Catalogos | `clientes` | Clientes, datos fiscales y formato de factura. |
| Catalogos | `proveedores` | Proveedores, datos bancarios, condiciones y retenciones. |
| Catalogos | `operadores` | Operadores, supervisores y choferes. |
| Produccion | `estatus_produccion` | Estados visibles en piezas y monitor. |
| Produccion | `piezas` | Registro principal de piezas. |
| Produccion | `ordenes_trabajo` | Agrupacion de piezas por cliente y orden de compra. |
| Produccion | `pieza_notas` | Notas y seguimiento de estatus. |
| Produccion | `pieza_estimaciones` | Estimaciones por pieza para monitor y reportes. |
| Produccion | `tiempos_produccion` | Captura de inicio y fin de operacion. |
| Compras | `requisiciones` | Solicitudes de material. |
| Compras | `requisicion_detalles` | Partidas solicitadas. |
| Compras | `ordenes_compra` | Ordenes de compra generadas desde requisiciones. |
| Compras | `orden_compra_detalles` | Partidas compradas por proveedor. |
| Almacen | `almacen_articulos` | Catalogo de inventario. |
| Almacen | `kardex_movimientos` | Entradas y salidas de almacen. |
| Embarque | `remisiones` | Entregas de piezas a cliente. |
| Facturacion | `facturas` | Control administrativo de facturas. |
| Seguridad | `users`, `user_roles` | Usuarios y roles. |
| Auditoria | `audit_events` | Registro de acciones del sistema. |

## Criterios de datos

- Las tablas usan `utf8mb4`.
- Las fechas opcionales usan `NULL`; las fechas operativas obligatorias se guardan con valor valido.
- Importes, precios, impuestos y retenciones usan `DECIMAL`.
- Los archivos subidos se almacenan como rutas relativas bajo `uploads/`.
- Las relaciones criticas usan llaves foraneas explicitas.
- No existe base demo en memoria; todos los datos operativos viven en MySQL.

## Reglas funcionales

- `cantidad_entregada` se actualiza al crear remisiones.
- Las cancelaciones operativas son logicas cuando el modulo las soporta; conservan folio y trazabilidad.
- La facturacion administrativa conserva serie, folio, cliente, remision, subtotal, IVA, total, UUID, estatus y observaciones.
- `piezas.id = 2460` queda reservado como pieza interna Tornos SA de CV para compras que no pertenecen a cliente; debe permanecer visible en monitor y no darse de baja por remision.
- Las ordenes de compra calculan IVA 16%, retencion de IVA sobre el IVA y retencion ISR sobre subtotal; los porcentajes pueden definirse por proveedor y ajustarse en la OC.
