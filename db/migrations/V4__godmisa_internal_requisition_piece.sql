ALTER TABLE requisicion_detalles
  ADD pieza_id BIGINT NULL;

ALTER TABLE requisicion_detalles
  ADD KEY ix_req_det_pieza (pieza_id),
  ADD CONSTRAINT fk_req_det_pieza FOREIGN KEY (pieza_id) REFERENCES piezas (id);

INSERT INTO clientes (id, nombre_cliente, calle, colonia, municipio, estado, rfc, cp, razon_social, formato_factura, activo)
VALUES (2460, 'GODMISA (INTERNO)', 'GODMISA', 'GODMISA', 'GODMISA', 'NL', 'XAXX010101000', '00000', 'GODMISA SA DE CV', false, true);

INSERT INTO piezas (
  id,
  cliente_id,
  estatus_id,
  orden_compra,
  descripcion,
  cantidad,
  cantidad_entregada,
  fecha_requerimiento,
  fecha_compromiso,
  entregado,
  no_dibujo,
  no_parte,
  precio,
  material,
  tratamiento
) VALUES (
  2460,
  2460,
  1,
  'GODMISA',
  'GODMISA (ALMACEN, INGENIERIA O TALLER)',
  1,
  0,
  CURRENT_DATE(),
  DATE_ADD(CURRENT_DATE(), INTERVAL 100 YEAR),
  false,
  '2460',
  'GODMISA',
  0.00,
  'USO INTERNO',
  'NO APLICA'
);

UPDATE requisicion_detalles
SET pieza_id = 2460
WHERE destino LIKE 'Almacen%' OR destino LIKE 'Taller%';
