CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(120) NOT NULL,
  display_name VARCHAR(140) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_roles (
  user_id BIGINT NOT NULL,
  role VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id, role),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  detail VARCHAR(600) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_audit_created_at (created_at),
  KEY ix_audit_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE clientes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  nombre_cliente VARCHAR(140) NOT NULL,
  calle VARCHAR(200) NULL,
  colonia VARCHAR(120) NULL,
  municipio VARCHAR(120) NULL,
  estado VARCHAR(120) NULL,
  rfc VARCHAR(20) NULL,
  cp VARCHAR(12) NULL,
  razon_social VARCHAR(160) NULL,
  formato_factura BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  KEY ix_clientes_nombre (nombre_cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE operadores (
  id BIGINT NOT NULL AUTO_INCREMENT,
  nombre_operador VARCHAR(120) NOT NULL,
  turno INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  supervisor BOOLEAN NOT NULL DEFAULT FALSE,
  chofer BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY ix_operadores_nombre (nombre_operador)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE estatus_produccion (
  id BIGINT NOT NULL AUTO_INCREMENT,
  descripcion VARCHAR(80) NOT NULL,
  grupo VARCHAR(80) NOT NULL,
  hr_semanal INT NOT NULL DEFAULT 0,
  maquinas INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_estatus_grupo (grupo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ordenes_trabajo (
  id BIGINT NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT NOT NULL,
  orden_compra VARCHAR(80) NOT NULL,
  fecha DATETIME(6) NOT NULL,
  fecha_compromiso DATE NOT NULL,
  observaciones VARCHAR(500) NULL,
  created_by VARCHAR(80) NOT NULL,
  cancelado BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY ix_ot_cliente (cliente_id),
  KEY ix_ot_fecha (fecha),
  CONSTRAINT fk_ot_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE piezas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT NOT NULL,
  orden_trabajo_id BIGINT NULL,
  estatus_id BIGINT NOT NULL,
  orden_compra VARCHAR(80) NOT NULL,
  descripcion VARCHAR(180) NOT NULL,
  cantidad INT NOT NULL,
  cantidad_entregada INT NOT NULL DEFAULT 0,
  fecha_requerimiento DATE NOT NULL,
  fecha_compromiso DATE NOT NULL,
  entregado BOOLEAN NOT NULL DEFAULT FALSE,
  archivo VARCHAR(255) NULL,
  no_dibujo VARCHAR(80) NULL,
  no_parte VARCHAR(80) NULL,
  precio DECIMAL(14,2) NOT NULL DEFAULT 0,
  material VARCHAR(180) NULL,
  tratamiento VARCHAR(120) NULL,
  PRIMARY KEY (id),
  KEY ix_piezas_cliente (cliente_id),
  KEY ix_piezas_estatus (estatus_id),
  KEY ix_piezas_ot (orden_trabajo_id),
  KEY ix_piezas_compromiso (fecha_compromiso),
  CONSTRAINT fk_piezas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
  CONSTRAINT fk_piezas_estatus FOREIGN KEY (estatus_id) REFERENCES estatus_produccion (id),
  CONSTRAINT fk_piezas_ot FOREIGN KEY (orden_trabajo_id) REFERENCES ordenes_trabajo (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tiempos_produccion (
  id BIGINT NOT NULL AUTO_INCREMENT,
  pieza_id BIGINT NOT NULL,
  operador_id BIGINT NOT NULL,
  estatus_id BIGINT NOT NULL,
  descripcion_operacion VARCHAR(180) NOT NULL,
  inicio_operacion DATETIME(6) NOT NULL,
  fin_operacion DATETIME(6) NOT NULL,
  minutos BIGINT NOT NULL,
  PRIMARY KEY (id),
  KEY ix_tiempos_pieza (pieza_id),
  KEY ix_tiempos_operador (operador_id),
  CONSTRAINT fk_tiempos_pieza FOREIGN KEY (pieza_id) REFERENCES piezas (id),
  CONSTRAINT fk_tiempos_operador FOREIGN KEY (operador_id) REFERENCES operadores (id),
  CONSTRAINT fk_tiempos_estatus FOREIGN KEY (estatus_id) REFERENCES estatus_produccion (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE requisiciones (
  folio BIGINT NOT NULL AUTO_INCREMENT,
  solicitante VARCHAR(140) NOT NULL,
  fecha DATETIME(6) NOT NULL,
  prioridad VARCHAR(40) NOT NULL,
  usuario_solicitante VARCHAR(80) NOT NULL,
  autorizacion VARCHAR(140) NULL,
  observaciones VARCHAR(500) NULL,
  surtido BOOLEAN NOT NULL DEFAULT FALSE,
  enviada_a_compras BOOLEAN NOT NULL DEFAULT FALSE,
  cancelado BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (folio),
  KEY ix_requisiciones_fecha (fecha),
  KEY ix_requisiciones_prioridad (prioridad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE requisicion_detalles (
  id BIGINT NOT NULL AUTO_INCREMENT,
  requisicion_folio BIGINT NOT NULL,
  cantidad DECIMAL(14,3) NOT NULL,
  descripcion VARCHAR(250) NOT NULL,
  destino VARCHAR(180) NULL,
  material VARCHAR(180) NULL,
  unidad_medida VARCHAR(80) NULL,
  precio DECIMAL(14,2) NULL,
  PRIMARY KEY (id),
  KEY ix_req_det_folio (requisicion_folio),
  CONSTRAINT fk_req_det_requisicion FOREIGN KEY (requisicion_folio) REFERENCES requisiciones (folio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE almacen_articulos (
  id BIGINT NOT NULL AUTO_INCREMENT,
  descripcion VARCHAR(250) NOT NULL,
  medida VARCHAR(80) NULL,
  existencia DECIMAL(14,3) NOT NULL DEFAULT 0,
  minimo INT NOT NULL DEFAULT 0,
  maximo INT NOT NULL DEFAULT 0,
  punto_reorden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  KEY ix_articulos_descripcion (descripcion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE kardex_movimientos (
  id BIGINT NOT NULL AUTO_INCREMENT,
  articulo_id BIGINT NOT NULL,
  fecha DATETIME(6) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  cantidad DECIMAL(14,3) NOT NULL,
  precio_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  referencia VARCHAR(120) NULL,
  usuario_sistema VARCHAR(80) NOT NULL,
  observaciones VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY ix_kardex_articulo_fecha (articulo_id, fecha),
  CONSTRAINT fk_kardex_articulo FOREIGN KEY (articulo_id) REFERENCES almacen_articulos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE remisiones (
  id BIGINT NOT NULL AUTO_INCREMENT,
  pieza_id BIGINT NOT NULL,
  cliente_id BIGINT NOT NULL,
  folio VARCHAR(40) NOT NULL,
  fecha DATETIME(6) NOT NULL,
  cantidad_entregada INT NOT NULL,
  observaciones VARCHAR(500) NULL,
  autorizacion VARCHAR(160) NULL,
  chofer VARCHAR(160) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uk_remisiones_folio (folio),
  KEY ix_remisiones_fecha (fecha),
  CONSTRAINT fk_remision_pieza FOREIGN KEY (pieza_id) REFERENCES piezas (id),
  CONSTRAINT fk_remision_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
