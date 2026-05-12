ALTER TABLE proveedores
  ADD retencion_iva_pct DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD retencion_isr_pct DECIMAL(7,4) NOT NULL DEFAULT 0;

ALTER TABLE ordenes_compra
  ADD retencion_iva_pct DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD retencion_isr_pct DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD retencion_iva DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD retencion_isr DECIMAL(14,2) NOT NULL DEFAULT 0;
