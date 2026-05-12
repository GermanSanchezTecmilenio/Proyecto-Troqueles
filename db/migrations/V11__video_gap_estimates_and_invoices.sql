CREATE TABLE pieza_estimaciones (
  id BIGINT NOT NULL AUTO_INCREMENT,
  pieza_id BIGINT NOT NULL,
  descripcion VARCHAR(220) NOT NULL,
  horas_estimadas DECIMAL(10,2) NOT NULL DEFAULT 0,
  costo_estimado DECIMAL(14,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(3) NOT NULL DEFAULT 'MXN',
  observaciones VARCHAR(500) NULL,
  usuario VARCHAR(80) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_pieza_estimaciones_pieza_fecha (pieza_id, created_at),
  CONSTRAINT fk_pieza_estimaciones_pieza FOREIGN KEY (pieza_id) REFERENCES piezas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE facturas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  remision_id BIGINT NULL,
  cliente_id BIGINT NOT NULL,
  serie VARCHAR(20) NULL,
  folio VARCHAR(40) NOT NULL,
  fecha DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  iva DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  estatus VARCHAR(40) NOT NULL DEFAULT 'Pendiente',
  uuid VARCHAR(80) NULL,
  observaciones VARCHAR(500) NULL,
  created_by VARCHAR(80) NOT NULL,
  cancelado BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY uk_facturas_serie_folio (serie, folio),
  KEY ix_facturas_cliente_fecha (cliente_id, fecha),
  KEY ix_facturas_remision (remision_id),
  CONSTRAINT fk_facturas_remision FOREIGN KEY (remision_id) REFERENCES remisiones (id),
  CONSTRAINT fk_facturas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
