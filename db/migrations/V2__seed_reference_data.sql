INSERT INTO estatus_produccion (id, descripcion, grupo, hr_semanal, maquinas) VALUES
  (1, 'Alta', 'ALTA', 0, 0),
  (2, 'En proceso', 'PRODUCCION', 40, 1),
  (3, 'Terminado', 'PRODUCCION', 40, 1),
  (4, 'Entregado parcial', 'ENTREGA', 0, 0),
  (5, 'Entregado', 'ENTREGA', 0, 0);

INSERT INTO clientes (id, nombre_cliente, calle, colonia, municipio, estado, rfc, cp, razon_social, formato_factura) VALUES
  (1, 'Cliente demo industrial', 'Av. Taller 100', 'Parque Industrial', 'Monterrey', 'NL', 'XAXX010101000', '64000', 'Cliente Demo Industrial SA de CV', true),
  (2, 'MECAV demo', 'Calle Maquinado 20', 'Centro', 'Queretaro', 'QRO', 'XEXX010101000', '76000', 'MECAV Demo SA de CV', true);

INSERT INTO operadores (id, nombre_operador, turno, activo, supervisor, chofer) VALUES
  (1, 'Operador demo', 1, true, false, false),
  (2, 'Supervisor demo', 1, true, true, false);

INSERT INTO almacen_articulos (id, descripcion, medida, existencia, minimo, maximo, punto_reorden, activo) VALUES
  (1, 'Barra acero 1018 demo', 'pieza', 10.000, 2, 50, 5, true),
  (2, 'Inserto de corte demo', 'pieza', 20.000, 5, 100, 10, true);

INSERT INTO piezas (id, cliente_id, estatus_id, orden_compra, descripcion, cantidad, cantidad_entregada, fecha_requerimiento, fecha_compromiso, entregado, no_dibujo, no_parte, precio, material, tratamiento) VALUES
  (1, 1, 2, 'OC-DEMO-001', 'Pieza demo pallet stop', 12, 0, CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY), false, '15-5046', 'PCB-STOP-3', 250.00, 'Acero 1018', 'Pavonado'),
  (2, 2, 1, 'OC-DEMO-002', 'Pieza demo guia block', 4, 0, CURRENT_DATE(), DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY), false, 'BIM002-AP-127', 'GUIDE-BLOCK', 890.00, 'Aluminio', 'Anodizado');
