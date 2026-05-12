# Modelo de datos inicial

El modelo usa nombres modernos, tipado actual y relaciones explicitas. El backend actual es Node.js/Express y aplica migraciones SQL versionadas en MySQL desde `db/migrations`. El SQL legacy se conserva solo como referencia funcional para validar equivalencias.

## Alcance del MVP

- Catalogos: clientes, proveedores, operadores y estatus de produccion.
- Produccion: piezas, ordenes de trabajo, notas, monitor y tiempos.
- Compras: requisiciones, ordenes de compra y partidas.
- Almacen: articulos y kardex.
- Embarque: remisiones y entregas.
- Seguridad: usuarios, roles y auditoria basica.

## Tablas principales

| Modulo | Tabla | Origen legacy relacionado | Uso |
|---|---|---|---|
| Catalogos | `clientes` | `catclientes` | Catalogo de clientes. |
| Catalogos | `proveedores` | `catproveedores` | Catalogo de proveedores para ordenes de compra. |
| Catalogos | `operadores` | `catoperadores` | Operadores, supervisores y choferes. |
| Produccion | `estatus_produccion` | `catestatus` | Estados de piezas y monitor. |
| Produccion | `piezas` | `tblproduccion` | Registro principal de piezas. |
| Produccion | `ordenes_trabajo` | `tblordentrabajo` | Agrupacion de piezas por cliente/OC. |
| Produccion | `tiempos_produccion` | `tblprodtiempospieza` | Captura de inicio/fin de operacion. |
| Produccion | `pieza_notas` | `tblnotaspieza` | Notas y seguimiento de estatus de piezas. |
| Compras | `requisiciones` | `tblrequisiciones` | Solicitudes de material. |
| Compras | `requisicion_detalles` | `detrequisiciones` | Detalle de material solicitado, incluyendo `pieza_id` cuando aplica. |
| Compras | `ordenes_compra` | `tblordenescompra` | Orden de compra generada desde requisiciones. |
| Compras | `orden_compra_detalles` | `detordenescompra` | Partidas compradas por proveedor. |
| Almacen | `almacen_articulos` | `zalmcatarticulos` | Catalogo basico de inventario. |
| Almacen | `kardex_movimientos` | `zalmtblkardex` | Entradas y salidas de almacen. |
| Embarque | `remisiones` | `tblembarque`, `tblentregasparciales` | Remision de prueba y entrega. |
| Seguridad | `users`, `user_roles` | `catusuariossistema`, `tblaccesossistema` | Seguridad moderna. |
| Auditoria | `audit_events` | `tblaccionesusuario` | Auditoria basica. |

## Criterios contra legacy

- `latin1` se reemplaza por `utf8mb4`.
- Fechas cero se reemplazan por `NULL` o valores obligatorios validos.
- Importes usan `DECIMAL`, no `DOUBLE`.
- Los documentos binarios salen del MVP; se representan como rutas o como servicio documental pendiente.
- Las relaciones criticas usan llaves foraneas explicitas.
- Los nombres de tablas y columnas priorizan lectura funcional sobre nombres heredados.
- No existe base demo en memoria; todos los datos operativos viven en MySQL.

## Reglas iniciales

- `cantidad_entregada` se deriva de remisiones confirmadas; no se almacena como dato editable para evitar diferencias entre produccion, embarque y facturacion.
- Las cancelaciones de OT, piezas, facturas y remisiones son logicas: conservan folio, trazabilidad, usuario, fecha y motivo de cancelacion.
- La facturacion conserva los campos fiscales minimos: RFC, razon social, regimen fiscal, codigo postal fiscal, uso CFDI, metodo de pago, forma de pago, UUID, serie, folio, subtotal, IVA, retenciones y total.
- `piezas.id = 2460` queda reservado como pieza interna GODMISA para compras que no pertenecen a cliente; debe permanecer visible en monitor y no darse de baja por remision.
- Las ordenes de compra calculan IVA 16%, retencion de IVA sobre el IVA y retencion ISR sobre subtotal; los porcentajes pueden definirse por proveedor y ajustarse en la OC.

## Validaciones relacionadas

Las decisiones marcadas como pendientes se concentran en `pendientes-validacion.md` para no mezclar reglas iniciales con confirmaciones de negocio.
