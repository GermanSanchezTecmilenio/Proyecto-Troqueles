import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const publicDir = path.join(__dirname, "public");
const migrationsDir = path.join(__dirname, "db", "migrations");
const uploadsDir = path.join(__dirname, "uploads", "dibujos");
const GODMISA_INTERNAL_PIEZA_ID = 2460;
const IVA_RATE = 0.16;

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
  allowedOrigins: (process.env.APP_ALLOWED_ORIGINS || "").split(",").map(item => item.trim()).filter(Boolean),
  db: parseDbConfig()
};

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
      const safeName = path.basename(file.originalname || "dibujo").replace(/[^A-Za-z0-9._-]/g, "_");
      cb(null, `${crypto.randomUUID()}_${safeName || "dibujo"}`);
    }
  }),
  limits: {
    fileSize: parseSize(process.env.APP_UPLOAD_MAX_FILE_SIZE || "25MB")
  }
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(corsHeaders);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(publicDir));

app.get("/api/health", (req, res) => res.json({ status: "UP", database: "mysql" }));
app.get("/actuator/health", (req, res) => res.json({ status: "UP" }));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = await one(
    "SELECT u.id, u.username, u.password_hash AS passwordHash, u.display_name AS displayName, u.active FROM users u WHERE LOWER(u.username) = LOWER(?)",
    [username]
  );
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    throw httpError(401, "Usuario o password incorrectos");
  }
  const roles = await userRoles(user.id);
  const token = crypto.randomBytes(Number(process.env.APP_TOKEN_RANDOM_BYTES || 48)).toString("base64url");
  sessions.set(token, {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roles,
    expiresAt: Date.now() + config.tokenTtlMinutes * 60 * 1000
  });
  await audit(user.username, "LOGIN", "Sesion iniciada");
  res.json({ token, id: user.id, username: user.username, displayName: user.displayName, roles });
}));

app.use("/api", authRequired);

app.get("/api/auth/me", asyncHandler(async (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, roles: req.user.roles });
}));

app.post("/api/auth/logout", asyncHandler(async (req, res) => {
  sessions.delete(req.token);
  res.status(204).end();
}));

app.get("/api/clientes", asyncHandler(async (req, res) => {
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

app.post("/api/clientes", asyncHandler(async (req, res) => {
  const body = req.body;
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

app.put("/api/clientes/:id", asyncHandler(async (req, res) => {
  const body = req.body;
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

app.get("/api/proveedores", asyncHandler(async (req, res) => {
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

app.post("/api/proveedores", asyncHandler(async (req, res) => {
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

app.put("/api/proveedores/:id", asyncHandler(async (req, res) => {
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

app.get("/api/operadores", asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT id, nombre_operador AS nombreOperador, turno, activo, supervisor, chofer
       FROM operadores WHERE activo = TRUE ORDER BY nombre_operador ASC`
  );
  res.json(rows.map(row => ({ ...row, activo: Boolean(row.activo), supervisor: Boolean(row.supervisor), chofer: Boolean(row.chofer) })));
}));

app.post("/api/operadores", asyncHandler(async (req, res) => {
  const result = await exec(
    "INSERT INTO operadores (nombre_operador, turno, activo, supervisor, chofer) VALUES (?, ?, ?, ?, ?)",
    operadorParams(req.body)
  );
  await audit(req.user.username, "OPERADOR_CREADO", `Operador ${result.insertId}`);
  res.status(201).json(await getOperador(result.insertId));
}));

app.put("/api/operadores/:id", asyncHandler(async (req, res) => {
  await exec(
    "UPDATE operadores SET nombre_operador = ?, turno = ?, activo = ?, supervisor = ?, chofer = ? WHERE id = ?",
    [...operadorParams(req.body), req.params.id]
  );
  await audit(req.user.username, "OPERADOR_ACTUALIZADO", `Operador ${req.params.id}`);
  res.json(await getOperador(req.params.id));
}));

app.get("/api/estatus-produccion", asyncHandler(async (req, res) => {
  const rows = await all("SELECT id, descripcion, grupo FROM estatus_produccion ORDER BY descripcion ASC");
  res.json(rows);
}));

app.get("/api/piezas", asyncHandler(async (req, res) => {
  res.json(await listPiezas());
}));

app.post("/api/piezas", asyncHandler(async (req, res) => {
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

app.post("/api/piezas/dibujos", upload.single("archivo"), asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, "Selecciona un dibujo para importar");
  res.status(201).json({
    archivo: `uploads/dibujos/${req.file.filename}`,
    nombreOriginal: req.file.originalname
  });
}));

app.put("/api/piezas/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const body = normalizePieza(req.body);
  if (id === GODMISA_INTERNAL_PIEZA_ID) {
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

app.put("/api/piezas/:id/estatus", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const estatusId = Number(req.body.estatusId);
  const estatus = await one("SELECT id, descripcion FROM estatus_produccion WHERE id = ?", [estatusId]);
  if (!estatus) throw httpError(404, "Estatus no encontrado");
  const pieza = await getPieza(id);
  const delivered = id !== GODMISA_INTERNAL_PIEZA_ID && String(estatus.descripcion).toLowerCase() === "entregado";
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

app.get("/api/piezas/:id/notas", asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT n.id, n.pieza_id AS piezaId, n.estatus_id AS estatusId, e.descripcion AS estatus, n.nota, n.usuario,
            DATE_FORMAT(n.created_at, '%Y-%m-%dT%H:%i:%s') AS createdAt
       FROM pieza_notas n
       LEFT JOIN estatus_produccion e ON e.id = n.estatus_id
      WHERE n.pieza_id = ?
      ORDER BY n.created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
}));

app.post("/api/piezas/:id/notas", asyncHandler(async (req, res) => {
  const pieza = await getPieza(req.params.id);
  const saved = await addPiezaNota(pieza.id, req.body.estatusId || pieza.estatusId, req.body.nota, req.user.username);
  res.status(201).json(saved);
}));

app.get("/api/ordenes-trabajo", asyncHandler(async (req, res) => {
  res.json(await listOrdenesTrabajo());
}));

app.post("/api/ordenes-trabajo", asyncHandler(async (req, res) => {
  const body = req.body;
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

app.get("/api/monitor-produccion", asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT p.id AS piezaId, p.orden_trabajo_id AS ordenTrabajoId, c.nombre_cliente AS cliente, p.orden_compra AS ordenCompra,
            p.no_parte AS noParte, p.no_dibujo AS noDibujo, p.descripcion, p.cantidad, p.cantidad_entregada AS cantidadEntregada,
            DATE_FORMAT(p.fecha_compromiso, '%Y-%m-%d') AS fechaCompromiso, e.descripcion AS estatus,
            DATEDIFF(p.fecha_compromiso, CURRENT_DATE()) AS diasCompromiso, p.precio,
            p.fecha_compromiso < CURRENT_DATE() AS vencida
       FROM piezas p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN estatus_produccion e ON e.id = p.estatus_id
      WHERE p.entregado = FALSE
      ORDER BY p.fecha_compromiso ASC`
  );
  res.json(rows.map(row => ({ ...row, vencida: Boolean(row.vencida) })));
}));

app.get("/api/tiempos", asyncHandler(async (req, res) => {
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
      LIMIT 25`
  );
  res.json(rows);
}));

app.post("/api/tiempos", asyncHandler(async (req, res) => {
  const inicio = toMysqlDateTime(req.body.inicio);
  const fin = toMysqlDateTime(req.body.fin);
  const minutos = Math.round((new Date(req.body.fin).getTime() - new Date(req.body.inicio).getTime()) / 60000);
  if (!Number.isFinite(minutos) || minutos <= 0) throw httpError(400, "La hora fin debe ser posterior al inicio");
  const result = await exec(
    `INSERT INTO tiempos_produccion (pieza_id, operador_id, estatus_id, descripcion_operacion, inicio_operacion, fin_operacion, minutos)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.body.piezaId, req.body.operadorId, req.body.estatusId, required(req.body.descripcionOperacion, "Operacion requerida"), inicio, fin, minutos]
  );
  await exec("UPDATE piezas SET estatus_id = ? WHERE id = ?", [req.body.estatusId, req.body.piezaId]);
  await audit(req.user.username, "TIEMPO_CAPTURADO", `Tiempo ${result.insertId}`);
  res.status(201).json((await all("SELECT * FROM tiempos_produccion WHERE id = ?", [result.insertId]))[0]);
}));

app.get("/api/dashboard", asyncHandler(async (req, res) => {
  const [pendientes, vencidas, ordenes, requisiciones, reorden] = await Promise.all([
    count("SELECT COUNT(*) AS total FROM piezas WHERE entregado = FALSE"),
    count("SELECT COUNT(*) AS total FROM piezas WHERE entregado = FALSE AND fecha_compromiso < CURRENT_DATE()"),
    count("SELECT COUNT(*) AS total FROM ordenes_trabajo WHERE cancelado = FALSE"),
    count("SELECT COUNT(*) AS total FROM requisiciones WHERE cancelado = FALSE AND surtido = FALSE"),
    count("SELECT COUNT(*) AS total FROM almacen_articulos WHERE activo = TRUE AND existencia <= punto_reorden")
  ]);
  res.json({ piezasPendientes: pendientes, piezasVencidas: vencidas, ordenesTrabajo: ordenes, requisicionesPendientes: requisiciones, articulosReorden: reorden });
}));

app.get("/api/requisiciones", asyncHandler(async (req, res) => {
  res.json(await listRequisiciones());
}));

app.get("/api/requisiciones/material-opciones", asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT id, material, descripcion, unidad_medida AS unidadMedida
       FROM requisicion_material_opciones
      WHERE activo = TRUE
      ORDER BY material ASC, descripcion ASC`
  );
  res.json(rows);
}));

app.post("/api/requisiciones", asyncHandler(async (req, res) => {
  const detalles = Array.isArray(req.body.detalles) ? req.body.detalles : [];
  if (!detalles.length) throw httpError(400, "Agrega al menos una partida");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO requisiciones (solicitante, fecha, prioridad, usuario_solicitante, autorizacion, observaciones, surtido, enviada_a_compras, cancelado)
       VALUES (?, NOW(6), ?, ?, ?, ?, FALSE, FALSE, FALSE)`,
      [
        required(req.body.solicitante, "Solicitante requerido"),
        req.body.prioridad || "Normal",
        req.user.username,
        emptyToNull(req.body.autorizacion),
        emptyToNull(req.body.observaciones)
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

app.get("/api/requisiciones/:folio/pdf", asyncHandler(async (req, res) => {
  const requisicion = (await listRequisiciones()).find(item => Number(item.folio) === Number(req.params.folio));
  if (!requisicion) throw httpError(404, "Requisicion no encontrada");
  sendPdf(res, `requisicion-${requisicion.folio}.pdf`, [
    `REQUISICION ${requisicion.folio}`,
    `Solicitante: ${requisicion.solicitante}`,
    `Prioridad: ${requisicion.prioridad}`,
    `Fecha: ${requisicion.fecha}`,
    "",
    ...requisicion.detalles.map(d => `${d.cantidad} ${d.unidadMedida || ""} - ${d.descripcion} - ${d.destino || ""}`)
  ]);
}));

app.get("/api/ordenes-compra", asyncHandler(async (req, res) => {
  res.json(await listOrdenesCompra());
}));

app.post("/api/ordenes-compra", asyncHandler(async (req, res) => {
  const detalles = Array.isArray(req.body.detalles) ? req.body.detalles : [];
  if (!detalles.length) throw httpError(400, "Selecciona al menos una partida");
  const proveedor = await getProveedor(req.body.proveedorId);
  const retencionIvaPct = num(req.body.retencionIvaPct ?? proveedor.retencionIvaPct, 0);
  const retencionIsrPct = num(req.body.retencionIsrPct ?? proveedor.retencionIsrPct, 0);
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
      [folio, req.body.proveedorId, req.body.moneda || "Moneda Nacional", emptyToNull(req.body.observaciones), req.user.username, subtotal, iva, retencionIvaPct, retencionIsrPct, retencionIva, retencionIsr, total]
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

app.get("/api/ordenes-compra/:id/pdf", asyncHandler(async (req, res) => {
  const orden = (await listOrdenesCompra()).find(item => Number(item.id) === Number(req.params.id));
  if (!orden) throw httpError(404, "Orden de compra no encontrada");
  sendPdf(res, `${orden.folio}.pdf`, ordenCompraLines(orden));
}));

app.get("/api/ordenes-compra/:id/word", asyncHandler(async (req, res) => {
  const orden = (await listOrdenesCompra()).find(item => Number(item.id) === Number(req.params.id));
  if (!orden) throw httpError(404, "Orden de compra no encontrada");
  res.setHeader("Content-Type", "application/rtf");
  res.setHeader("Content-Disposition", `attachment; filename="${orden.folio}.rtf"`);
  res.send(Buffer.from(rtfDocument(ordenCompraLines(orden)), "utf8"));
}));

app.get("/api/almacen/articulos", asyncHandler(async (req, res) => {
  const rows = await all(
    `SELECT id, descripcion, medida, existencia, minimo, maximo, punto_reorden AS puntoReorden, activo
       FROM almacen_articulos
      WHERE activo = TRUE
      ORDER BY descripcion ASC`
  );
  res.json(rows.map(row => ({ ...row, activo: Boolean(row.activo) })));
}));

app.post("/api/almacen/articulos", asyncHandler(async (req, res) => {
  const result = await exec(
    `INSERT INTO almacen_articulos (descripcion, medida, existencia, minimo, maximo, punto_reorden, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [required(req.body.descripcion, "Articulo requerido"), emptyToNull(req.body.medida), num(req.body.existencia, 0), num(req.body.minimo, 0), num(req.body.maximo, 0), num(req.body.puntoReorden, 0), bool(req.body.activo, true)]
  );
  await audit(req.user.username, "ARTICULO_CREADO", `Articulo ${result.insertId}`);
  res.status(201).json((await all("SELECT id, descripcion, medida, existencia, minimo, maximo, punto_reorden AS puntoReorden, activo FROM almacen_articulos WHERE id = ?", [result.insertId]))[0]);
}));

app.get("/api/almacen/kardex", asyncHandler(async (req, res) => {
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

app.post("/api/almacen/entradas", asyncHandler(async (req, res) => {
  res.status(201).json(await almacenMovimiento(req, "ENTRADA"));
}));

app.post("/api/almacen/salidas", asyncHandler(async (req, res) => {
  res.status(201).json(await almacenMovimiento(req, "SALIDA"));
}));

app.get("/api/remisiones", asyncHandler(async (req, res) => {
  res.json(await listRemisiones());
}));

app.post("/api/remisiones", asyncHandler(async (req, res) => {
  const piezaId = Number(req.body.piezaId);
  const cantidadEntregada = num(req.body.cantidadEntregada, 0);
  if (piezaId === GODMISA_INTERNAL_PIEZA_ID) throw httpError(400, "La pieza 2460 es interna de GODMISA");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[pieza]] = await conn.query("SELECT id, cliente_id AS clienteId, cantidad, cantidad_entregada AS cantidadEntregada FROM piezas WHERE id = ?", [piezaId]);
    if (!pieza) throw httpError(404, "Pieza no encontrada");
    const nuevaCantidad = Number(pieza.cantidadEntregada) + cantidadEntregada;
    if (nuevaCantidad > Number(pieza.cantidad)) throw httpError(400, "La remision excede la cantidad de la pieza");
    const folio = req.body.folio || `REM-${Date.now()}`;
    const [result] = await conn.query(
      `INSERT INTO remisiones (pieza_id, cliente_id, folio, fecha, cantidad_entregada, observaciones, autorizacion, chofer, activo)
       VALUES (?, ?, ?, NOW(6), ?, ?, ?, ?, TRUE)`,
      [piezaId, pieza.clienteId, folio, cantidadEntregada, emptyToNull(req.body.observaciones), emptyToNull(req.body.autorizacion), emptyToNull(req.body.chofer)]
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

app.get("/api/remisiones/:id/pdf", asyncHandler(async (req, res) => {
  const remision = (await listRemisiones()).find(item => Number(item.id) === Number(req.params.id));
  if (!remision) throw httpError(404, "Remision no encontrada");
  sendPdf(res, `${remision.folio}.pdf`, [
    `REMISION ${remision.folio}`,
    `Cliente: ${remision.clienteNombre}`,
    `Pieza: ${remision.piezaId}`,
    `Cantidad entregada: ${remision.cantidadEntregada}`,
    `Fecha: ${remision.fecha}`,
    `Chofer: ${remision.chofer || ""}`,
    `Autorizacion: ${remision.autorizacion || ""}`,
    "",
    remision.observaciones || ""
  ]);
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
  await ensureDatabase();
  pool = await mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    multipleStatements: true,
    dateStrings: true
  });
  await migrate();
  await bootstrapAdmin();
  app.listen(config.port, () => {
    console.log(`zSistema Node escuchando en http://localhost:${config.port}`);
  });
}

function parseDbConfig() {
  const jdbc = process.env.DB_URL || "";
  if (jdbc) {
    const url = new URL(jdbc.replace(/^jdbc:/, ""));
    return {
      host: url.hostname || "localhost",
      port: Number(url.port || 3306),
      database: url.pathname.replace(/^\//, "") || "Godmisa",
      user: process.env.DB_USER || url.username || "zsistema_app",
      password: process.env.DB_PASSWORD || url.password || "",
      charset: "utf8mb4",
      ssl: url.searchParams.get("useSSL") === "true" ? { rejectUnauthorized: false } : undefined
    };
  }
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "Godmisa",
    user: process.env.DB_USER || "zsistema_app",
    password: process.env.DB_PASSWORD || "",
    charset: "utf8mb4",
    ssl: String(process.env.DB_SSL || "false").toLowerCase() === "true" ? { rejectUnauthorized: false } : undefined
  };
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
  const files = (await fs.readdir(migrationsDir)).filter(file => /^V\d+__.+\.sql$/i.test(file)).sort(versionSort);

  for (const file of files) {
    if (applied.has(file)) continue;
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
      "INSERT INTO users (username, password_hash, display_name, active) VALUES (?, ?, ?, TRUE)",
      [config.adminUsername, hash, config.adminDisplayName]
    );
    await exec("INSERT INTO user_roles (user_id, role) VALUES (?, 'ADMIN'), (?, 'OPERADOR')", [result.insertId, result.insertId]);
    return;
  }
  if (config.adminResetPassword) {
    const hash = await bcrypt.hash(config.adminPassword, config.bcryptStrength);
    await exec("UPDATE users SET password_hash = ?, display_name = ?, active = TRUE WHERE id = ?", [hash, config.adminDisplayName, existing.id]);
  }
  await exec("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'ADMIN'), (?, 'OPERADOR')", [existing.id, existing.id]);
}

async function listPiezas() {
  const rows = await all(
    `SELECT p.id, p.cliente_id AS clienteId, c.nombre_cliente AS clienteNombre, p.estatus_id AS estatusId,
            e.descripcion AS estatus, p.orden_trabajo_id AS ordenTrabajoId, p.orden_compra AS ordenCompra,
            p.descripcion, p.cantidad, p.cantidad_entregada AS cantidadEntregada,
            DATE_FORMAT(p.fecha_requerimiento, '%Y-%m-%d') AS fechaRequerimiento,
            DATE_FORMAT(p.fecha_compromiso, '%Y-%m-%d') AS fechaCompromiso,
            p.entregado, p.archivo, p.no_dibujo AS noDibujo, p.no_parte AS noParte, p.precio,
            p.moneda_precio AS monedaPrecio, p.tipo_cambio_usd_mxn AS tipoCambioUsdMxn, p.material, p.tratamiento
       FROM piezas p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN estatus_produccion e ON e.id = p.estatus_id
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
    precio,
    tipoCambioUsdMxn: tipoCambio,
    precioMxn: moneda === "USD" ? round2(precio * tipoCambio) : round2(precio)
  };
}

function normalizePieza(body) {
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
            p.contacto AS proveedorContacto, DATE_FORMAT(oc.fecha, '%Y-%m-%dT%H:%i:%s') AS fecha, oc.moneda,
            oc.observaciones, oc.created_by AS createdBy, oc.subtotal, oc.iva, oc.retencion_iva_pct AS retencionIvaPct,
            oc.retencion_isr_pct AS retencionIsrPct, oc.retencion_iva AS retencionIva, oc.retencion_isr AS retencionIsr,
            oc.total, oc.cancelado
       FROM ordenes_compra oc
       JOIN proveedores p ON p.id = oc.proveedor_id
      ORDER BY oc.fecha DESC`
  );
  const detalles = await all(
    `SELECT id, orden_compra_id AS ordenCompraId, requisicion_detalle_id AS requisicionDetalleId,
            requisicion_folio AS requisicionFolio, cantidad, descripcion, destino, material, unidad_medida AS unidadMedida,
            precio_unitario AS precioUnitario, subtotal
       FROM orden_compra_detalles
      ORDER BY id ASC`
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

async function almacenMovimiento(req, tipo) {
  const articuloId = Number(req.body.articuloId);
  const cantidad = num(req.body.cantidad, 0);
  const precioUnitario = num(req.body.precioUnitario, 0);
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
      [articuloId, tipo, cantidad, precioUnitario, total, emptyToNull(req.body.referencia), req.user.username, emptyToNull(req.body.observaciones)]
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

function proveedorParams(body) {
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
  return [
    required(body.nombreOperador, "Nombre de operador requerido"),
    num(body.turno, 0),
    bool(body.activo, true),
    bool(body.supervisor, false),
    bool(body.chofer, false)
  ];
}

function ordenCompraLines(orden) {
  return [
    `ORDEN DE COMPRA ${orden.folio}`,
    `Proveedor: ${orden.proveedorNombre}`,
    `RFC: ${orden.proveedorRfc || ""}`,
    `Fecha: ${orden.fecha}`,
    `Moneda: ${orden.moneda}`,
    "",
    ...orden.detalles.map(d => `${d.cantidad} ${d.unidadMedida || ""} - ${d.descripcion} - ${money(d.precioUnitario)} = ${money(d.subtotal)}`),
    "",
    `Subtotal: ${money(orden.subtotal)}`,
    `IVA: ${money(orden.iva)}`,
    `Retenciones: ${money(Number(orden.retencionIva || 0) + Number(orden.retencionIsr || 0))}`,
    `Total: ${money(orden.total)}`,
    "",
    orden.observaciones || ""
  ];
}

function sendPdf(res, filename, lines) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(simplePdf(lines));
}

function simplePdf(lines) {
  const safeLines = lines.flatMap(line => wrapAscii(line, 92));
  const stream = [
    "BT",
    "/F1 10 Tf",
    "48 760 Td",
    ...safeLines.map((line, index) => `${index ? "0 -16 Td " : ""}(${escapePdf(line)}) Tj`),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream`
  ];
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
