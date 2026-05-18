# Seguridad operativa

Guia para operar el sistema sin exponer credenciales, sesiones o datos sensibles.

## Configuracion base

Usar `.env.example` como plantilla y mantener `.env` fuera de Git.

| Variable | Regla |
|---|---|
| `APP_BOOTSTRAP_ADMIN_PASSWORD` | Debe ser larga, unica y contener mayuscula, minuscula, numero y simbolo. |
| `DB_PASSWORD` | No debe repetirse entre ambientes. |
| `MYSQL_ROOT_PASSWORD` | Debe ser diferente a `DB_PASSWORD` y no compartirse con usuarios de aplicacion. |
| `APP_ALLOWED_ORIGINS` | Dejar vacio en mismo dominio o limitar a dominios de confianza. |
| `APP_LOGIN_RATE_LIMIT_MAX` | Limitar intentos por IP/usuario dentro de la ventana configurada. |
| `DB_SSL` / `DB_SSL_REJECT_UNAUTHORIZED` | En produccion usar TLS y validar certificado. |
| `DEBUG` | Mantener en `false` para evitar logs verbosos con informacion sensible. |

## Autenticacion y sesiones

- Todos los endpoints `/api/**` requieren token Bearer, excepto `/api/auth/login`.
- Las rutas operativas validan permisos por modulo y accion en el backend.
- Las passwords se guardan con BCrypt, nunca en texto plano ni con cifrado reversible.
- El token entregado al frontend es opaco y se conserva en memoria del proceso Node hasta que expira.
- El frontend conserva el token en `sessionStorage` y lo borra al cerrar sesion.
- Los cambios de roles/permisos invalidan o refrescan sesiones afectadas.
- Para invalidar todas las sesiones activas, reinicia el proceso Node.

## Dependencias

- El proyecto usa dependencias npm declaradas en `package.json`.
- Ejecutar `npm.cmd audit` periodicamente y revisar actualizaciones de `express`, `mysql2`, `bcryptjs` y `multer`.
- Bloquear versiones con `package-lock.json` despues de instalar dependencias.

Ejecutar despues de cada cambio sensible:

```powershell
npm.cmd run check
npm.cmd audit
npm.cmd run review:ai
```

`npm.cmd run review:ai` es una herramienta externa de revision tecnica del repositorio; no expone una ruta `/api` ni una vista en el frontend. No incluir `.env` ni secretos en archivos versionados antes de ejecutarla.

## Checklist de produccion

- Cambiar credenciales iniciales antes de publicar.
- No publicar `.env`, logs, `uploads/` ni `node_modules/`.
- Usar solo MySQL; no existe modo demo con base en memoria.
- Confirmar TLS/proxy HTTPS en el servidor o balanceador final.
- Confirmar TLS validado hacia MySQL.
- Limitar CORS con `APP_ALLOWED_ORIGINS` si el frontend vive en otro dominio.
- Revisar usuarios administradores despues del primer arranque.
