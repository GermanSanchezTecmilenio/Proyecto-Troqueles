ALTER TABLE proveedores
  ADD representante_legal VARCHAR(160) NULL AFTER razon_social,
  ADD direccion_fiscal VARCHAR(260) NULL AFTER representante_legal,
  ADD ciudad VARCHAR(120) NULL AFTER direccion_fiscal,
  ADD fax VARCHAR(40) NULL AFTER telefono,
  ADD banco VARCHAR(120) NULL AFTER condiciones_pago,
  ADD clabe VARCHAR(30) NULL AFTER banco,
  ADD numero_cuenta VARCHAR(40) NULL AFTER clabe;

INSERT INTO proveedores (nombre_proveedor, razon_social, rfc, direccion_fiscal, ciudad, banco, condiciones_pago, activo)
SELECT 'GERMAN SANCHEZ', 'GERMAN SANCHEZ', NULL, 'BILBAO', 'SAN NICOLAS', 'BANAMEX', 'CONTADO', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'GERMAN SANCHEZ');

INSERT INTO proveedores (nombre_proveedor, razon_social, direccion_fiscal, activo)
SELECT 'CESHSA PRODUCTS S.A.', 'CESHSA PRODUCTS S.A.', 'AV. MIGUEL ALEMAN 102', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'CESHSA PRODUCTS S.A.');

INSERT INTO proveedores (nombre_proveedor, razon_social, rfc, activo)
SELECT 'MAYRA CAROLINA RAMOS SENA', 'MAYRA CAROLINA RAMOS SENA', 'RASM910331TI1', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'MAYRA CAROLINA RAMOS SENA');

INSERT INTO proveedores (nombre_proveedor, razon_social, rfc, direccion_fiscal, activo)
SELECT 'RS TOOLS', 'RS TOOLS', 'RST0012217U8', 'CALLE ALAZAN 2537', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'RS TOOLS');

INSERT INTO proveedores (nombre_proveedor, razon_social, activo)
SELECT 'RANMAL MANUFACTURING', 'RANMAL MANUFACTURING', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'RANMAL MANUFACTURING');

INSERT INTO proveedores (nombre_proveedor, razon_social, activo)
SELECT 'DN COMPONENTES Y PERIFERICOS SA DE CV', 'DN COMPONENTES Y PERIFERICOS SA DE CV', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'DN COMPONENTES Y PERIFERICOS SA DE CV');

INSERT INTO proveedores (nombre_proveedor, razon_social, rfc, direccion_fiscal, activo)
SELECT 'LEE SPRING DE MEXICO S DE RL DE CV', 'LEE SPRING DE MEXICO S DE RL DE CV', 'LSM020731CZ6', 'Calle Apolo No. 519', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'LEE SPRING DE MEXICO S DE RL DE CV');

INSERT INTO proveedores (nombre_proveedor, razon_social, direccion_fiscal, activo)
SELECT 'PLC AG MEXICO, SA DE CV.', 'PLC AG MEXICO, SA DE CV.', 'PUERTO RICO 185', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'PLC AG MEXICO, SA DE CV.');

INSERT INTO proveedores (nombre_proveedor, razon_social, direccion_fiscal, activo)
SELECT 'URANYSA DE CV', 'URANYSA DE CV', 'MECANICOS No. 53', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'URANYSA DE CV');

INSERT INTO proveedores (nombre_proveedor, razon_social, rfc, direccion_fiscal, activo)
SELECT 'AUTOTAL SA DE CV', 'AUTOTAL SA DE CV', 'AUT821230F26', 'PROLONGACION FRANCISCO', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'AUTOTAL SA DE CV');

INSERT INTO proveedores (nombre_proveedor, razon_social, direccion_fiscal, activo)
SELECT 'PROCESOS METALICOS PCM, SA DE CV', 'PROCESOS METALICOS PCM, SA DE CV', 'PRIV. FUNDIDORES 1333', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE UPPER(nombre_proveedor) = 'PROCESOS METALICOS PCM, SA DE CV');
