# Documentacion del proyecto

Esta carpeta concentra la documentacion funcional, tecnica y de apoyo del MVP de modernizacion de zSistema.

La version vigente del proyecto usa Node.js/Express para backend, frontend estatico en `public/`, migraciones SQL en `db/migrations/` y MySQL como unica base de datos.

## Orden sugerido de lectura

1. `../README.md`: arranque del proyecto, stack, ejecucion local y alcance general.
2. `modelo-datos-inicial.md`: tablas principales, equivalencias contra legacy y reglas iniciales.
3. `api-rest.md`: rutas REST disponibles por modulo.
4. `seguridad.md`: variables, autenticacion, sesiones y checklist de produccion.
5. `pendientes-validacion.md`: decisiones que todavia requieren confirmacion de usuarios.

## Archivos principales

| Archivo | Contenido | Uso recomendado |
|---|---|---|
| `api-rest.md` | Endpoints reales del backend agrupados por modulo. | Integracion frontend/API y pruebas manuales. |
| `modelo-datos-inicial.md` | Modelo de datos del MVP y relacion con tablas legacy. | Migracion, diseno de BD y conversaciones tecnicas. |
| `seguridad.md` | Reglas operativas de seguridad y variables sensibles. | Configuracion local, QA y preparacion a produccion. |
| `pendientes-validacion.md` | Temas abiertos con prioridad e impacto. | Sesiones con usuarios y cierre de alcance. |

## Criterio de limpieza

Esta carpeta conserva documentacion fuente en Markdown. Los videos, presentaciones, manuales generados y caches de herramientas se mantienen fuera del arbol funcional del proyecto para que la estructura sea ligera y entendible.
