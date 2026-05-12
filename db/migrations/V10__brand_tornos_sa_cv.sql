UPDATE clientes
SET
  nombre_cliente = 'Tornos SA de CV (INTERNO)',
  calle = 'Tornos SA de CV',
  colonia = 'Tornos SA de CV',
  municipio = 'Tornos SA de CV',
  razon_social = 'Tornos SA de CV'
WHERE id = 2460
  AND (
    nombre_cliente LIKE CONCAT('%', CHAR(71, 79, 68, 77, 73, 83, 65), '%')
    OR razon_social LIKE CONCAT('%', CHAR(71, 79, 68, 77, 73, 83, 65), '%')
  );

UPDATE piezas
SET
  orden_compra = 'TORNOS SA DE CV',
  descripcion = 'TORNOS SA DE CV (ALMACEN, INGENIERIA O TALLER)',
  no_parte = 'TORNOS SA DE CV'
WHERE id = 2460
  AND (
    orden_compra LIKE CONCAT('%', CHAR(71, 79, 68, 77, 73, 83, 65), '%')
    OR descripcion LIKE CONCAT('%', CHAR(71, 79, 68, 77, 73, 83, 65), '%')
    OR no_parte LIKE CONCAT('%', CHAR(71, 79, 68, 77, 73, 83, 65), '%')
  );

UPDATE requisicion_detalles
SET destino = 'TORNOS SA DE CV (ALMACEN, INGENIERIA O TALLER)'
WHERE destino LIKE CONCAT('%', CHAR(71, 79, 68, 77, 73, 83, 65), '%');
