UPDATE piezas
   SET archivo = 'assets/drawings/pieza-11445-punzon.svg',
       no_dibujo = COALESCE(NULLIF(no_dibujo, ''), 'PUNZON-11445')
 WHERE id = 11445;
