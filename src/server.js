import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import mysql from "mysql2/promise";
import { ACCESS_ACTION_KEYS, ACCESS_CATALOG } from "./access-catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const publicDir = path.join(projectRoot, "public");
const migrationsDir = path.join(projectRoot, "db", "migrations");
const uploadsDir = path.join(projectRoot, "uploads", "dibujos");
const TORNOS_INTERNAL_PIEZA_ID = 2460;
const DEFAULT_DB_NAME = "tornos_sa_cv";
const IVA_RATE = 0.16;
const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const UPLOAD_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".dxf", ".dwg"]);
const UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/vnd.dwg",
  "image/x-dwg",
  "application/acad",
  "application/x-acad",
  "application/dxf",
  "application/x-dxf",
  "application/octet-stream"
]);
let pool;
const sessions = new Map();

const config = {
  port: Number(process.env.SERVER_PORT || 8080),
  adminUsername: process.env.APP_BOOTSTRAP_ADMIN_USERNAME || "admin",
  adminPassword: process.env.APP_BOOTSTRAP_ADMIN_PASSWORD,
  adminDisplayName: process.env.APP_BOOTSTRAP_ADMIN_DISPLAY_NAME || "Administrador",
  adminResetPassword: String(process.env.APP_BOOTSTRAP_ADMIN_RESET_PASSWORD || "false").toLowerCase() === "true",
  tokenTtlMinutes: Number(process.env.APP_TOKEN_TTL_MINUTES || 120),
  bcryptStrength: Number(process.env.APP_BCRYPT_STRENGTH || 12),
  loginMaxFailedAttempts: Number(process.env.APP_LOGIN_MAX_FAILED_ATTEMPTS || 5),
  loginRateLimitWindowMs: Number(process.env.APP_LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  loginRateLimitMax: Number(process.env.APP_LOGIN_RATE_LIMIT_MAX || 10),
  allowedOrigins: (process.env.APP_ALLOWED_ORIGINS || "").split(",").map(item => item.trim()).filter(Boolean),
  db: parseDbConfig()
};

const loginAttempts = new Map();

const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await fs.mkdir(uploadsDir, { recursive: true });
        cb(null, uploadsDir);
      } catch (error) {
        cb(error);
      }
    },
    filename: (req, file, cb) => {
      const extension = safeUploadExtension(file.originalname);
      const baseName = path.basename(file.originalname || "dibujo", path.extname(file.originalname || ""))
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(0, 80);
      const safeName = `${baseName || "dibujo"}${extension}`;
      cb(null, `${crypto.randomUUID()}_${safeName || "dibujo"}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const extension = safeUploadExtension(file.originalname);
    const mimeType = String(file.mimetype || "").toLowerCase();
    if (!extension || !UPLOAD_MIME_TYPES.has(mimeType)) {
      return cb(httpError(400, "Tipo de archivo no permitido. Usa PDF, imagen o dibujo CAD."));
    }
    cb(null, true);
  },
  limits: {
    fileSize: parseSize(process.env.APP_UPLOAD_MAX_FILE_SIZE || "25MB")
  }
});

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(corsHeaders);
app.use("/uploads", authRequired, requireAnyAccess(
  { moduleId: "piezas", actionKey: "canView" },
  { moduleId: "monitor", actionKey: "canView" },
  { moduleId: "reportes", actionKey: "canView" }
), express.static(path.join(projectRoot, "uploads"), {
  setHeaders: (res, filePath) => {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath).replace(/"/g, "")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
}));
app.use(express.static(publicDir));

app.get("/api/health", (req, res) => res.json({ status: "UP", database: "mysql" }));
app.get("/actuator/health", (req, res) => res.json({ status: "UP" }));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  assertLoginAllowed(req, username);
  const user = await one(
    `SELECT u.id, u.username, u.password_hash AS passwordHash, u.display_name AS displayName,
            u.active, u.locked, u.failed_attempts AS failedAttempts
       FROM users u
      WHERE LOWER(u.username) = LOWER(?)`,
    [username]
  );
  if (!user || !user.active) {
    recordFailedLogin(req, username);
    throw httpError(401, "Usuario o password incorrectos");
  }
  if (user.locked) {
    throw httpError(423, "Cuenta bloqueada. Solicita desbloqueo en Ajustes.");
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const attempts = Number(user.failedAttempts || 0) + 1;
    const locked = attempts >= config.loginMaxFailedAttempts;
    await exec("UPDATE users SET failed_attempts = ?, locked = ? WHERE id = ?", [attempts, locked, user.id]);
    recordFailedLogin(req, username);
    if (locked) await audit(user.username, "CUENTA_BLOQUEADA", "Intentos fallidos excedidos");
    throw httpError(401, locked ? "Cuenta bloqueada por intentos fallidos" : "Usuario o password incorrectos");
  }
  const roles = await userRoles(user.id);
  const access = await accessForRoles(roles);
  const token = crypto.randomBytes(Number(process.env.APP_TOKEN_RANDOM_BYTES || 48)).toString("base64url");
  sessions.set(token, {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roles,
    access,
    expiresAt: Date.now() + config.tokenTtlMinutes * 60 * 1000
  });
  clearFailedLogin(req, username);
  await exec("UPDATE users SET failed_attempts = 0, locked = FALSE, last_login_at = CURRENT_TIMESTAMP(6) WHERE id = ?", [user.id]);
  await audit(user.username, "LOGIN", "Sesion iniciada");
  res.json({ token, id: user.id, username: user.username, displayName: user.displayName, roles, access });
}));

app.use("/api", authRequired);

app.get("/api/auth/me", asyncHandler(async (req, res) => {
  const access = await userAccess(req.user.id);
  req.user.access = access;
  res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, roles: req.user.roles, access });
}));

app.post("/api/auth/logout", asyncHandler(async (req, res) => {
  sessions.delete(req.token);
  res.status(204).end();
}));

app.get("/api/ajustes/perfiles", requireAccess("ajustes", "canView"), asyncHandler(async (req, res) => {
  res.json(await listPerfilesUsuario());
}));

app.post("/api/ajustes/perfiles", requireAccess("ajustes", "canCreate"), asyncHandler(async (req, res) => {
  const body = req.body;
  const codigo = profileCode(body.codigo || body.nombre);
  if (!codigo) throw httpError(400, "Codigo de perfil requerido");
  const existing = await one("SELECT codigo FROM perfiles_usuario WHERE codigo = ?", [codigo]);
  if (existing) throw httpError(409, "Ya existe un perfil con ese codigo");
  await exec(
    "INSERT INTO perfiles_usuario (codigo, nombre, descripcion, activo) VALUES (?, ?, ?, ?)",
    [codigo, required(body.nombre, "Nombre de perfil requerido"), emptyToNull(body.descripcion), bool(body.activo, true)]
  );
  await insertDefaultProfileAccess(codigo);
  await audit(req.user.username, "PERFIL_CREADO", `Perfil ${codigo}`);
  res.status(201).json(await getPerfilUsuario(codigo));
}));

app.put("/api/ajustes/perfiles/:codigo", requireAccess("ajustes", "canUpdate"), asyncHandler(async (req, res) => {
  const codigo = profileCode(req.params.codigo);
  await getPerfilUsuario(codigo);
  await exec(
    "UPDATE perfiles_usuario SET nombre = ?, descripcion = ?, activo = ? WHERE codigo = ?",
    [required(req.body.nombre, "Nombre de perfil requerido"), emptyToNull(req.body.descripcion), bool(req.body.activo, true), codigo]
  );
  if (!bool(req.body.activo, true)) dropRoleSessions(codigo);
  await audit(req.user.username, "PERFIL_ACTUALIZADO", `Perfil ${codigo}`);
  res.json(await getPerfilUsuario(codigo));
}));

app.put("/api/ajustes/perfiles/:codigo/estado", requireAccess("ajustes", "canUpdate"), asyncHandler(async (req, res) => {
  const codigo = profileCode(req.params.codigo);
  if (codigo === "ADMIN" && !bool(req.body.activo, true)) throw httpError(400, "No se puede dar de baja el perfil ADMIN");
  await getPerfilUsuario(codigo);
  await exec("UPDATE perfiles_usuario SET activo = ? WHERE codigo = ?", [bool(req.body.activo, true), codigo]);
  if (!bool(req.body.activo, true)) dropRoleSessions(codigo);
  await audit(req.user.username, "PERFIL_ESTADO", `Perfil ${codigo}`);
  res.json(await getPerfilUsuario(codigo));
}));

app.delete("/api/ajustes/perfiles/:codigo", requireAccess("ajustes", "canDelete"), asyncHandler(async (req, res) => {
  const codigo = profileCode(req.params.codigo);
  if (codigo === "ADMIN") throw httpError(400, "No se puede dar de baja el perfil ADMIN");
  await getPerfilUsuario(codigo);
  await exec("UPDATE perfiles_usuario SET activo = FALSE WHERE codigo = ?", [codigo]);
  dropRoleSessions(codigo);
  await audit(req.user.username, "PERFIL_BAJA", `Perfil ${codigo}`);
  res.status(204).end();
}));

app.delete("/api/ajustes/perfiles/:codigo/eliminar", requireAccess("ajustes", "canDelete"), asyncHandler(async (req, res) => {
  const codigo = profileCode(req.params.codigo);
  if (codigo === "ADMIN") throw httpError(400, "No se puede eliminar el perfil ADMIN");
  const perfil = await getPerfilUsuario(codigo);
  if (Number(perfil.usuariosAsignados || 0) > 0) {
    throw httpError(409, "No se puede eliminar un perfil asignado a usuarios. Primero retira ese perfil de las cuentas.");
  }
  await exec("DELETE FROM perfiles_usuario WHERE codigo = ?", [codigo]);
  dropRoleSessions(codigo);
  await audit(req.user.username, "PERFIL_ELIMINADO", `Perfil ${codigo}`);
  res.status(204).end();
}));

app.get("/api/ajustes/usuarios", requireAccess("ajustes", "canView"), asyncHandler(async (req, res) => {
  res.json(await listUsuariosAjustes());
}));

app.post("/api/ajustes/usuarios", requireAccess("ajustes", "canCreate"), asyncHandler(async (req, res) => {
  const body = req.body;
  const roles = await validatedProfileCodes(body.roles);
  const passwordHash = await bcrypt.hash(requiredPassword(body.password), config.bcryptStrength);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO users (username, password_hash, display_name, email, active, locked, failed_attempts, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP(6))`,
      [
        required(body.username, "Usuario requerido"),
        passwordHash,
        required(body.displayName, "Nombre requerido"),
        emptyToNull(body.email),
        bool(body.active, true),
        bool(body.locked, false)
      ]
    );
    for (const role of roles) {
      await conn.query("INSERT INTO user_roles (user_id, role) VALUES (?, ?)", [result.insertId, role]);
    }
    await conn.commit();
    await audit(req.user.username, "USUARIO_CREADO", `Usuario ${result.insertId}`);
    res.status(201).json(await getUsuarioAjustes(result.insertId));
  } catch (error) {
    await conn.rollback();
    if (error.code === "ER_DUP_ENTRY") throw httpError(409, "Ya existe un usuario con ese nombre");
    throw error;
  } finally {
    conn.release();
  }
}));

app.put("/api/ajustes/usuarios/:id", requireAccess("ajustes", "canUpdate"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await getUsuarioAjustes(id);
  const roles = await validatedProfileCodes(req.body.roles);
  const nextActive = bool(req.body.active, true);
  await ensureAdminAccountRemains(id, nextActive, roles);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "UPDATE users SET username = ?, display_name = ?, email = ?, active = ?, locked = ? WHERE id = ?",
      [
        required(req.body.username, "Usuario requerido"),
        required(req.body.displayName, "Nombre requerido"),
        emptyToNull(req.body.email),
        nextActive,
        bool(req.body.locked, false),
        id
      ]
    );
    await conn.query("DELETE FROM user_roles WHERE user_id = ?", [id]);
    for (const role of roles) {
      await conn.query("INSERT INTO user_roles (user_id, role) VALUES (?, ?)", [id, role]);
    }
    await conn.commit();
    dropUserSessions(id);
    await audit(req.user.username, "USUARIO_ACTUALIZADO", `Usuario ${id}`);
    res.json(await getUsuarioAjustes(id));
  } catch (error) {
    await conn.rollback();
    if (error.code === "ER_DUP_ENTRY") throw httpError(409, "Ya existe un usuario con ese nombre");
    throw error;
  } finally {
    conn.release();
  }
}));

app.put("/api/ajustes/usuarios/:id/estado", requireAccess("ajustes", "canUpdate"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const active = bool(req.body.active, true);
  const user = await getUsuarioAjustes(id);
  await ensureAdminAccountRemains(id, active, user.roles);
  await exec("UPDATE users SET active = ?, locked = CASE WHEN ? THEN locked ELSE TRUE END WHERE id = ?", [active, active, id]);
  if (!active) dropUserSessions(id);
  await audit(req.user.username, active ? "USUARIO_ACTIVADO" : "USUARIO_BAJA", `Usuario ${id}`);
  res.json(await getUsuarioAjustes(id));
}));

app.delete("/api/ajustes/usuarios/:id", requireAccess("ajustes", "canDelete"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = await getUsuarioAjustes(id);
  await ensureAdminAccountRemains(id, false, user.roles);
  await exec("UPDATE users SET active = FALSE, locked = TRUE WHERE id = ?", [id]);
  dropUserSessions(id);
  await audit(req.user.username, "USUARIO_BAJA", `Usuario ${id}`);
  res.status(204).end();
}));

app.put("/api/ajustes/usuarios/:id/password", requireAccess("ajustes", "canUpdate"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await getUsuarioAjustes(id);
  const passwordHash = await bcrypt.hash(requiredPassword(req.body.password), config.bcryptStrength);
  await exec(
    "UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP(6), failed_attempts = 0, locked = FALSE WHERE id = ?",
    [passwordHash, id]
  );
  dropUserSessions(id, req.token);
  await audit(req.user.username, "USUARIO_PASSWORD", `Usuario ${id}`);
  res.json(await getUsuarioAjustes(id));
}));

app.put("/api/ajustes/usuarios/:id/unlock", requireAccess("ajustes", "canUpdate"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await getUsuarioAjustes(id);
  await exec("UPDATE users SET locked = FALSE, failed_attempts = 0 WHERE id = ?", [id]);
  await audit(req.user.username, "USUARIO_DESBLOQUEADO", `Usuario ${id}`);
  res.json(await getUsuarioAjustes(id));
}));

app.get("/api/ajustes/accesos", requireAccess("ajustes", "canView"), asyncHandler(async (req, res) => {
  const [perfiles, accesos] = await Promise.all([
    listPerfilesUsuario(),
    listProfileAccess()
  ]);
  res.json({ catalog: ACCESS_CATALOG, actions: ACCESS_ACTION_KEYS, perfiles, accesos });
}));

app.put("/api/ajustes/accesos/:codigo", requireAccess("ajustes", "canUpdate"), asyncHandler(async (req, res) => {
  const codigo = profileCode(req.params.codigo);
  await getPerfilUsuario(codigo);
  const accesos = normalizeProfileAccess(codigo, req.body.accesos);
  const ajustes = accesos.find(item => item.modulo === "ajustes");
  if (codigo === "ADMIN" && !ajustes?.canView) {
    throw httpError(400, "El perfil ADMIN debe conservar acceso a Ajustes");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM perfil_accesos WHERE perfil_codigo = ?", [codigo]);
    for (const acceso of accesos) {
      await conn.query(
        `INSERT INTO perfil_accesos
          (perfil_codigo, modulo, can_view, can_create, can_update, can_delete, can_import, can_export)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          codigo,
          acceso.modulo,
          acceso.canView,
          acceso.canCreate,
          acceso.canUpdate,
          acceso.canDelete,
          acceso.canImport,
          acceso.canExport
        ]
      );
    }
    await conn.commit();
    await refreshAccessSessionsForRole(codigo);
    await audit(req.user.username, "PERFIL_ACCESOS", `Perfil ${codigo}`);
    res.json({ catalog: ACCESS_CATALOG, actions: ACCESS_ACTION_KEYS, perfiles: await listPerfilesUsuario(), accesos: await listProfileAccess() });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.get("/api/clientes", requireReadAccess("clientes"), asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const rows = await all(
    `SELECT id, nombre_cliente AS nombreCliente, calle, colonia, municipio, estado, rfc, cp, razon_social AS razonSocial,
            formato_factura AS formatoFactura, activo
       FROM clientes
      WHERE activo = TRUE ${q ? "AND nombre_cliente LIKE ?" : ""}
      ORDER BY nombre_cliente ASC`,
    q ? [`%${q}%`] : []
  );
  res.json(rows.map(row => ({ ...row, formatoFactura: Boolean(row.formatoFactura), activo: Boolean(row.activo) })));
}));

app.post("/api/clientes", requireAccess("clientes", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateClienteBody(req.body);
  const result = await exec(
    `INSERT INTO clientes (nombre_cliente, calle, colonia, municipio, estado, rfc, cp, razon_social, formato_factura, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      required(body.nombreCliente, "Nombre de cliente requerido"),
      emptyToNull(body.calle),
      emptyToNull(body.colonia),
      emptyToNull(body.municipio),
      emptyToNull(body.estado),
      emptyToNull(body.rfc),
      emptyToNull(body.cp),
      emptyToNull(body.razonSocial),
      bool(body.formatoFactura, true),
      bool(body.activo, true)
    ]
  );
  await audit(req.user.username, "CLIENTE_CREADO", `Cliente ${result.insertId}`);
  res.status(201).json(await getCliente(result.insertId));
}));

app.put("/api/clientes/:id", requireAccess("clientes", "canUpdate"), asyncHandler(async (req, res) => {
  const body = validateClienteBody(req.body);
  await exec(
    `UPDATE clientes
        SET nombre_cliente = ?, calle = ?, colonia = ?, municipio = ?, estado = ?, rfc = ?, cp = ?, razon_social = ?,
            formato_factura = ?, activo = ?
      WHERE id = ?`,
    [
      required(body.nombreCliente, "Nombre de cliente requerido"),
      emptyToNull(body.calle),
      emptyToNull(body.colonia),
      emptyToNull(body.municipio),
      emptyToNull(body.estado),
      emptyToNull(body.rfc),
      emptyToNull(body.cp),
      emptyToNull(body.razonSocial),
      bool(body.formatoFactura, true),
      bool(body.activo, true),
      req.params.id
    ]
  );
  await audit(req.user.username, "CLIENTE_ACTUALIZADO", `Cliente ${req.params.id}`);
  res.json(await getCliente(req.params.id));
}));

app.get("/api/proveedores", requireReadAccess("proveedores"), asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const rows = await all(
    `SELECT id, nombre_proveedor AS nombreProveedor, razon_social AS razonSocial, representante_legal AS representanteLegal,
            direccion_fiscal AS direccionFiscal, ciudad, rfc, calle, colonia, municipio, estado, cp, telefono, fax,
            contacto, correo, condiciones_pago AS condicionesPago, banco, clabe, numero_cuenta AS numeroCuenta,
            retencion_iva_pct AS retencionIvaPct, retencion_isr_pct AS retencionIsrPct, activo
       FROM proveedores
      WHERE activo = TRUE ${q ? "AND nombre_proveedor LIKE ?" : ""}
      ORDER BY nombre_proveedor ASC`,
    q ? [`%${q}%`] : []
  );
  res.json(rows.map(row => ({ ...row, activo: Boolean(row.activo) })));
}));

app.post("/api/proveedores", requireAccess("proveedores", "canCreate"), asyncHandler(async (req, res) => {
  const result = await exec(
    `INSERT INTO proveedores
      (nombre_proveedor, razon_social, representante_legal, direccion_fiscal, ciudad, rfc, calle, colonia, municipio, estado, cp,
       telefono, fax, contacto, correo, condiciones_pago, banco, clabe, numero_cuenta, retencion_iva_pct, retencion_isr_pct, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    proveedorParams(req.body)
  );
  await audit(req.user.username, "PROVEEDOR_CREADO", `Proveedor ${result.insertId}`);
  res.status(201).json(await getProveedor(result.insertId));
}));

app.put("/api/proveedores/:id", requireAccess("proveedores", "canUpdate"), asyncHandler(async (req, res) => {
  await exec(
    `UPDATE proveedores
        SET nombre_proveedor = ?, razon_social = ?, representante_legal = ?, direccion_fiscal = ?, ciudad = ?, rfc = ?,
            calle = ?, colonia = ?, municipio = ?, estado = ?, cp = ?, telefono = ?, fax = ?, contacto = ?, correo = ?,
            condiciones_pago = ?, banco = ?, clabe = ?, numero_cuenta = ?, retencion_iva_pct = ?, retencion_isr_pct = ?, activo = ?
      WHERE id = ?`,
    [...proveedorParams(req.body), req.params.id]
  );
  await audit(req.user.username, "PROVEEDOR_ACTUALIZADO", `Proveedor ${req.params.id}`);
  res.json(await getProveedor(req.params.id));
}));

app.get("/api/operadores", requireReadAccess("operadores", "tiempos"), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT id, nombre_operador AS nombreOperador, turno, activo, supervisor, chofer
       FROM operadores WHERE activo = TRUE ORDER BY nombre_operador ASC`
  );
  res.json(rows.map(row => ({ ...row, activo: Boolean(row.activo), supervisor: Boolean(row.supervisor), chofer: Boolean(row.chofer) })));
}));

app.post("/api/operadores", requireAccess("operadores", "canCreate"), asyncHandler(async (req, res) => {
  const result = await exec(
    "INSERT INTO operadores (nombre_operador, turno, activo, supervisor, chofer) VALUES (?, ?, ?, ?, ?)",
    operadorParams(req.body)
  );
  await audit(req.user.username, "OPERADOR_CREADO", `Operador ${result.insertId}`);
  res.status(201).json(await getOperador(result.insertId));
}));

app.put("/api/operadores/:id", requireAccess("operadores", "canUpdate"), asyncHandler(async (req, res) => {
  await exec(
    "UPDATE operadores SET nombre_operador = ?, turno = ?, activo = ?, supervisor = ?, chofer = ? WHERE id = ?",
    [...operadorParams(req.body), req.params.id]
  );
  await audit(req.user.username, "OPERADOR_ACTUALIZADO", `Operador ${req.params.id}`);
  res.json(await getOperador(req.params.id));
}));

app.get("/api/estatus-produccion", requireAnyReadAccess("piezas", "monitor", "tiempos", "reportes", "dashboard"), asyncHandler(async (req, res) => {
  const rows = await all("SELECT id, descripcion, grupo FROM estatus_produccion ORDER BY descripcion ASC");
  res.json(rows);
}));

app.get("/api/piezas", requireAnyReadAccess("piezas", "monitor", "ordenes", "requisiciones", "remisiones", "reportes", "dashboard"), asyncHandler(async (req, res) => {
  res.json(await listPiezas());
}));

app.post("/api/piezas", requireAccess("piezas", "canCreate"), asyncHandler(async (req, res) => {
  const body = normalizePieza(req.body);
  const result = await exec(
    `INSERT INTO piezas
      (cliente_id, estatus_id, orden_compra, descripcion, cantidad, cantidad_entregada, fecha_requerimiento, fecha_compromiso,
       entregado, archivo, no_dibujo, no_parte, precio, moneda_precio, tipo_cambio_usd_mxn, material, tratamiento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    piezaParams(body)
  );
  await audit(req.user.username, "PIEZA_CREADA", `Pieza ${result.insertId}`);
  res.status(201).json(await getPieza(result.insertId));
}));

app.post("/api/piezas/dibujos", requireAccess("piezas", "canCreate"), upload.single("archivo"), asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, "Selecciona un dibujo para importar");
  res.status(201).json({
    archivo: `uploads/dibujos/${req.file.filename}`,
    nombreOriginal: req.file.originalname
  });
}));

app.get("/api/piezas/:id/pdf", requireAnyAccess(
  { moduleId: "piezas", actionKey: "canExport" },
  { moduleId: "monitor", actionKey: "canExport" },
  { moduleId: "reportes", actionKey: "canExport" }
), asyncHandler(async (req, res) => {
  const pieza = await getPieza(req.params.id);
  const [notas, estimaciones] = await Promise.all([
    listPiezaNotas(pieza.id),
    listEstimaciones(pieza.id)
  ]);
  sendPdf(res, `pieza-${pieza.id}.pdf`, piezaDocumentLines(pieza, notas, estimaciones));
}));

app.put("/api/piezas/:id", requireAccess("piezas", "canUpdate"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const body = normalizePieza(req.body);
  if (id === TORNOS_INTERNAL_PIEZA_ID) {
    body.entregado = false;
    body.cantidadEntregada = 0;
  }
  await exec(
    `UPDATE piezas
        SET cliente_id = ?, estatus_id = ?, orden_compra = ?, descripcion = ?, cantidad = ?, cantidad_entregada = ?,
            fecha_requerimiento = ?, fecha_compromiso = ?, entregado = ?, archivo = ?, no_dibujo = ?, no_parte = ?,
            precio = ?, moneda_precio = ?, tipo_cambio_usd_mxn = ?, material = ?, tratamiento = ?
      WHERE id = ?`,
    [...piezaParams(body), id]
  );
  await audit(req.user.username, "PIEZA_ACTUALIZADA", `Pieza ${id}`);
  res.json(await getPieza(id));
}));

app.put("/api/piezas/:id/estatus", requireAnyAccess(
  { moduleId: "piezas", actionKey: "canUpdate" },
  { moduleId: "monitor", actionKey: "canUpdate" }
), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const estatusId = Number(req.body.estatusId);
  const estatus = await one("SELECT id, descripcion FROM estatus_produccion WHERE id = ?", [estatusId]);
  if (!estatus) throw httpError(404, "Estatus no encontrado");
  const pieza = await getPieza(id);
  const delivered = id !== TORNOS_INTERNAL_PIEZA_ID && String(estatus.descripcion).toLowerCase() === "entregado";
  await exec(
    "UPDATE piezas SET estatus_id = ?, entregado = ?, cantidad_entregada = CASE WHEN ? THEN cantidad ELSE cantidad_entregada END WHERE id = ?",
    [estatusId, delivered, delivered, id]
  );
  if (req.body.nota && String(req.body.nota).trim()) {
    await addPiezaNota(id, estatusId, req.body.nota, req.user.username);
  }
  await audit(req.user.username, "PIEZA_ESTATUS_ACTUALIZADO", `Pieza ${id} estatus ${estatus.descripcion}`);
  res.json(await getPieza(id));
}));

app.get("/api/piezas/:id/notas", requireAnyReadAccess("piezas", "monitor", "reportes"), asyncHandler(async (req, res) => {
  await getPieza(req.params.id);
  res.json(await listPiezaNotas(req.params.id));
}));

app.post("/api/piezas/:id/notas", requireAnyAccess(
  { moduleId: "piezas", actionKey: "canUpdate" },
  { moduleId: "monitor", actionKey: "canUpdate" }
), asyncHandler(async (req, res) => {
  const pieza = await getPieza(req.params.id);
  const saved = await addPiezaNota(pieza.id, req.body.estatusId || pieza.estatusId, req.body.nota, req.user.username);
  res.status(201).json(saved);
}));

app.get("/api/piezas/:id/estimaciones", requireAnyReadAccess("monitor", "reportes"), asyncHandler(async (req, res) => {
  await getPieza(req.params.id);
  res.json(await listEstimaciones(req.params.id));
}));

app.post("/api/piezas/:id/estimaciones", requireAccess("monitor", "canUpdate"), asyncHandler(async (req, res) => {
  const pieza = await getPieza(req.params.id);
  const result = await exec(
    `INSERT INTO pieza_estimaciones
      (pieza_id, descripcion, horas_estimadas, costo_estimado, moneda, observaciones, usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      pieza.id,
      required(req.body.descripcion || "Estimacion de produccion", "Descripcion requerida"),
      num(req.body.horasEstimadas, 0),
      num(req.body.costoEstimado, 0),
      String(req.body.moneda || "MXN").toUpperCase() === "USD" ? "USD" : "MXN",
      emptyToNull(req.body.observaciones),
      req.user.username
    ]
  );
  await audit(req.user.username, "PIEZA_ESTIMACION_CREADA", `Pieza ${pieza.id} estimacion ${result.insertId}`);
  res.status(201).json((await listEstimaciones(pieza.id)).find(item => Number(item.id) === Number(result.insertId)));
}));

app.get("/api/estimaciones", requireAnyReadAccess("monitor", "reportes", "dashboard"), asyncHandler(async (req, res) => {
  res.json(await listEstimaciones());
}));

app.get("/api/ordenes-trabajo", requireReadAccess("ordenes"), asyncHandler(async (req, res) => {
  res.json(await listOrdenesTrabajo());
}));

app.post("/api/ordenes-trabajo", requireAccess("ordenes", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateOrdenTrabajoBody(req.body);
  const piezaIds = Array.isArray(body.piezaIds) ? body.piezaIds.map(Number).filter(Number.isFinite) : [];
  if (!piezaIds.length) throw httpError(400, "Selecciona al menos una pieza");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [piezas] = await conn.query(`SELECT id, cliente_id AS clienteId, orden_trabajo_id AS ordenTrabajoId, entregado FROM piezas WHERE id IN (${placeholders(piezaIds)})`, piezaIds);
    if (piezas.length !== piezaIds.length) throw httpError(400, "Una o mas piezas seleccionadas no existen");
    for (const pieza of piezas) {
      if (Number(pieza.clienteId) !== Number(body.clienteId)) throw httpError(400, "Todas las piezas deben pertenecer al mismo cliente");
      if (pieza.ordenTrabajoId) throw httpError(400, `La pieza ${pieza.id} ya tiene orden de trabajo`);
      if (pieza.entregado) throw httpError(400, `La pieza ${pieza.id} ya fue entregada`);
    }
    const [result] = await conn.query(
      `INSERT INTO ordenes_trabajo (cliente_id, orden_compra, fecha, fecha_compromiso, observaciones, created_by, cancelado)
       VALUES (?, ?, NOW(6), ?, ?, ?, FALSE)`,
      [body.clienteId, required(body.ordenCompra, "Orden de compra requerida"), body.fechaCompromiso, emptyToNull(body.observaciones), req.user.username]
    );
    await conn.query(
      `UPDATE piezas SET orden_trabajo_id = ?, orden_compra = ?, fecha_compromiso = ? WHERE id IN (${placeholders(piezaIds)})`,
      [result.insertId, body.ordenCompra, body.fechaCompromiso, ...piezaIds]
    );
    await conn.commit();
    await audit(req.user.username, "OT_CREADA", `OT ${result.insertId}`);
    res.status(201).json((await listOrdenesTrabajo()).find(item => Number(item.id) === Number(result.insertId)));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.get("/api/ordenes-trabajo/:id/pdf", requireAccess("ordenes", "canExport"), asyncHandler(async (req, res) => {
  const orden = await getOrdenTrabajo(req.params.id);
  const piezas = (await listPiezas()).filter(pieza => Number(pieza.ordenTrabajoId) === Number(orden.id));
  sendPdf(res, `orden-trabajo-${orden.id}.pdf`, ordenTrabajoLines(orden, piezas));
}));

app.get("/api/monitor-produccion", requireReadAccess("monitor"), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT p.id AS piezaId, p.orden_trabajo_id AS ordenTrabajoId, c.nombre_cliente AS cliente, p.orden_compra AS ordenCompra,
            p.no_parte AS noParte, p.no_dibujo AS noDibujo, p.descripcion, p.cantidad, p.cantidad_entregada AS cantidadEntregada,
            DATE_FORMAT(p.fecha_compromiso, '%Y-%m-%d') AS fechaCompromiso, e.descripcion AS estatus,
            DATEDIFF(p.fecha_compromiso, CURRENT_DATE()) AS diasCompromiso, p.precio,
            p.fecha_compromiso < CURRENT_DATE() AS vencida,
            est.horas_estimadas AS horasEstimadas, est.costo_estimado AS costoEstimado, est.moneda AS monedaEstimacion
       FROM piezas p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN estatus_produccion e ON e.id = p.estatus_id
       LEFT JOIN pieza_estimaciones est
         ON est.id = (
           SELECT pe.id
             FROM pieza_estimaciones pe
            WHERE pe.pieza_id = p.id
            ORDER BY pe.created_at DESC, pe.id DESC
            LIMIT 1
         )
      WHERE p.entregado = FALSE
      ORDER BY p.fecha_compromiso ASC`
  );
  res.json(rows.map(row => ({ ...row, vencida: Boolean(row.vencida) })));
}));

app.get("/api/tiempos", requireAnyReadAccess("tiempos", "reportes"), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT t.id, t.pieza_id AS piezaId, p.descripcion AS piezaDescripcion, t.operador_id AS operadorId,
            o.nombre_operador AS operadorNombre, t.estatus_id AS estatusId, e.descripcion AS estatus,
            t.descripcion_operacion AS descripcionOperacion,
            DATE_FORMAT(t.inicio_operacion, '%Y-%m-%dT%H:%i:%s') AS inicio,
            DATE_FORMAT(t.fin_operacion, '%Y-%m-%dT%H:%i:%s') AS fin,
            t.minutos
       FROM tiempos_produccion t
       JOIN piezas p ON p.id = t.pieza_id
      JOIN operadores o ON o.id = t.operador_id
      JOIN estatus_produccion e ON e.id = t.estatus_id
      ORDER BY t.inicio_operacion DESC
      LIMIT 500`
  );
  res.json(rows);
}));

app.post("/api/tiempos", requireAccess("tiempos", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateTiempoBody(req.body);
  const inicio = toMysqlDateTime(body.inicio);
  const fin = toMysqlDateTime(body.fin);
  const minutos = Math.round((new Date(body.fin).getTime() - new Date(body.inicio).getTime()) / 60000);
  if (!Number.isFinite(minutos) || minutos <= 0) throw httpError(400, "La hora fin debe ser posterior al inicio");
  const result = await exec(
    `INSERT INTO tiempos_produccion (pieza_id, operador_id, estatus_id, descripcion_operacion, inicio_operacion, fin_operacion, minutos)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.piezaId, body.operadorId, body.estatusId, body.descripcionOperacion, inicio, fin, minutos]
  );
  await exec("UPDATE piezas SET estatus_id = ? WHERE id = ?", [body.estatusId, body.piezaId]);
  await audit(req.user.username, "TIEMPO_CAPTURADO", `Tiempo ${result.insertId}`);
  res.status(201).json((await all("SELECT * FROM tiempos_produccion WHERE id = ?", [result.insertId]))[0]);
}));

app.get("/api/dashboard", requireAccess("dashboard", "canView"), asyncHandler(async (req, res) => {
  const [pendientes, vencidas, ordenes, requisiciones, reorden] = await Promise.all([
    count("SELECT COUNT(*) AS total FROM piezas WHERE entregado = FALSE"),
    count("SELECT COUNT(*) AS total FROM piezas WHERE entregado = FALSE AND fecha_compromiso < CURRENT_DATE()"),
    count("SELECT COUNT(*) AS total FROM ordenes_trabajo WHERE cancelado = FALSE"),
    count("SELECT COUNT(*) AS total FROM requisiciones WHERE cancelado = FALSE AND surtido = FALSE"),
    count("SELECT COUNT(*) AS total FROM almacen_articulos WHERE activo = TRUE AND existencia <= punto_reorden")
  ]);
  res.json({ piezasPendientes: pendientes, piezasVencidas: vencidas, ordenesTrabajo: ordenes, requisicionesPendientes: requisiciones, articulosReorden: reorden });
}));

app.get("/api/requisiciones", requireAnyReadAccess("requisiciones", "ordenesCompra"), asyncHandler(async (req, res) => {
  res.json(await listRequisiciones());
}));

app.get("/api/requisiciones/material-opciones", requireAnyReadAccess("requisiciones", "ordenesCompra"), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT id, material, descripcion, unidad_medida AS unidadMedida
       FROM requisicion_material_opciones
      WHERE activo = TRUE
      ORDER BY material ASC, descripcion ASC`
  );
  res.json(rows);
}));

app.post("/api/requisiciones", requireAccess("requisiciones", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateRequisicionBody(req.body);
  const detalles = body.detalles;
  if (!detalles.length) throw httpError(400, "Agrega al menos una partida");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO requisiciones (solicitante, fecha, prioridad, usuario_solicitante, autorizacion, observaciones, surtido, enviada_a_compras, cancelado)
       VALUES (?, NOW(6), ?, ?, ?, ?, FALSE, FALSE, FALSE)`,
      [
        body.solicitante,
        body.prioridad || "Normal",
        req.user.username,
        emptyToNull(body.autorizacion),
        emptyToNull(body.observaciones)
      ]
    );
    for (const detalle of detalles) {
      await conn.query(
        `INSERT INTO requisicion_detalles (requisicion_folio, pieza_id, cantidad, descripcion, destino, material, unidad_medida, precio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, detalle.piezaId || null, num(detalle.cantidad, 0), required(detalle.descripcion, "Descripcion requerida"), emptyToNull(detalle.destino), emptyToNull(detalle.material), emptyToNull(detalle.unidadMedida), detalle.precio ?? null]
      );
    }
    await conn.commit();
    await audit(req.user.username, "REQUISICION_CREADA", `Requisicion ${result.insertId}`);
    res.status(201).json((await listRequisiciones()).find(item => Number(item.folio) === Number(result.insertId)));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.get("/api/requisiciones/:folio/pdf", requireAccess("requisiciones", "canExport"), asyncHandler(async (req, res) => {
  const requisicion = (await listRequisiciones()).find(item => Number(item.folio) === Number(req.params.folio));
  if (!requisicion) throw httpError(404, "Requisicion no encontrada");
  sendPdf(res, `requisicion-${requisicion.folio}.pdf`, requisicionLines(requisicion), { fontName: "Courier", fontSize: 8, lineHeight: 12, wrapWidth: 105, pageSize: 58 });
}));

app.get("/api/ordenes-compra", requireReadAccess("ordenesCompra"), asyncHandler(async (req, res) => {
  res.json(await listOrdenesCompra());
}));

app.post("/api/ordenes-compra", requireAccess("ordenesCompra", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateOrdenCompraBody(req.body);
  const detalles = body.detalles;
  if (!detalles.length) throw httpError(400, "Selecciona al menos una partida");
  const proveedor = await getProveedor(body.proveedorId);
  const retencionIvaPct = num(body.retencionIvaPct ?? proveedor.retencionIvaPct, 0);
  const retencionIsrPct = num(body.retencionIsrPct ?? proveedor.retencionIsrPct, 0);
  const calculated = detalles.map(detalle => ({
    ...detalle,
    cantidad: num(detalle.cantidad, 0),
    precioUnitario: num(detalle.precioUnitario, 0)
  })).map(detalle => ({ ...detalle, subtotal: round2(detalle.cantidad * detalle.precioUnitario) }));
  const subtotal = round2(calculated.reduce((sum, detalle) => sum + detalle.subtotal, 0));
  const iva = round2(subtotal * IVA_RATE);
  const retencionIva = round2(iva * retencionIvaPct / 100);
  const retencionIsr = round2(subtotal * retencionIsrPct / 100);
  const total = round2(subtotal + iva - retencionIva - retencionIsr);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const folio = `OC-${Date.now()}`;
    const [result] = await conn.query(
      `INSERT INTO ordenes_compra
        (folio, proveedor_id, fecha, moneda, observaciones, created_by, subtotal, iva, retencion_iva_pct, retencion_isr_pct, retencion_iva, retencion_isr, total, cancelado)
       VALUES (?, ?, NOW(6), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [folio, body.proveedorId, body.moneda || "Moneda Nacional", emptyToNull(body.observaciones), req.user.username, subtotal, iva, retencionIvaPct, retencionIsrPct, retencionIva, retencionIsr, total]
    );
    for (const detalle of calculated) {
      if (detalle.requisicionDetalleId) {
        await conn.query(
          `UPDATE requisiciones r
             JOIN requisicion_detalles d ON d.requisicion_folio = r.folio
            SET r.enviada_a_compras = TRUE
          WHERE d.id = ?`,
          [detalle.requisicionDetalleId]
        );
      }
      await conn.query(
        `INSERT INTO orden_compra_detalles
          (orden_compra_id, requisicion_detalle_id, requisicion_folio, cantidad, descripcion, destino, material, unidad_medida, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, detalle.requisicionDetalleId || null, detalle.requisicionFolio || null, detalle.cantidad, required(detalle.descripcion, "Descripcion requerida"), emptyToNull(detalle.destino), emptyToNull(detalle.material), emptyToNull(detalle.unidadMedida), detalle.precioUnitario, detalle.subtotal]
      );
    }
    await conn.commit();
    await audit(req.user.username, "ORDEN_COMPRA_CREADA", `OC ${folio}`);
    res.status(201).json((await listOrdenesCompra()).find(item => Number(item.id) === Number(result.insertId)));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.delete("/api/ordenes-compra/:id", requireAccess("ordenesCompra", "canDelete"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const orden = (await listOrdenesCompra()).find(item => Number(item.id) === id);
  if (!orden) throw httpError(404, "Orden de compra no encontrada");
  if (orden.cancelado) throw httpError(409, "La orden de compra ya esta cancelada");
  await exec("UPDATE ordenes_compra SET cancelado = TRUE WHERE id = ?", [id]);
  await audit(req.user.username, "ORDEN_COMPRA_CANCELADA", `OC ${orden.folio}`);
  res.json({ ...orden, cancelado: true });
}));

app.get("/api/ordenes-compra/:id/pdf", requireAccess("ordenesCompra", "canExport"), asyncHandler(async (req, res) => {
  const orden = (await listOrdenesCompra()).find(item => Number(item.id) === Number(req.params.id));
  if (!orden) throw httpError(404, "Orden de compra no encontrada");
  sendPdf(res, `${orden.folio}.pdf`, ordenCompraLines(orden), { fontName: "Courier", fontSize: 8, lineHeight: 12, wrapWidth: 100, pageSize: 58 });
}));

app.get("/api/ordenes-compra/:id/word", requireAccess("ordenesCompra", "canExport"), asyncHandler(async (req, res) => {
  const orden = (await listOrdenesCompra()).find(item => Number(item.id) === Number(req.params.id));
  if (!orden) throw httpError(404, "Orden de compra no encontrada");
  res.setHeader("Content-Type", "application/rtf");
  res.setHeader("Content-Disposition", `attachment; filename="${orden.folio}.rtf"`);
  res.send(Buffer.from(rtfDocument(ordenCompraLines(orden)), "utf8"));
}));

app.get("/api/almacen/articulos", requireReadAccess("almacen"), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT id, descripcion, medida, existencia, minimo, maximo, punto_reorden AS puntoReorden, activo
       FROM almacen_articulos
      WHERE activo = TRUE
      ORDER BY descripcion ASC`
  );
  res.json(rows.map(row => ({ ...row, activo: Boolean(row.activo) })));
}));

app.post("/api/almacen/articulos", requireAccess("almacen", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateAlmacenArticuloBody(req.body);
  const result = await exec(
    `INSERT INTO almacen_articulos (descripcion, medida, existencia, minimo, maximo, punto_reorden, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.descripcion, emptyToNull(body.medida), body.existencia, body.minimo, body.maximo, body.puntoReorden, body.activo]
  );
  await audit(req.user.username, "ARTICULO_CREADO", `Articulo ${result.insertId}`);
  res.status(201).json((await all("SELECT id, descripcion, medida, existencia, minimo, maximo, punto_reorden AS puntoReorden, activo FROM almacen_articulos WHERE id = ?", [result.insertId]))[0]);
}));

app.get("/api/almacen/kardex", requireReadAccess("almacen"), asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT k.id, k.articulo_id AS articuloId, a.descripcion AS articuloDescripcion,
            DATE_FORMAT(k.fecha, '%Y-%m-%dT%H:%i:%s') AS fecha, k.tipo, k.cantidad, k.precio_unitario AS precioUnitario,
            k.total, k.referencia, k.observaciones
       FROM kardex_movimientos k
       JOIN almacen_articulos a ON a.id = k.articulo_id
      ORDER BY k.fecha DESC
      LIMIT 50`
  );
  res.json(rows);
}));

app.post("/api/almacen/entradas", requireAccess("almacen", "canUpdate"), asyncHandler(async (req, res) => {
  res.status(201).json(await almacenMovimiento(req, "ENTRADA"));
}));

app.post("/api/almacen/salidas", requireAccess("almacen", "canUpdate"), asyncHandler(async (req, res) => {
  res.status(201).json(await almacenMovimiento(req, "SALIDA"));
}));

app.get("/api/remisiones", requireReadAccess("remisiones"), asyncHandler(async (req, res) => {
  res.json(await listRemisiones());
}));

app.post("/api/remisiones", requireAccess("remisiones", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateRemisionBody(req.body);
  const piezaId = body.piezaId;
  const cantidadEntregada = body.cantidadEntregada;
  if (piezaId === TORNOS_INTERNAL_PIEZA_ID) throw httpError(400, "La pieza 2460 es interna de Tornos SA de CV");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[pieza]] = await conn.query("SELECT id, cliente_id AS clienteId, cantidad, cantidad_entregada AS cantidadEntregada FROM piezas WHERE id = ?", [piezaId]);
    if (!pieza) throw httpError(404, "Pieza no encontrada");
    const nuevaCantidad = Number(pieza.cantidadEntregada) + cantidadEntregada;
    if (nuevaCantidad > Number(pieza.cantidad)) throw httpError(400, "La remision excede la cantidad de la pieza");
    const folio = body.folio || `REM-${Date.now()}`;
    const [result] = await conn.query(
      `INSERT INTO remisiones (pieza_id, cliente_id, folio, fecha, cantidad_entregada, observaciones, autorizacion, chofer, activo)
       VALUES (?, ?, ?, NOW(6), ?, ?, ?, ?, TRUE)`,
      [piezaId, pieza.clienteId, folio, cantidadEntregada, emptyToNull(body.observaciones), emptyToNull(body.autorizacion), emptyToNull(body.chofer)]
    );
    await conn.query("UPDATE piezas SET cantidad_entregada = ?, entregado = ? WHERE id = ?", [nuevaCantidad, nuevaCantidad >= Number(pieza.cantidad), piezaId]);
    await conn.commit();
    await audit(req.user.username, "REMISION_CREADA", `Remision ${folio}`);
    res.status(201).json((await listRemisiones()).find(item => Number(item.id) === Number(result.insertId)));
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}));

app.get("/api/remisiones/:id/pdf", requireAccess("remisiones", "canExport"), asyncHandler(async (req, res) => {
  const remision = (await listRemisiones()).find(item => Number(item.id) === Number(req.params.id));
  if (!remision) throw httpError(404, "Remision no encontrada");
  const [pieza, notas] = await Promise.all([
    getPieza(remision.piezaId),
    listPiezaNotas(remision.piezaId)
  ]);
  sendPdf(res, `${remision.folio}.pdf`, remisionLines(remision, pieza, notas), { fontName: "Courier", fontSize: 8, lineHeight: 12, wrapWidth: 105, pageSize: 58 });
}));

app.get("/api/facturas", requireReadAccess("reportes"), asyncHandler(async (req, res) => {
  res.json(await listFacturas());
}));

app.post("/api/facturas", requireAccess("reportes", "canCreate"), asyncHandler(async (req, res) => {
  const body = validateFacturaBody(req.body);
  const remisionId = body.remisionId ? Number(body.remisionId) : null;
  const remision = remisionId ? (await listRemisiones()).find(item => Number(item.id) === remisionId) : null;
  if (remisionId && !remision) throw httpError(404, "Remision no encontrada");
  if (remisionId) {
    const existing = await one("SELECT id FROM facturas WHERE remision_id = ? AND cancelado = FALSE", [remisionId]);
    if (existing) throw httpError(409, "La remision ya tiene una factura activa registrada");
  }
  const clienteId = remision?.clienteId || Number(body.clienteId);
  await getCliente(clienteId);
  const subtotal = round2(num(body.subtotal, 0));
  const iva = body.iva == null || body.iva === "" ? round2(subtotal * IVA_RATE) : round2(num(body.iva, 0));
  const total = body.total == null || body.total === "" ? round2(subtotal + iva) : round2(num(body.total, 0));
  const result = await exec(
    `INSERT INTO facturas
      (remision_id, cliente_id, serie, folio, fecha, subtotal, iva, total, estatus, uuid, observaciones, created_by, cancelado)
     VALUES (?, ?, ?, ?, NOW(6), ?, ?, ?, ?, ?, ?, ?, FALSE)`,
    [
      remisionId,
      clienteId,
      emptyToNull(body.serie),
      body.folio,
      subtotal,
      iva,
      total,
      emptyToNull(body.estatus) || "Pendiente",
      emptyToNull(body.uuid),
      emptyToNull(body.observaciones),
      req.user.username
    ]
  );
  await audit(req.user.username, "FACTURA_REGISTRADA", `Factura ${result.insertId}`);
  res.status(201).json((await listFacturas()).find(item => Number(item.id) === Number(result.insertId)));
}));

app.get("/api/facturas/:id/pdf", requireAccess("reportes", "canExport"), asyncHandler(async (req, res) => {
  const factura = (await listFacturas()).find(item => Number(item.id) === Number(req.params.id));
  if (!factura) throw httpError(404, "Factura no encontrada");
  sendPdf(res, `factura-${factura.folio}.pdf`, facturaLines(factura));
}));

app.use((req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const message = status >= 500 ? "Error interno del servidor" : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ message });
});

await start();

async function start() {
  if (!config.adminPassword) {
    throw new Error("APP_BOOTSTRAP_ADMIN_PASSWORD es requerido. Define .env antes de iniciar.");
  }
  validateProductionConfig();
  await ensureDatabase();
  const migrationPool = createDbPool({ multipleStatements: true });
  try {
    pool = migrationPool;
    await migrate();
  } finally {
    await migrationPool.end();
  }
  pool = createDbPool({ multipleStatements: false });
  await bootstrapAdmin();
  app.listen(config.port, () => {
    console.log(`Tornos SA de CV Node escuchando en http://localhost:${config.port}`);
  });
}

function createDbPool({ multipleStatements = false } = {}) {
  return mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    multipleStatements,
    dateStrings: true
  });
}

function parseDbConfig() {
  const jdbc = process.env.DB_URL || "";
  if (jdbc) {
    const url = new URL(jdbc.replace(/^jdbc:/, ""));
    return {
      host: url.hostname || "localhost",
      port: Number(url.port || 3306),
      database: url.pathname.replace(/^\//, "") || DEFAULT_DB_NAME,
      user: process.env.DB_USER || url.username || "tornos_app",
      password: process.env.DB_PASSWORD || url.password || "",
      charset: "utf8mb4",
      ssl: url.searchParams.get("useSSL") === "true" ? dbSslConfig() : undefined
    };
  }
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || DEFAULT_DB_NAME,
    user: process.env.DB_USER || "tornos_app",
    password: process.env.DB_PASSWORD || "",
    charset: "utf8mb4",
    ssl: String(process.env.DB_SSL || "false").toLowerCase() === "true" ? dbSslConfig() : undefined
  };
}

function dbSslConfig() {
  const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false";
  const caFile = process.env.DB_SSL_CA_FILE;
  return {
    rejectUnauthorized,
    ...(caFile ? { ca: fsSyncRead(caFile) } : {})
  };
}

function fsSyncRead(filePath) {
  return readFileSync(path.resolve(projectRoot, filePath), "utf8");
}

async function ensureDatabase() {
  const { database, ...base } = config.db;
  let conn;
  try {
    conn = await mysql.createConnection({ ...base, multipleStatements: true });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } catch (error) {
    if (error.code !== "ER_DBACCESS_DENIED_ERROR" && error.code !== "ER_ACCESS_DENIED_ERROR") throw error;
  } finally {
    if (conn) await conn.end();
  }
}

async function migrate() {
  await exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );
  const [appliedRows, flywayRows] = await Promise.all([
    all("SELECT id FROM schema_migrations"),
    flywayApplied()
  ]);
  const applied = new Set(appliedRows.map(row => row.id));
  const flyway = new Set(flywayRows);
  const appliedVersions = new Set([...applied, ...flyway].map(migrationVersion).filter(Boolean));
  const files = (await fs.readdir(migrationsDir)).filter(file => /^V\d+__.+\.sql$/i.test(file)).sort(versionSort);

  for (const file of files) {
    if (applied.has(file)) continue;
    if (appliedVersions.has(migrationVersion(file))) {
      await exec("INSERT IGNORE INTO schema_migrations (id) VALUES (?)", [file]);
      continue;
    }
    if (flyway.has(file)) {
      await exec("INSERT IGNORE INTO schema_migrations (id) VALUES (?)", [file]);
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await exec(sql);
    await exec("INSERT INTO schema_migrations (id) VALUES (?)", [file]);
    console.log(`Migracion aplicada: ${file}`);
  }
}

async function flywayApplied() {
  const exists = await tableExists("flyway_schema_history");
  if (!exists) return [];
  const rows = await all("SELECT version, script, success FROM flyway_schema_history WHERE success = 1");
  return rows.map(row => row.script || `V${row.version}__.sql`);
}

async function tableExists(name) {
  const row = await one(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [name]
  );
  return Number(row?.total || 0) > 0;
}

async function bootstrapAdmin() {
  const existing = await one("SELECT id, password_hash AS passwordHash FROM users WHERE LOWER(username) = LOWER(?)", [config.adminUsername]);
  if (!existing) {
    const hash = await bcrypt.hash(config.adminPassword, config.bcryptStrength);
    const result = await exec(
      "INSERT INTO users (username, password_hash, display_name, active, locked, failed_attempts, password_changed_at) VALUES (?, ?, ?, TRUE, FALSE, 0, CURRENT_TIMESTAMP(6))",
      [config.adminUsername, hash, config.adminDisplayName]
    );
    await exec("INSERT INTO user_roles (user_id, role) VALUES (?, 'ADMIN'), (?, 'OPERADOR')", [result.insertId, result.insertId]);
    return;
  }
  if (config.adminResetPassword) {
    const hash = await bcrypt.hash(config.adminPassword, config.bcryptStrength);
    await exec(
      "UPDATE users SET password_hash = ?, display_name = ?, active = TRUE, locked = FALSE, failed_attempts = 0, password_changed_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
      [hash, config.adminDisplayName, existing.id]
    );
  }
  await exec("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'ADMIN'), (?, 'OPERADOR')", [existing.id, existing.id]);
}

async function listPerfilesUsuario() {
  const rows = await all(
    `SELECT p.id, p.codigo, p.nombre, p.descripcion, p.activo,
            DATE_FORMAT(p.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt,
            DATE_FORMAT(p.updated_at, '%Y-%m-%dT%H:%i:%s') AS updatedAt,
            COUNT(ur.user_id) AS usuariosAsignados
       FROM perfiles_usuario p
       LEFT JOIN user_roles ur ON ur.role = p.codigo
      GROUP BY p.id, p.codigo, p.nombre, p.descripcion, p.activo, p.created_at, p.updated_at
      ORDER BY p.activo DESC, p.nombre ASC`
  );
  return rows.map(row => ({
    ...row,
    activo: Boolean(row.activo),
    usuariosAsignados: Number(row.usuariosAsignados || 0)
  }));
}

async function getPerfilUsuario(codigo) {
  const perfil = (await listPerfilesUsuario()).find(row => row.codigo === codigo);
  if (!perfil) throw httpError(404, "Perfil no encontrado");
  return perfil;
}

async function listUsuariosAjustes() {
  const rows = await all(
    `SELECT u.id, u.username, u.display_name AS displayName, u.email, u.active, u.locked,
            u.failed_attempts AS failedAttempts,
            DATE_FORMAT(u.password_changed_at, '%Y-%m-%dT%H:%i:%s') AS passwordChangedAt,
            DATE_FORMAT(u.last_login_at, '%Y-%m-%dT%H:%i:%s') AS lastLoginAt,
            DATE_FORMAT(u.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt,
            GROUP_CONCAT(ur.role ORDER BY ur.role SEPARATOR ',') AS rolesText
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
      GROUP BY u.id, u.username, u.display_name, u.email, u.active, u.locked, u.failed_attempts,
               u.password_changed_at, u.last_login_at, u.created_at
      ORDER BY u.active DESC, u.username ASC`
  );
  return rows.map(row => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    active: Boolean(row.active),
    locked: Boolean(row.locked),
    failedAttempts: Number(row.failedAttempts || 0),
    passwordChangedAt: row.passwordChangedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    roles: row.rolesText ? row.rolesText.split(",").filter(Boolean) : []
  }));
}

async function getUsuarioAjustes(id) {
  const user = (await listUsuariosAjustes()).find(row => Number(row.id) === Number(id));
  if (!user) throw httpError(404, "Usuario no encontrado");
  return user;
}

async function listProfileAccess() {
  const rows = await all(
    `SELECT perfil_codigo AS perfilCodigo, modulo, can_view AS canView, can_create AS canCreate,
            can_update AS canUpdate, can_delete AS canDelete, can_import AS canImport, can_export AS canExport
       FROM perfil_accesos
      ORDER BY perfil_codigo ASC, modulo ASC`
  );
  const grouped = {};
  for (const row of rows) {
    grouped[row.perfilCodigo] ||= {};
    grouped[row.perfilCodigo][row.modulo] = accessDto(row);
  }
  return grouped;
}

async function insertDefaultProfileAccess(codigo) {
  const normalizedCode = profileCode(codigo);
  const defaults = normalizeProfileAccess(normalizedCode, []);
  for (const acceso of defaults) {
    await exec(
      `INSERT IGNORE INTO perfil_accesos
        (perfil_codigo, modulo, can_view, can_create, can_update, can_delete, can_import, can_export)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedCode,
        acceso.modulo,
        acceso.canView,
        acceso.canCreate,
        acceso.canUpdate,
        acceso.canDelete,
        acceso.canImport,
        acceso.canExport
      ]
    );
  }
}

async function userAccess(userId) {
  const roles = await userRoles(userId);
  return accessForRoles(roles);
}

async function accessForRoles(roles) {
  const normalizedRoles = roles.map(profileCode).filter(Boolean);
  if (!normalizedRoles.length) return {};
  const rows = await all(
    `SELECT modulo,
            MAX(can_view) AS canView,
            MAX(can_create) AS canCreate,
            MAX(can_update) AS canUpdate,
            MAX(can_delete) AS canDelete,
            MAX(can_import) AS canImport,
            MAX(can_export) AS canExport
       FROM perfil_accesos
      WHERE perfil_codigo IN (${placeholders(normalizedRoles)})
      GROUP BY modulo`,
    normalizedRoles
  );
  const access = {};
  for (const row of rows) {
    access[row.modulo] = accessDto(row);
  }
  if (normalizedRoles.includes("ADMIN")) {
    for (const item of ACCESS_CATALOG) access[item.id] ||= defaultAccess(true);
  }
  return access;
}

function normalizeProfileAccess(codigo, accesos = []) {
  const byModule = new Map(Array.isArray(accesos) ? accesos.map(item => [String(item.modulo || ""), item]) : []);
  return ACCESS_CATALOG.map(item => {
    const source = byModule.get(item.id) || {};
    const isAdmin = codigo === "ADMIN";
    const allowedByDefault = isAdmin || item.id !== "ajustes";
    return {
      modulo: item.id,
      ...Object.fromEntries(ACCESS_ACTION_KEYS.map(key => [key, bool(source[key], allowedByDefault)]))
    };
  });
}

function accessDto(row) {
  return {
    canView: Boolean(row.canView),
    canCreate: Boolean(row.canCreate),
    canUpdate: Boolean(row.canUpdate),
    canDelete: Boolean(row.canDelete),
    canImport: Boolean(row.canImport),
    canExport: Boolean(row.canExport)
  };
}

function defaultAccess(value) {
  return Object.fromEntries(ACCESS_ACTION_KEYS.map(key => [key, value]));
}

async function refreshAccessSessionsForRole(role) {
  const targetRole = profileCode(role);
  for (const session of sessions.values()) {
    if (session.roles?.some(item => profileCode(item) === targetRole)) {
      session.access = await accessForRoles(session.roles);
    }
  }
}

async function validatedProfileCodes(value) {
  const profiles = await listPerfilesUsuario();
  const validCodes = new Set(profiles.map(profile => profile.codigo));
  const rawRoles = Array.isArray(value) ? value : String(value || "").split(",");
  const roles = [...new Set(rawRoles.map(profileCode).filter(Boolean))];
  if (!roles.length) {
    const fallback = profiles.find(profile => profile.codigo === "OPERADOR" && profile.activo) || profiles.find(profile => profile.activo);
    if (fallback) roles.push(fallback.codigo);
  }
  if (!roles.length) throw httpError(400, "Selecciona al menos un perfil");
  for (const role of roles) {
    if (!validCodes.has(role)) throw httpError(400, `Perfil no valido: ${role}`);
  }
  return roles;
}

async function ensureAdminAccountRemains(userId, nextActive, nextRoles) {
  if (nextActive && nextRoles.includes("ADMIN")) return;
  const row = await one(
    `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.active = TRUE
        AND ur.role = 'ADMIN'
        AND u.id <> ?`,
    [userId]
  );
  if (Number(row?.total || 0) <= 0) {
    throw httpError(400, "Debe existir al menos un usuario activo con perfil ADMIN");
  }
}

function dropUserSessions(userId, keepToken = null) {
  for (const [token, session] of sessions.entries()) {
    if (Number(session.id) === Number(userId) && token !== keepToken) {
      sessions.delete(token);
    }
  }
}

function dropRoleSessions(role) {
  const targetRole = profileCode(role);
  for (const [token, session] of sessions.entries()) {
    if (session.roles?.some(item => profileCode(item) === targetRole)) {
      sessions.delete(token);
    }
  }
}

function profileCode(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function requiredPassword(value) {
  const password = String(value || "");
  if (password.length < 8) throw httpError(400, "El password debe tener al menos 8 caracteres");
  if (!/[A-Z]/.test(password)) throw httpError(400, "El password debe incluir al menos una mayuscula");
  if (!/[a-z]/.test(password)) throw httpError(400, "El password debe incluir al menos una minuscula");
  if (!/[\/&%$#".]/.test(password)) throw httpError(400, "El password debe incluir al menos un signo: / & % $ # \" .");
  return password;
}

async function listPiezas() {
  const rows = await all(
    `SELECT p.id, p.cliente_id AS clienteId, c.nombre_cliente AS clienteNombre, p.estatus_id AS estatusId,
            e.descripcion AS estatus, p.orden_trabajo_id AS ordenTrabajoId, p.orden_compra AS ordenCompra,
            p.descripcion, p.cantidad, p.cantidad_entregada AS cantidadEntregada,
            DATE_FORMAT(p.fecha_requerimiento, '%Y-%m-%d') AS fechaRequerimiento,
            DATE_FORMAT(p.fecha_compromiso, '%Y-%m-%d') AS fechaCompromiso,
            p.entregado, p.archivo, p.no_dibujo AS noDibujo, p.no_parte AS noParte, p.precio,
            COALESCE(ti.tiempo_invertido, 0) AS tiempoInvertido,
            p.moneda_precio AS monedaPrecio, p.tipo_cambio_usd_mxn AS tipoCambioUsdMxn, p.material, p.tratamiento
       FROM piezas p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN estatus_produccion e ON e.id = p.estatus_id
       LEFT JOIN (
         SELECT pieza_id, SUM(minutos) AS tiempo_invertido
           FROM tiempos_produccion
          GROUP BY pieza_id
       ) ti ON ti.pieza_id = p.id
      ORDER BY p.id DESC`
  );
  return rows.map(piezaDto);
}

async function getPieza(id) {
  const pieza = (await listPiezas()).find(row => Number(row.id) === Number(id));
  if (!pieza) throw httpError(404, "Pieza no encontrada");
  return pieza;
}

function piezaDto(row) {
  const precio = num(row.precio, 0);
  const tipoCambio = num(row.tipoCambioUsdMxn, 1);
  const moneda = row.monedaPrecio || "MXN";
  return {
    ...row,
    entregado: Boolean(row.entregado),
    tiempoInvertido: Number(row.tiempoInvertido || 0),
    precio,
    tipoCambioUsdMxn: tipoCambio,
    precioMxn: moneda === "USD" ? round2(precio * tipoCambio) : round2(precio)
  };
}

function normalizePieza(body) {
  body = validateFields(body, {
    clienteId: { type: "id", required: true, message: "Cliente requerido" },
    estatusId: { type: "id", required: true, message: "Estatus requerido" },
    ordenCompra: { type: "string", max: 80 },
    descripcion: { type: "string", required: true, max: 500, message: "Descripcion requerida" },
    cantidad: { type: "number", min: 0.01 },
    cantidadEntregada: { type: "number", min: 0, default: 0 },
    fechaRequerimiento: { type: "date" },
    fechaCompromiso: { type: "date", required: true, message: "Fecha compromiso requerida" },
    archivo: { type: "string", max: 300 },
    noDibujo: { type: "string", max: 120 },
    noParte: { type: "string", max: 120 },
    precio: { type: "number", min: 0, default: 0 },
    material: { type: "string", max: 200 },
    tratamiento: { type: "string", max: 200 }
  });
  const moneda = String(body.monedaPrecio || "MXN").toUpperCase();
  if (!["MXN", "USD"].includes(moneda)) throw httpError(400, "La moneda del precio debe ser MXN o USD");
  const tipoCambio = moneda === "USD" ? num(body.tipoCambioUsdMxn, 0) : 1;
  if (moneda === "USD" && tipoCambio <= 0) throw httpError(400, "Captura el tipo de cambio USD/MXN");
  return {
    ...body,
    monedaPrecio: moneda,
    tipoCambioUsdMxn: tipoCambio,
    fechaRequerimiento: body.fechaRequerimiento || today(),
    cantidadEntregada: num(body.cantidadEntregada, 0)
  };
}

function piezaParams(body) {
  return [
    body.clienteId,
    body.estatusId,
    body.ordenCompra || "",
    required(body.descripcion, "Descripcion requerida"),
    num(body.cantidad, 1),
    num(body.cantidadEntregada, 0),
    body.fechaRequerimiento,
    required(body.fechaCompromiso, "Fecha compromiso requerida"),
    bool(body.entregado, false),
    emptyToNull(body.archivo),
    emptyToNull(body.noDibujo),
    emptyToNull(body.noParte),
    num(body.precio, 0),
    body.monedaPrecio,
    body.tipoCambioUsdMxn,
    emptyToNull(body.material),
    emptyToNull(body.tratamiento)
  ];
}

async function addPiezaNota(piezaId, estatusId, nota, username) {
  const text = required(nota, "Nota requerida");
  const result = await exec(
    "INSERT INTO pieza_notas (pieza_id, estatus_id, nota, usuario) VALUES (?, ?, ?, ?)",
    [piezaId, estatusId || null, text, username]
  );
  return one(
    `SELECT n.id, n.pieza_id AS piezaId, n.estatus_id AS estatusId, e.descripcion AS estatus, n.nota, n.usuario,
            DATE_FORMAT(n.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt
       FROM pieza_notas n LEFT JOIN estatus_produccion e ON e.id = n.estatus_id WHERE n.id = ?`,
    [result.insertId]
  );
}

async function listPiezaNotas(piezaId) {
  return all(
    `SELECT n.id, n.pieza_id AS piezaId, n.estatus_id AS estatusId, e.descripcion AS estatus, n.nota, n.usuario,
            DATE_FORMAT(n.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt
       FROM pieza_notas n
       LEFT JOIN estatus_produccion e ON e.id = n.estatus_id
      WHERE n.pieza_id = ?
      ORDER BY n.created_at DESC`,
    [piezaId]
  );
}

async function listEstimaciones(piezaId = null) {
  const rows = await all(
    `SELECT pe.id, pe.pieza_id AS piezaId, pe.descripcion, pe.horas_estimadas AS horasEstimadas,
            pe.costo_estimado AS costoEstimado, pe.moneda, pe.observaciones, pe.usuario,
            DATE_FORMAT(pe.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt,
            p.orden_compra AS ordenCompra, p.no_parte AS noParte, p.no_dibujo AS noDibujo,
            p.descripcion AS piezaDescripcion, c.id AS clienteId, c.nombre_cliente AS clienteNombre
       FROM pieza_estimaciones pe
       JOIN piezas p ON p.id = pe.pieza_id
       JOIN clientes c ON c.id = p.cliente_id
      ${piezaId ? "WHERE pe.pieza_id = ?" : ""}
      ORDER BY pe.created_at DESC`,
    piezaId ? [piezaId] : []
  );
  return rows;
}

async function listOrdenesTrabajo() {
  const rows = await all(
    `SELECT ot.id, ot.cliente_id AS clienteId, c.nombre_cliente AS clienteNombre, ot.orden_compra AS ordenCompra,
            DATE_FORMAT(ot.fecha, '%Y-%m-%dT%H:%i:%s') AS fecha,
            DATE_FORMAT(ot.fecha_compromiso, '%Y-%m-%d') AS fechaCompromiso,
            ot.observaciones, ot.created_by AS createdBy, ot.cancelado,
            GROUP_CONCAT(p.id ORDER BY p.id) AS piezaIds
       FROM ordenes_trabajo ot
       JOIN clientes c ON c.id = ot.cliente_id
       LEFT JOIN piezas p ON p.orden_trabajo_id = ot.id
      GROUP BY ot.id
      ORDER BY ot.fecha DESC`
  );
  return rows.map(row => ({ ...row, cancelado: Boolean(row.cancelado), piezaIds: row.piezaIds ? row.piezaIds.split(",").map(Number) : [] }));
}

async function getOrdenTrabajo(id) {
  const orden = (await listOrdenesTrabajo()).find(row => Number(row.id) === Number(id));
  if (!orden) throw httpError(404, "Orden de trabajo no encontrada");
  return orden;
}

async function listRequisiciones() {
  const requisiciones = await all(
    `SELECT folio, solicitante, DATE_FORMAT(fecha, '%Y-%m-%dT%H:%i:%s') AS fecha, prioridad, usuario_solicitante AS usuarioSolicitante,
            autorizacion, observaciones, surtido, enviada_a_compras AS enviadaACompras, cancelado
       FROM requisiciones
      ORDER BY fecha DESC`
  );
  const detalles = await all(
    `SELECT id, requisicion_folio AS requisicionFolio, pieza_id AS piezaId, cantidad, descripcion, destino, material,
            unidad_medida AS unidadMedida, precio
       FROM requisicion_detalles
      ORDER BY id ASC`
  );
  const byFolio = groupBy(detalles, "requisicionFolio");
  return requisiciones.map(req => ({
    ...req,
    surtido: Boolean(req.surtido),
    enviadaACompras: Boolean(req.enviadaACompras),
    cancelado: Boolean(req.cancelado),
    detalles: byFolio.get(String(req.folio)) || []
  }));
}

async function listOrdenesCompra() {
  const ordenes = await all(
    `SELECT oc.id, oc.folio, oc.proveedor_id AS proveedorId, p.nombre_proveedor AS proveedorNombre, p.rfc AS proveedorRfc,
            p.direccion_fiscal AS proveedorDireccion, p.ciudad AS proveedorCiudad, p.telefono AS proveedorTelefono,
            p.contacto AS proveedorContacto, DATE_FORMAT(oc.fecha, '%Y-%m-%dT%H:%i:%s') AS fecha, oc.moneda,
            oc.observaciones, oc.created_by AS createdBy, oc.subtotal, oc.iva, oc.retencion_iva_pct AS retencionIvaPct,
            oc.retencion_isr_pct AS retencionIsrPct, oc.retencion_iva AS retencionIva, oc.retencion_isr AS retencionIsr,
            oc.total, oc.cancelado
       FROM ordenes_compra oc
       JOIN proveedores p ON p.id = oc.proveedor_id
      ORDER BY oc.fecha DESC`
  );
  const detalles = await all(
    `SELECT ocd.id, ocd.orden_compra_id AS ordenCompraId, ocd.requisicion_detalle_id AS requisicionDetalleId,
            ocd.requisicion_folio AS requisicionFolio, ocd.cantidad, ocd.descripcion, ocd.destino, ocd.material,
            ocd.unidad_medida AS unidadMedida, ocd.precio_unitario AS precioUnitario, ocd.subtotal, rd.pieza_id AS piezaId
       FROM orden_compra_detalles ocd
       LEFT JOIN requisicion_detalles rd ON rd.id = ocd.requisicion_detalle_id
      ORDER BY ocd.id ASC`
  );
  const byOrden = groupBy(detalles, "ordenCompraId");
  return ordenes.map(orden => ({ ...orden, cancelado: Boolean(orden.cancelado), detalles: byOrden.get(String(orden.id)) || [] }));
}

async function listRemisiones() {
  const rows = await all(
    `SELECT r.id, r.pieza_id AS piezaId, r.cliente_id AS clienteId, c.nombre_cliente AS clienteNombre, r.folio,
            DATE_FORMAT(r.fecha, '%Y-%m-%dT%H:%i:%s') AS fecha, r.cantidad_entregada AS cantidadEntregada,
            r.observaciones, r.autorizacion, r.chofer, r.activo
       FROM remisiones r
       JOIN clientes c ON c.id = r.cliente_id
      ORDER BY r.fecha DESC`
  );
  return rows.map(row => ({ ...row, activo: Boolean(row.activo) }));
}

async function listFacturas() {
  const rows = await all(
    `SELECT f.id, f.remision_id AS remisionId, f.cliente_id AS clienteId, c.nombre_cliente AS clienteNombre,
            r.folio AS remisionFolio, f.serie, f.folio, DATE_FORMAT(f.fecha, '%Y-%m-%dT%H:%i:%s') AS fecha,
            f.subtotal, f.iva, f.total, f.estatus, f.uuid, f.observaciones, f.created_by AS createdBy, f.cancelado
       FROM facturas f
       JOIN clientes c ON c.id = f.cliente_id
       LEFT JOIN remisiones r ON r.id = f.remision_id
      ORDER BY f.fecha DESC`
  );
  return rows.map(row => ({ ...row, cancelado: Boolean(row.cancelado) }));
}

async function almacenMovimiento(req, tipo) {
  const body = validateAlmacenMovimientoBody(req.body);
  const articuloId = body.articuloId;
  const cantidad = body.cantidad;
  const precioUnitario = body.precioUnitario;
  if (cantidad <= 0) throw httpError(400, "La cantidad debe ser mayor a cero");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[articulo]] = await conn.query("SELECT id, existencia FROM almacen_articulos WHERE id = ? FOR UPDATE", [articuloId]);
    if (!articulo) throw httpError(404, "Articulo no encontrado");
    if (tipo === "SALIDA" && Number(articulo.existencia) < cantidad) throw httpError(400, "Existencia insuficiente");
    const nuevaExistencia = tipo === "ENTRADA" ? Number(articulo.existencia) + cantidad : Number(articulo.existencia) - cantidad;
    await conn.query("UPDATE almacen_articulos SET existencia = ? WHERE id = ?", [nuevaExistencia, articuloId]);
    const total = round2(cantidad * precioUnitario);
    const [result] = await conn.query(
      `INSERT INTO kardex_movimientos (articulo_id, fecha, tipo, cantidad, precio_unitario, total, referencia, usuario_sistema, observaciones)
       VALUES (?, NOW(6), ?, ?, ?, ?, ?, ?, ?)`,
      [articuloId, tipo, cantidad, precioUnitario, total, emptyToNull(body.referencia), req.user.username, emptyToNull(body.observaciones)]
    );
    await conn.commit();
    await audit(req.user.username, `ALMACEN_${tipo}`, `Articulo ${articuloId}`);
    return (await all(
      `SELECT k.id, k.articulo_id AS articuloId, a.descripcion AS articuloDescripcion, DATE_FORMAT(k.fecha, '%Y-%m-%dT%H:%i:%s') AS fecha,
              k.tipo, k.cantidad, k.precio_unitario AS precioUnitario, k.total, k.referencia, k.observaciones
         FROM kardex_movimientos k JOIN almacen_articulos a ON a.id = k.articulo_id WHERE k.id = ?`,
      [result.insertId]
    ))[0];
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getCliente(id) {
  const row = await one(
    `SELECT id, nombre_cliente AS nombreCliente, calle, colonia, municipio, estado, rfc, cp, razon_social AS razonSocial,
            formato_factura AS formatoFactura, activo FROM clientes WHERE id = ?`,
    [id]
  );
  if (!row) throw httpError(404, "Cliente no encontrado");
  return { ...row, formatoFactura: Boolean(row.formatoFactura), activo: Boolean(row.activo) };
}

async function getProveedor(id) {
  const row = await one(
    `SELECT id, nombre_proveedor AS nombreProveedor, razon_social AS razonSocial, representante_legal AS representanteLegal,
            direccion_fiscal AS direccionFiscal, ciudad, rfc, calle, colonia, municipio, estado, cp, telefono, fax,
            contacto, correo, condiciones_pago AS condicionesPago, banco, clabe, numero_cuenta AS numeroCuenta,
            retencion_iva_pct AS retencionIvaPct, retencion_isr_pct AS retencionIsrPct, activo
       FROM proveedores WHERE id = ?`,
    [id]
  );
  if (!row) throw httpError(404, "Proveedor no encontrado");
  return { ...row, activo: Boolean(row.activo) };
}

async function getOperador(id) {
  const row = await one("SELECT id, nombre_operador AS nombreOperador, turno, activo, supervisor, chofer FROM operadores WHERE id = ?", [id]);
  if (!row) throw httpError(404, "Operador no encontrado");
  return { ...row, activo: Boolean(row.activo), supervisor: Boolean(row.supervisor), chofer: Boolean(row.chofer) };
}

function validateClienteBody(body) {
  return validateFields(body, {
    nombreCliente: { type: "string", required: true, max: 140, message: "Nombre de cliente requerido" },
    calle: { type: "string", max: 200 },
    colonia: { type: "string", max: 120 },
    municipio: { type: "string", max: 120 },
    estado: { type: "string", max: 120 },
    rfc: { type: "string", max: 20 },
    cp: { type: "string", max: 12 },
    razonSocial: { type: "string", max: 160 },
    formatoFactura: { type: "boolean", default: true },
    activo: { type: "boolean", default: true }
  });
}

function proveedorParams(body) {
  body = validateProveedorBody(body);
  return [
    required(body.nombreProveedor, "Nombre de proveedor requerido"),
    emptyToNull(body.razonSocial),
    emptyToNull(body.representanteLegal),
    emptyToNull(body.direccionFiscal),
    emptyToNull(body.ciudad),
    emptyToNull(body.rfc),
    emptyToNull(body.calle),
    emptyToNull(body.colonia),
    emptyToNull(body.municipio),
    emptyToNull(body.estado),
    emptyToNull(body.cp),
    emptyToNull(body.telefono),
    emptyToNull(body.fax),
    emptyToNull(body.contacto),
    emptyToNull(body.correo),
    emptyToNull(body.condicionesPago),
    emptyToNull(body.banco),
    emptyToNull(body.clabe),
    emptyToNull(body.numeroCuenta),
    num(body.retencionIvaPct, 0),
    num(body.retencionIsrPct, 0),
    bool(body.activo, true)
  ];
}

function operadorParams(body) {
  body = validateOperadorBody(body);
  return [
    required(body.nombreOperador, "Nombre de operador requerido"),
    num(body.turno, 0),
    bool(body.activo, true),
    bool(body.supervisor, false),
    bool(body.chofer, false)
  ];
}

function validateProveedorBody(body) {
  return validateFields(body, {
    nombreProveedor: { type: "string", required: true, max: 160, message: "Nombre de proveedor requerido" },
    razonSocial: { type: "string", max: 180 },
    representanteLegal: { type: "string", max: 160 },
    direccionFiscal: { type: "string", max: 240 },
    ciudad: { type: "string", max: 120 },
    rfc: { type: "string", max: 20 },
    calle: { type: "string", max: 200 },
    colonia: { type: "string", max: 120 },
    municipio: { type: "string", max: 120 },
    estado: { type: "string", max: 120 },
    cp: { type: "string", max: 12 },
    telefono: { type: "string", max: 60 },
    fax: { type: "string", max: 60 },
    contacto: { type: "string", max: 160 },
    correo: { type: "string", max: 160 },
    condicionesPago: { type: "string", max: 120 },
    banco: { type: "string", max: 120 },
    clabe: { type: "string", max: 40 },
    numeroCuenta: { type: "string", max: 40 },
    retencionIvaPct: { type: "number", min: 0, max: 100, default: 0 },
    retencionIsrPct: { type: "number", min: 0, max: 100, default: 0 },
    activo: { type: "boolean", default: true }
  });
}

function validateOperadorBody(body) {
  return validateFields(body, {
    nombreOperador: { type: "string", required: true, max: 120, message: "Nombre de operador requerido" },
    turno: { type: "number", min: 0, max: 9, default: 0 },
    activo: { type: "boolean", default: true },
    supervisor: { type: "boolean", default: false },
    chofer: { type: "boolean", default: false }
  });
}

function validateOrdenTrabajoBody(body) {
  const output = validateFields(body, {
    clienteId: { type: "id", required: true, message: "Cliente requerido" },
    ordenCompra: { type: "string", required: true, max: 80, message: "Orden de compra requerida" },
    fechaCompromiso: { type: "date", required: true, message: "Fecha compromiso requerida" },
    observaciones: { type: "string", max: 500 }
  });
  output.piezaIds = validateIdArray(body?.piezaIds, "piezas");
  return output;
}

function validateTiempoBody(body) {
  return validateFields(body, {
    piezaId: { type: "id", required: true, message: "Pieza requerida" },
    operadorId: { type: "id", required: true, message: "Operador requerido" },
    estatusId: { type: "id", required: true, message: "Estatus requerido" },
    descripcionOperacion: { type: "string", required: true, max: 180, message: "Operacion requerida" },
    inicio: { type: "datetime", required: true, message: "Inicio requerido" },
    fin: { type: "datetime", required: true, message: "Fin requerido" }
  });
}

function validateRequisicionBody(body) {
  const output = validateFields(body, {
    solicitante: { type: "string", required: true, max: 120, message: "Solicitante requerido" },
    prioridad: { type: "string", max: 40, default: "Normal" },
    autorizacion: { type: "string", max: 120 },
    observaciones: { type: "string", max: 500 }
  });
  output.detalles = validateArray(body?.detalles, "detalles").map(detalle => validateFields(detalle, {
    piezaId: { type: "id" },
    cantidad: { type: "number", min: 0.01, default: 1 },
    descripcion: { type: "string", required: true, max: 500, message: "Descripcion requerida" },
    destino: { type: "string", max: 180 },
    material: { type: "string", max: 180 },
    unidadMedida: { type: "string", max: 40 },
    precio: { type: "number", min: 0 }
  }));
  return output;
}

function validateOrdenCompraBody(body) {
  const output = validateFields(body, {
    proveedorId: { type: "id", required: true, message: "Proveedor requerido" },
    moneda: { type: "string", max: 40, default: "Moneda Nacional" },
    observaciones: { type: "string", max: 500 },
    retencionIvaPct: { type: "number", min: 0, max: 100 },
    retencionIsrPct: { type: "number", min: 0, max: 100 }
  });
  output.detalles = validateArray(body?.detalles, "detalles").map(detalle => validateFields(detalle, {
    requisicionDetalleId: { type: "id" },
    requisicionFolio: { type: "id" },
    cantidad: { type: "number", min: 0.01, default: 1 },
    descripcion: { type: "string", required: true, max: 500, message: "Descripcion requerida" },
    destino: { type: "string", max: 180 },
    material: { type: "string", max: 180 },
    unidadMedida: { type: "string", max: 40 },
    precioUnitario: { type: "number", min: 0, default: 0 }
  }));
  return output;
}

function validateAlmacenArticuloBody(body) {
  return validateFields(body, {
    descripcion: { type: "string", required: true, max: 180, message: "Articulo requerido" },
    medida: { type: "string", max: 40 },
    existencia: { type: "number", min: 0, default: 0 },
    minimo: { type: "number", min: 0, default: 0 },
    maximo: { type: "number", min: 0, default: 0 },
    puntoReorden: { type: "number", min: 0, default: 0 },
    activo: { type: "boolean", default: true }
  });
}

function validateAlmacenMovimientoBody(body) {
  return validateFields(body, {
    articuloId: { type: "id", required: true, message: "Articulo requerido" },
    cantidad: { type: "number", min: 0.01, message: "Cantidad requerida" },
    precioUnitario: { type: "number", min: 0, default: 0 },
    referencia: { type: "string", max: 120 },
    observaciones: { type: "string", max: 500 }
  });
}

function validateRemisionBody(body) {
  return validateFields(body, {
    piezaId: { type: "id", required: true, message: "Pieza requerida" },
    cantidadEntregada: { type: "number", min: 0.01, message: "Cantidad requerida" },
    folio: { type: "string", max: 80 },
    observaciones: { type: "string", max: 500 },
    autorizacion: { type: "string", max: 120 },
    chofer: { type: "string", max: 120 }
  });
}

function validateFacturaBody(body) {
  return validateFields(body, {
    remisionId: { type: "id" },
    clienteId: { type: "id" },
    serie: { type: "string", max: 20 },
    folio: { type: "string", required: true, max: 80, message: "Folio de factura requerido" },
    subtotal: { type: "number", min: 0, default: 0 },
    iva: { type: "number", min: 0 },
    total: { type: "number", min: 0 },
    estatus: { type: "string", max: 80, default: "Pendiente" },
    uuid: { type: "string", max: 80 },
    observaciones: { type: "string", max: 500 }
  });
}

function validateArray(value, field) {
  if (!Array.isArray(value) || !value.length) throw httpError(400, `Agrega al menos un elemento en ${field}`);
  return value;
}

function validateIdArray(value, field) {
  return validateArray(value, field).map(Number).filter(Number.isInteger).filter(id => id > 0);
}

function requisicionLines(requisicion) {
  const width = 99;
  const separator = "-".repeat(width);
  const tableSeparator = "+------+------------------------------------+----------+------------------+--------------+--------+";
  const lines = [
    leftRightBox("TORNOS SA DE CV", "REQUISICION DE MATERIAL", "FECHA", formatPurchaseOrderDate(requisicion.fecha), width),
    rightText("Requisicion", requisicion.folio, width),
    "",
    `Solicitante: ${String(requisicion.solicitante || "-").toUpperCase()}`,
    `Autorizado por: ${requisicion.autorizacion || "-"}`,
    `Prioridad: ${requisicion.prioridad || "-"}`,
    separator,
    "REQUISICION DE MATERIAL",
    separator,
    tableSeparator,
    requisitionRow(["CANT", "DESCRIPCION", "MEDIDA", "DESTINO", "MATERIAL", "IDPIEZA"]),
    tableSeparator
  ];

  requisicion.detalles.forEach(detalle => {
    lines.push(requisitionRow([
      numberText(detalle.cantidad),
      detalle.descripcion || "-",
      detalle.unidadMedida || "-",
      detalle.destino || "-",
      detalle.material || "-",
      detalle.piezaId || "-"
    ]));
  });

  lines.push(tableSeparator);

  if (requisicion.observaciones) {
    lines.push("", `Observaciones: ${requisicion.observaciones}`);
  }

  return lines;
}

function centeredText(value, width) {
  const text = String(value ?? "");
  const leftPadding = Math.max(Math.floor((width - text.length) / 2), 0);
  return `${" ".repeat(leftPadding)}${text}`;
}

function leftRightBox(leftTitle, leftValue, rightTitle, rightValue, width) {
  const left = `${leftTitle}: ${leftValue || "-"}`;
  const right = `${rightTitle}: ${rightValue || "-"}`;
  const space = Math.max(width - left.length - right.length, 1);
  return `${left}${" ".repeat(space)}${right}`;
}

function rightText(label, value, width) {
  const text = `${label}: ${value || "-"}`;
  return text.padStart(width, " ");
}

function fieldColumns(leftLabel, leftValue, rightLabel, rightValue, width) {
  const left = `${leftLabel}: ${leftValue == null || leftValue === "" ? "-" : leftValue}`;
  const right = `${rightLabel}: ${rightValue == null || rightValue === "" ? "-" : rightValue}`;
  const space = Math.max(width - left.length - right.length, 2);
  return `${left}${" ".repeat(space)}${right}`;
}

function purchaseOrderRow(values) {
  const widths = [5, 7, 7, 27, 8, 6, 9, 9];
  return `|${values.map((value, index) => fitCell(value, widths[index], index === 0 || index >= 6 ? "right" : "left")).join("|")}|`;
}

function requisitionRow(values) {
  const widths = [6, 36, 10, 18, 14, 8];
  return `|${values.map((value, index) => fitCell(value, widths[index], index === 0 ? "right" : "left")).join("|")}|`;
}

function remisionRow(values) {
  const widths = [5, 8, 30, 12, 11, 11, 11];
  return `|${values.map((value, index) => fitCell(value, widths[index], index === 0 || index === 1 || index >= 4 ? "right" : "left")).join("|")}|`;
}

function fitCell(value, width, align = "left") {
  const text = String(value ?? "-").replace(/\s+/g, " ").trim();
  const output = text.length > width ? text.slice(0, Math.max(width - 1, 0)) + "." : text;
  return align === "right" ? output.padStart(width, " ") : output.padEnd(width, " ");
}

function totalLine(label, value, width) {
  const amount = money(value);
  const text = `${label}: ${amount}`;
  return text.padStart(width, " ");
}

function numberText(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : String(round2(number));
}

function formatPurchaseOrderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ordenCompraLines(orden) {
  const width = 100;
  const separator = "-".repeat(width);
  const tableSeparator = "+-----+-------+-------+---------------------------+--------+------+---------+---------+";
  const retenciones = Number(orden.retencionIva || 0) + Number(orden.retencionIsr || 0);
  const proveedorDireccion = [orden.proveedorDireccion, orden.proveedorCiudad].filter(Boolean).join(", ");
  const lines = [
    leftRightBox("FECHA", formatPurchaseOrderDate(orden.fecha), "FOLIO", orden.folio, width),
    centeredText("ORDEN DE COMPRA", width),
    ...(orden.cancelado ? [centeredText("CANCELADA", width)] : []),
    separator,
    centeredText("Datos del Proveedor", width),
    fieldColumns("Nombre", orden.proveedorNombre, "RFC", orden.proveedorRfc, width),
    fieldColumns("Direccion", proveedorDireccion || "-", "Contacto", orden.proveedorContacto || "-", width),
    fieldColumns("Ciudad", orden.proveedorCiudad || "-", "Tel", orden.proveedorTelefono || "-", width),
    fieldLine("Moneda", orden.moneda || "Moneda Nacional"),
    separator,
    tableSeparator,
    purchaseOrderRow(["CANT.", "REQ.", "MEDIDA", "DESCRIPCION", "MATERIAL", "PIEZA", "PRECIO", "SUBTOTAL"]),
    tableSeparator
  ];

  orden.detalles.forEach(detalle => {
    lines.push(purchaseOrderRow([
      numberText(detalle.cantidad),
      detalle.requisicionFolio || "-",
      detalle.unidadMedida || "-",
      detalle.descripcion || "-",
      detalle.material || "-",
      detalle.piezaId || "-",
      money(detalle.precioUnitario),
      money(detalle.subtotal)
    ]));
  });

  lines.push(
    tableSeparator,
    totalLine("SUBTOTAL", orden.subtotal, width),
    totalLine("IVA", orden.iva, width),
    ...(retenciones > 0 ? [totalLine("RETENCIONES", retenciones, width)] : []),
    totalLine("Total", orden.total, width)
  );

  if (orden.observaciones) {
    lines.push(separator, `Observaciones: ${orden.observaciones}`);
  }

  return lines;
}

function ordenTrabajoLines(orden, piezas) {
  return documentLines("ORDEN DE TRABAJO", orden.id, [
    ["Datos generales", [
      fieldLine("Cliente", orden.clienteNombre),
      fieldLine("Orden de compra", orden.ordenCompra),
      fieldLine("Fecha", orden.fecha),
      fieldLine("Fecha compromiso", orden.fechaCompromiso),
      fieldLine("Elaboro", orden.createdBy)
    ]],
    ["Piezas", piezas.map((pieza, index) =>
      `${index + 1}. ID ${pieza.id} | ${pieza.cantidad} pza | ${pieza.noParte || "Sin no. parte"} | ${pieza.noDibujo || "Sin dibujo"} | ${pieza.descripcion}`
    )],
    ["Observaciones", [orden.observaciones || "Sin observaciones"]],
    ["Firmas", ["Elaboro: ____________________", "Recibio produccion: ____________________"]]
  ]);
}

function piezaDocumentLines(pieza, notas, estimaciones) {
  return documentLines("FICHA DE PIEZA", pieza.id, [
    ["Datos de pieza", [
      fieldLine("Cliente", pieza.clienteNombre),
      fieldLine("Orden de compra", pieza.ordenCompra),
      fieldLine("Orden de trabajo", pieza.ordenTrabajoId || "Sin OT"),
      fieldLine("No. parte", pieza.noParte),
      fieldLine("No. dibujo", pieza.noDibujo),
      fieldLine("Descripcion", pieza.descripcion),
      fieldLine("Cantidad", pieza.cantidad),
      fieldLine("Entregada", pieza.cantidadEntregada),
      fieldLine("Estatus", pieza.estatus),
      fieldLine("Compromiso", pieza.fechaCompromiso),
      fieldLine("Material", pieza.material),
      fieldLine("Tratamiento", pieza.tratamiento),
      fieldLine("Archivo", pieza.archivo)
    ]],
    ["Estimaciones", estimaciones.length
      ? estimaciones.slice(0, 5).map(item => `${item.createdAt} | ${item.horasEstimadas} h | ${money(item.costoEstimado)} ${item.moneda} | ${item.descripcion}`)
      : ["Sin estimaciones registradas"]],
    ["Notas y estatus", notas.length
      ? notas.slice(0, 8).map(nota => `${nota.createdAt} | ${nota.estatus || "Sin estatus"} | ${nota.usuario}: ${nota.nota}`)
      : ["Sin notas registradas"]]
  ]);
}

function remisionLines(remision, pieza, notas) {
  const width = 105;
  const separator = "-".repeat(width);
  const tableSeparator = "+-----+--------+------------------------------+------------+-----------+-----------+-----------+";
  const pendiente = Math.max(0, Number(pieza.cantidad || 0) - Number(pieza.cantidadEntregada || 0));
  const precioUnitario = Number(pieza.precioMxn || pieza.precio || 0);
  const subtotal = round2(precioUnitario * Number(remision.cantidadEntregada || 0));
  const iva = round2(subtotal * IVA_RATE);
  const total = round2(subtotal + iva);
  const lines = [
    leftRightBox("TORNOS SA DE CV", "SISTEMA OPERATIVO TORNOS", "REMISION", remision.folio, width),
    fieldLine("Fecha", formatPurchaseOrderDate(remision.fecha)),
    separator,
    centeredText("REMISION", width),
    separator,
    fieldColumns("Cliente", remision.clienteNombre, "Fecha Requerimiento", pieza.fechaRequerimiento || "-", width),
    fieldColumns("Fecha Compromiso", pieza.fechaCompromiso || "-", "Orden de compra", pieza.ordenCompra || "-", width),
    fieldColumns("No de Parte", pieza.noParte || "-", "No de Dibujo", pieza.noDibujo || "-", width),
    fieldColumns("Cantidad", remision.cantidadEntregada, "Estatus", pieza.estatus || "-", width),
    fieldColumns("Material", pieza.material || "-", "Tratamiento", pieza.tratamiento || "-", width),
    fieldLine("Descripcion", pieza.descripcion || "-"),
    separator,
    tableSeparator,
    remisionRow(["Linea", "Cantidad", "Descripcion", "Dibujo", "Precio Unit.", "Sub-Total", "Pendiente"]),
    tableSeparator,
    remisionRow([
      1,
      numberText(remision.cantidadEntregada),
      pieza.descripcion || "-",
      pieza.noDibujo || pieza.noParte || "-",
      money(precioUnitario),
      money(subtotal),
      pendiente
    ]),
    tableSeparator
  ];

  lines.push(
    fieldColumns("Chofer", remision.chofer || "-", "Autorizacion", remision.autorizacion || "-", width),
    fieldColumns("Condiciones de pago", "Credito", "Sub-total", money(subtotal), width),
    rightText("I.V.A.", money(iva), width),
    rightText("Total", money(total), width)
  );

  if (pieza.archivo) lines.push(fieldLine("Archivo", pieza.archivo));

  if (notas.length) {
    lines.push(separator, "Notas recientes:");
    notas.slice(0, 5).forEach(nota => lines.push(`${nota.createdAt} | ${nota.estatus || "Sin estatus"} | ${nota.nota}`));
  }

  lines.push(
    separator,
    `Observaciones: ${remision.observaciones || "Sin observaciones"}`,
    "",
    "Entrego: ______________________________      Recibio: ______________________________",
    "",
    "Nombre y firma                                      Nombre y firma"
  );

  return lines;
}

function facturaLines(factura) {
  return documentLines("FACTURA ADMINISTRATIVA", factura.folio, [
    ["Datos generales", [
      fieldLine("Serie", factura.serie),
      fieldLine("Cliente", factura.clienteNombre),
      fieldLine("Remision", factura.remisionFolio),
      fieldLine("Fecha", factura.fecha),
      fieldLine("Estatus", factura.estatus),
      fieldLine("UUID", factura.uuid)
    ]],
    ["Totales", [
      fieldLine("Subtotal", money(factura.subtotal)),
      fieldLine("IVA", money(factura.iva)),
      fieldLine("Total", money(factura.total))
    ]],
    ["Observaciones", [factura.observaciones || "Sin observaciones"]]
  ]);
}

function documentLines(title, folio, sections) {
  const lines = [
    "TORNOS SA DE CV",
    title,
    `Folio: ${folio}`,
    `Generado: ${new Date().toLocaleString("es-MX")}`,
    dividerLine()
  ];
  for (const [sectionTitle, sectionLines] of sections) {
    lines.push(sectionTitle.toUpperCase());
    const cleanLines = sectionLines.filter(line => line != null && String(line).trim() !== "");
    lines.push(...(cleanLines.length ? cleanLines : ["Sin datos"]));
    lines.push(dividerLine());
  }
  return lines;
}

function fieldLine(label, value) {
  return `${label}: ${value == null || value === "" ? "-" : value}`;
}

function dividerLine() {
  return "------------------------------------------------------------";
}

function sendPdf(res, filename, lines, options = {}) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(simplePdf(lines, options));
}

function simplePdf(lines, options = {}) {
  const fontName = options.fontName || "Helvetica";
  const fontSize = options.fontSize || 10;
  const lineHeight = options.lineHeight || 16;
  const left = options.left || 48;
  const top = options.top || 760;
  const wrapWidth = options.wrapWidth || 92;
  const pageSize = options.pageSize || 43;
  const safeLines = lines.flatMap(line => wrapAscii(line, wrapWidth));
  const pages = [];
  for (let index = 0; index < Math.max(safeLines.length, 1); index += pageSize) {
    pages.push(safeLines.slice(index, index + pageSize));
  }
  const pageObjectNumbers = pages.map((_, index) => 3 + index);
  const fontObjectNumber = 3 + pages.length;
  const firstContentObjectNumber = fontObjectNumber + 1;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`
  ];
  pages.forEach((_, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${firstContentObjectNumber + index} 0 R >>`);
  });
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${fontName} >>`);
  pages.forEach(pageLines => {
    const stream = [
      "BT",
      `/F1 ${fontSize} Tf`,
      `${left} ${top} Td`,
      ...pageLines.map((line, index) => `${index ? `0 -${lineHeight} Td ` : ""}(${escapePdf(line)}) Tj`),
      "ET"
    ].join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream`);
  });
  let body = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(offset => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer << /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

function rtfDocument(lines) {
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\fs22 ${lines.map(line => `${rtfSafe(line)}\\par`).join("\n")}}`;
}

function securityHeaders(req, res, next) {
  const connectSources = ["'self'", ...config.allowedOrigins].join(" ");
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    `connect-src ${connectSources}`,
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; "));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (IS_PRODUCTION) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function corsHeaders(req, res, next) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
}

function assertLoginAllowed(req, username) {
  const key = loginKey(req, username);
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return;
  }
  if (entry.count >= config.loginRateLimitMax) {
    throw httpError(429, "Demasiados intentos de acceso. Intenta mas tarde.");
  }
}

function recordFailedLogin(req, username) {
  const key = loginKey(req, username);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + config.loginRateLimitWindowMs });
    cleanupLoginAttempts(now);
    return;
  }
  entry.count += 1;
}

function clearFailedLogin(req, username) {
  loginAttempts.delete(loginKey(req, username));
}

function cleanupLoginAttempts(now = Date.now()) {
  for (const [key, entry] of loginAttempts.entries()) {
    if (entry.resetAt <= now) loginAttempts.delete(key);
  }
}

function loginKey(req, username) {
  return `${req.ip || req.socket?.remoteAddress || "unknown"}:${String(username || "").toLowerCase()}`;
}

function authRequired(req, res, next) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ message: "Sesion no valida" });
  }
  req.token = token;
  req.user = session;
  next();
}

function requireReadAccess(...moduleIds) {
  return requireAnyReadAccess(...moduleIds);
}

function requireAnyReadAccess(...moduleIds) {
  const requirements = [...new Set([...moduleIds, "dashboard", "reportes"])]
    .filter(Boolean)
    .map(moduleId => ({ moduleId, actionKey: "canView" }));
  return requireAnyAccess(...requirements);
}

function requireAccess(moduleId, actionKey = "canView") {
  return requireAnyAccess({ moduleId, actionKey });
}

function requireAnyAccess(...requirements) {
  return (req, res, next) => {
    if (req.user?.roles?.includes("ADMIN")) return next();
    const allowed = requirements.some(({ moduleId, actionKey = "canView" }) => hasAccess(req.user, moduleId, actionKey));
    if (!allowed) {
      return res.status(403).json({ message: "No tienes permisos para esta accion" });
    }
    next();
  };
}

function hasAccess(user, moduleId, actionKey) {
  return Boolean(user?.access?.[moduleId]?.[actionKey]);
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function all(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

async function exec(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

async function count(sql, params = []) {
  const row = await one(sql, params);
  return Number(row?.total || 0);
}

async function userRoles(userId) {
  const rows = await all("SELECT role FROM user_roles WHERE user_id = ?", [userId]);
  return rows.map(row => row.role);
}

async function audit(username, action, detail) {
  try {
    await exec("INSERT INTO audit_events (username, action, detail) VALUES (?, ?, ?)", [username || "system", action, detail || null]);
  } catch {
    // Audit must not break operational flows.
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function required(value, message) {
  if (value == null || String(value).trim() === "") throw httpError(400, message);
  return String(value).trim();
}

function emptyToNull(value) {
  return value == null || String(value).trim() === "" ? null : String(value).trim();
}

function bool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "si", "yes", "on"].includes(String(value).toLowerCase());
}

function num(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateFields(body, schema) {
  const source = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const output = { ...source };
  for (const [field, rule] of Object.entries(schema)) {
    const raw = source[field];
    if (rule.required && (raw == null || String(raw).trim() === "")) {
      throw httpError(400, rule.message || `${field} requerido`);
    }
    if (raw == null || raw === "") {
      if ("default" in rule) output[field] = rule.default;
      continue;
    }
    if (rule.type === "string") {
      const value = String(raw).trim();
      if (rule.max && value.length > rule.max) throw httpError(400, `${field} no puede exceder ${rule.max} caracteres`);
      if (rule.pattern && !rule.pattern.test(value)) throw httpError(400, rule.patternMessage || `${field} no tiene formato valido`);
      output[field] = value;
    } else if (rule.type === "id") {
      const value = Number(raw);
      if (!Number.isInteger(value) || value <= 0) throw httpError(400, rule.message || `${field} debe ser un ID valido`);
      output[field] = value;
    } else if (rule.type === "number") {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw httpError(400, `${field} debe ser numerico`);
      if (rule.min != null && value < rule.min) throw httpError(400, `${field} debe ser mayor o igual a ${rule.min}`);
      if (rule.max != null && value > rule.max) throw httpError(400, `${field} debe ser menor o igual a ${rule.max}`);
      output[field] = value;
    } else if (rule.type === "boolean") {
      output[field] = bool(raw, Boolean(rule.default));
    } else if (rule.type === "date") {
      const value = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) {
        throw httpError(400, `${field} debe tener formato YYYY-MM-DD`);
      }
      output[field] = value;
    } else if (rule.type === "datetime") {
      const value = String(raw).trim();
      if (Number.isNaN(new Date(value).getTime())) throw httpError(400, `${field} debe ser fecha/hora valida`);
      output[field] = value;
    } else if (rule.type === "enum") {
      const value = String(raw).trim();
      if (!rule.values.includes(value)) throw httpError(400, `${field} debe ser uno de: ${rule.values.join(", ")}`);
      output[field] = value;
    }
  }
  return output;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function money(value) {
  return Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toMysqlDateTime(value) {
  return String(value || "").replace("T", " ").slice(0, 19);
}

function placeholders(items) {
  return items.map(() => "?").join(",");
}

function groupBy(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row[field]);
    const items = map.get(key) || [];
    items.push(row);
    map.set(key, items);
  }
  return map;
}

function versionSort(a, b) {
  const left = Number(a.match(/^V(\d+)/i)?.[1] || 0);
  const right = Number(b.match(/^V(\d+)/i)?.[1] || 0);
  return left - right || a.localeCompare(b);
}

function migrationVersion(file) {
  return file.match(/^V(\d+)__/i)?.[1] || null;
}

function safeUploadExtension(filename) {
  const extension = path.extname(String(filename || "")).toLowerCase();
  return UPLOAD_EXTENSIONS.has(extension) ? extension : "";
}

function parseSize(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(kb|mb|gb)?$/i);
  if (!match) return 25 * 1024 * 1024;
  const number = Number(match[1]);
  const unit = (match[2] || "b").toLowerCase();
  if (unit === "gb") return number * 1024 * 1024 * 1024;
  if (unit === "mb") return number * 1024 * 1024;
  if (unit === "kb") return number * 1024;
  return number;
}

function validateProductionConfig() {
  if (!IS_PRODUCTION) return;
  if (!config.db.ssl) {
    throw new Error("DB_SSL=true o DB_URL con useSSL=true es requerido en produccion.");
  }
  if (config.db.ssl.rejectUnauthorized === false) {
    throw new Error("DB_SSL_REJECT_UNAUTHORIZED=false no esta permitido en produccion.");
  }
  if (!config.allowedOrigins.length) {
    throw new Error("APP_ALLOWED_ORIGINS debe definirse en produccion.");
  }
}

function wrapAscii(value, width) {
  const text = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
  if (text.length <= width) return [text];
  const lines = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines;
}

function escapePdf(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function rtfSafe(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\\{}]/g, "");
}
