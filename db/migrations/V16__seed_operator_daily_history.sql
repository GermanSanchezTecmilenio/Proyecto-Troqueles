INSERT INTO operadores (nombre_operador, turno, activo, supervisor, chofer)
SELECT seed.nombre_operador, seed.turno, TRUE, FALSE, FALSE
FROM (
  SELECT 'Juan Perez' AS nombre_operador, 1 AS turno
  UNION ALL SELECT 'Maria Lopez', 1
  UNION ALL SELECT 'Carlos Ruiz', 2
  UNION ALL SELECT 'Ana Torres', 2
) AS seed
WHERE NOT EXISTS (
  SELECT 1
    FROM operadores o
   WHERE UPPER(o.nombre_operador) = UPPER(seed.nombre_operador)
);

INSERT INTO tiempos_produccion (
  pieza_id,
  operador_id,
  estatus_id,
  descripcion_operacion,
  inicio_operacion,
  fin_operacion,
  minutos
)
SELECT staged.pieza_id,
       staged.operador_id,
       staged.estatus_id,
       staged.descripcion_operacion,
       staged.inicio_operacion,
       DATE_ADD(staged.inicio_operacion, INTERVAL staged.minutos MINUTE),
       staged.minutos
FROM (
  SELECT p.id AS pieza_id,
         o.id AS operador_id,
         seed.estatus_id,
         seed.descripcion_operacion,
         STR_TO_DATE(
           CONCAT(DATE_FORMAT(DATE_SUB(CURRENT_DATE(), INTERVAL seed.dias_atras DAY), '%Y-%m-%d'), ' ', seed.hora_inicio),
           '%Y-%m-%d %H:%i:%s'
         ) AS inicio_operacion,
         seed.minutos
  FROM (
    SELECT 0 AS dias_atras, '08:00:00' AS hora_inicio, 'Operador demo' AS operador, 11443 AS pieza_id, 2 AS estatus_id, 'Troquelado compuesto' AS descripcion_operacion, 60 AS minutos
    UNION ALL SELECT 0, '09:20:00', 'Juan Perez', 11425, 2, 'Maquinado CNC', 95
    UNION ALL SELECT 0, '11:30:00', 'Maria Lopez', 11426, 2, 'Ajuste dimensional', 70
    UNION ALL SELECT 0, '13:10:00', 'Carlos Ruiz', 11430, 3, 'Inspeccion final', 40
    UNION ALL SELECT 1, '08:15:00', 'Ana Torres', 11431, 2, 'Rectificado', 85
    UNION ALL SELECT 1, '10:10:00', 'Juan Perez', 11427, 2, 'Barreno y roscado', 110
    UNION ALL SELECT 1, '12:40:00', 'Maria Lopez', 11428, 3, 'Afilado', 75
    UNION ALL SELECT 2, '07:50:00', 'Operador demo', 2460, 1, 'Apoyo almacen y taller', 55
    UNION ALL SELECT 2, '09:05:00', 'Carlos Ruiz', 11432, 2, 'Programacion CNC', 65
    UNION ALL SELECT 2, '10:30:00', 'Ana Torres', 11433, 2, 'Maquinado CNC', 120
    UNION ALL SELECT 3, '08:00:00', 'Juan Perez', 11434, 2, 'Torneado', 90
    UNION ALL SELECT 3, '10:00:00', 'Maria Lopez', 11435, 2, 'Fresado', 105
    UNION ALL SELECT 3, '12:20:00', 'Carlos Ruiz', 11436, 3, 'Liberacion calidad', 35
    UNION ALL SELECT 4, '08:10:00', 'Ana Torres', 11437, 2, 'Afilado', 80
    UNION ALL SELECT 4, '09:45:00', 'Operador demo', 1, 2, 'Preparacion de pieza', 45
    UNION ALL SELECT 4, '11:00:00', 'Juan Perez', 11438, 2, 'Rectificado', 100
    UNION ALL SELECT 5, '08:30:00', 'Maria Lopez', 11439, 2, 'Afilado', 115
    UNION ALL SELECT 5, '10:50:00', 'Carlos Ruiz', 11440, 2, 'Maquinado placa', 95
    UNION ALL SELECT 5, '13:00:00', 'Ana Torres', 11441, 3, 'Ensamble', 50
    UNION ALL SELECT 6, '08:00:00', 'Operador demo', 11442, 2, 'Fresado aluminio', 75
    UNION ALL SELECT 6, '09:40:00', 'Juan Perez', 11445, 2, 'Torneado de punzon', 120
    UNION ALL SELECT 6, '12:30:00', 'Maria Lopez', 2, 1, 'Revision de plano', 35
    UNION ALL SELECT 7, '08:20:00', 'Carlos Ruiz', 11425, 2, 'Maquinado CNC', 90
    UNION ALL SELECT 7, '10:05:00', 'Ana Torres', 11426, 2, 'Ajuste dimensional', 65
    UNION ALL SELECT 8, '08:00:00', 'Juan Perez', 11427, 2, 'Barreno y roscado', 105
    UNION ALL SELECT 8, '10:15:00', 'Maria Lopez', 11428, 3, 'Afilado', 70
    UNION ALL SELECT 9, '08:05:00', 'Carlos Ruiz', 11430, 2, 'Preparacion mordaza', 80
    UNION ALL SELECT 9, '09:50:00', 'Ana Torres', 11431, 2, 'Rectificado', 95
    UNION ALL SELECT 10, '08:00:00', 'Operador demo', 2460, 1, 'Soporte taller interno', 60
    UNION ALL SELECT 10, '09:20:00', 'Juan Perez', 11432, 2, 'Programacion CNC', 75
    UNION ALL SELECT 11, '08:10:00', 'Maria Lopez', 11433, 2, 'Maquinado CNC', 100
    UNION ALL SELECT 11, '10:20:00', 'Carlos Ruiz', 11434, 3, 'Inspeccion final', 45
    UNION ALL SELECT 12, '08:00:00', 'Ana Torres', 11435, 2, 'Fresado', 110
    UNION ALL SELECT 12, '10:30:00', 'Operador demo', 11443, 2, 'Troquelado compuesto', 60
  ) AS seed
  JOIN piezas p ON p.id = seed.pieza_id
  JOIN operadores o ON UPPER(o.nombre_operador) = UPPER(seed.operador)
  JOIN estatus_produccion e ON e.id = seed.estatus_id
) AS staged
WHERE NOT EXISTS (
  SELECT 1
    FROM tiempos_produccion t
   WHERE t.pieza_id = staged.pieza_id
     AND t.operador_id = staged.operador_id
     AND t.inicio_operacion = staged.inicio_operacion
     AND t.descripcion_operacion = staged.descripcion_operacion
);
