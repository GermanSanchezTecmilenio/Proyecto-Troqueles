CREATE TABLE perfil_accesos (
  perfil_codigo VARCHAR(40) NOT NULL,
  modulo VARCHAR(80) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_create BOOLEAN NOT NULL DEFAULT TRUE,
  can_update BOOLEAN NOT NULL DEFAULT TRUE,
  can_delete BOOLEAN NOT NULL DEFAULT TRUE,
  can_import BOOLEAN NOT NULL DEFAULT TRUE,
  can_export BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (perfil_codigo, modulo),
  CONSTRAINT fk_perfil_accesos_perfil FOREIGN KEY (perfil_codigo) REFERENCES perfiles_usuario (codigo)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO perfil_accesos
  (perfil_codigo, modulo, can_view, can_create, can_update, can_delete, can_import, can_export)
SELECT p.codigo,
       m.modulo,
       CASE WHEN p.codigo = 'ADMIN' OR m.modulo <> 'ajustes' THEN TRUE ELSE FALSE END,
       CASE WHEN p.codigo = 'ADMIN' OR m.modulo <> 'ajustes' THEN TRUE ELSE FALSE END,
       CASE WHEN p.codigo = 'ADMIN' OR m.modulo <> 'ajustes' THEN TRUE ELSE FALSE END,
       CASE WHEN p.codigo = 'ADMIN' OR m.modulo <> 'ajustes' THEN TRUE ELSE FALSE END,
       CASE WHEN p.codigo = 'ADMIN' OR m.modulo <> 'ajustes' THEN TRUE ELSE FALSE END,
       CASE WHEN p.codigo = 'ADMIN' OR m.modulo <> 'ajustes' THEN TRUE ELSE FALSE END
  FROM perfiles_usuario p
 CROSS JOIN (
    SELECT 'dashboard' AS modulo UNION ALL
    SELECT 'catalogosMenu' UNION ALL
    SELECT 'clientes' UNION ALL
    SELECT 'proveedores' UNION ALL
    SELECT 'operadores' UNION ALL
    SELECT 'produccionMenu' UNION ALL
    SELECT 'actividades' UNION ALL
    SELECT 'piezas' UNION ALL
    SELECT 'ordenes' UNION ALL
    SELECT 'monitor' UNION ALL
    SELECT 'tiempos' UNION ALL
    SELECT 'comprasMenu' UNION ALL
    SELECT 'requisiciones' UNION ALL
    SELECT 'ordenesCompra' UNION ALL
    SELECT 'almacen' UNION ALL
    SELECT 'remisiones' UNION ALL
    SELECT 'reportes' UNION ALL
    SELECT 'ajustes'
  ) m;
