# Pendientes de validacion con usuarios

Estos puntos deben confirmarse antes de cerrar reglas productivas. La prioridad indica el riesgo de construir funcionalidad incompleta o incorrecta.

## Prioridad alta

| Tema | Pregunta a validar | Impacto |
|---|---|---|
| Autorizaciones | Cual es el flujo exacto para requisiciones, ordenes de compra y embarques. | Define roles, estados, bloqueos y auditoria. |
| Facturacion | El sistema legacy emite CFDI real o solo documentos administrativos. | Afecta campos fiscales, integracion y cumplimiento. |
| Formatos oficiales | Cuales son los formatos finales de remision, factura y orden de compra. | Afecta PDF, Word y datos obligatorios. |
| Cancelaciones | Confirmar si la cancelacion logica aplica a piezas, OT, facturas, remisiones y requisiciones. | Evita perdida de trazabilidad y errores de folio. |

## Prioridad media

| Tema | Pregunta a validar | Impacto |
|---|---|---|
| Entregas parciales | Confirmar si `cantidad_entregada` se calcula solo desde remisiones confirmadas. | Afecta monitor, remisiones y avance de piezas. |
| Moneda | Confirmar uso de USD, tipo de cambio, partidas genericas y descripcion en ingles. | Afecta compras, reportes y documentos. |
| Numeros de serie | Definir si son obligatorios para todos los articulos o solo herramientas. | Afecta almacen y trazabilidad. |
| Roles | Confirmar permisos reales para administracion, compras, almacen, produccion, supervisor, operador y direccion. | Afecta menus, endpoints y aprobaciones. |
| Sesiones Node | Definir si las sesiones en memoria son suficientes o si deben persistirse en MySQL/Redis para produccion. | Afecta reinicios, balanceo y cierre centralizado de sesiones. |

## Prioridad baja

| Tema | Pregunta a validar | Impacto |
|---|---|---|
| Reportes | Separar reportes vigentes de reportes historicos u obsoletos. | Afecta alcance del dashboard y consultas. |
| Modo movil | Definir si el uso movil sera captura operativa o solo consulta/aprobaciones. | Afecta interfaz, validaciones y pruebas. |

## Notas de cierre

- Cuando un punto quede validado, mover la regla definitiva al documento correspondiente.
- Mantener aqui solo dudas abiertas o decisiones que requieran usuario final.
