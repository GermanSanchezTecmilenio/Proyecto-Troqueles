CREATE TABLE proveedores (
  id BIGINT NOT NULL AUTO_INCREMENT,
  nombre_proveedor VARCHAR(160) NOT NULL,
  razon_social VARCHAR(180) NULL,
  rfc VARCHAR(20) NULL,
  calle VARCHAR(200) NULL,
  colonia VARCHAR(120) NULL,
  municipio VARCHAR(120) NULL,
  estado VARCHAR(120) NULL,
  cp VARCHAR(12) NULL,
  telefono VARCHAR(40) NULL,
  contacto VARCHAR(140) NULL,
  correo VARCHAR(160) NULL,
  condiciones_pago VARCHAR(120) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  KEY ix_proveedores_nombre (nombre_proveedor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ordenes_compra (
  id BIGINT NOT NULL AUTO_INCREMENT,
  folio VARCHAR(40) NOT NULL,
  proveedor_id BIGINT NOT NULL,
  fecha DATETIME(6) NOT NULL,
  moneda VARCHAR(40) NOT NULL,
  observaciones VARCHAR(500) NULL,
  created_by VARCHAR(80) NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  iva DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  cancelado BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uk_oc_folio (folio),
  KEY ix_oc_proveedor_fecha (proveedor_id, fecha),
  CONSTRAINT fk_oc_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orden_compra_detalles (
  id BIGINT NOT NULL AUTO_INCREMENT,
  orden_compra_id BIGINT NOT NULL,
  requisicion_detalle_id BIGINT NULL,
  requisicion_folio BIGINT NULL,
  cantidad DECIMAL(14,3) NOT NULL,
  descripcion VARCHAR(250) NOT NULL,
  destino VARCHAR(180) NULL,
  material VARCHAR(180) NULL,
  unidad_medida VARCHAR(80) NULL,
  precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_oc_det_orden (orden_compra_id),
  KEY ix_oc_det_req (requisicion_detalle_id),
  CONSTRAINT fk_oc_det_orden FOREIGN KEY (orden_compra_id) REFERENCES ordenes_compra (id),
  CONSTRAINT fk_oc_det_req FOREIGN KEY (requisicion_detalle_id) REFERENCES requisicion_detalles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE pieza_notas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  pieza_id BIGINT NOT NULL,
  estatus_id BIGINT NULL,
  nota VARCHAR(600) NOT NULL,
  usuario VARCHAR(80) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_pieza_notas_pieza_fecha (pieza_id, created_at),
  CONSTRAINT fk_pieza_notas_pieza FOREIGN KEY (pieza_id) REFERENCES piezas (id),
  CONSTRAINT fk_pieza_notas_estatus FOREIGN KEY (estatus_id) REFERENCES estatus_produccion (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO proveedores (nombre_proveedor, razon_social, rfc, municipio, estado, telefono, contacto, condiciones_pago, activo) VALUES
  ('Proveedor demo metales', 'Proveedor Demo Metales SA de CV', 'XAXX010101000', 'Monterrey', 'NL', '8180000000', 'Compras demo', 'Credito 30 dias', true),
  ('Proveedor demo herramientas', 'Proveedor Demo Herramientas SA de CV', 'XEXX010101000', 'Apodaca', 'NL', '8181111111', 'Ventas demo', 'Contado', true);

INSERT INTO requisiciones (solicitante, fecha, prioridad, usuario_solicitante, autorizacion, observaciones, surtido, enviada_a_compras, cancelado) VALUES
  ('Supervisor demo', CURRENT_TIMESTAMP(6), 'Normal', 'admin', 'Compras demo', 'Material demo para generar orden de compra', false, false, false);

SET @demo_requisicion_folio = LAST_INSERT_ID();

INSERT INTO requisicion_detalles (requisicion_folio, cantidad, descripcion, destino, material, unidad_medida, precio) VALUES
  (@demo_requisicion_folio, 2.000, 'Barra acero 1018 1 x 24', 'Almacen', 'Acero 1018', 'pieza', 650.00),
  (@demo_requisicion_folio, 1.000, 'Inserto de corte demo', 'Taller', 'Carburo', 'pieza', 380.00);
