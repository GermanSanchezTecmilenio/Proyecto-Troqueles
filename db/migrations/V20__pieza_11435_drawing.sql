UPDATE piezas
   SET archivo = 'assets/drawings/pieza-11435-boquilla.svg',
       no_dibujo = COALESCE(NULLIF(no_dibujo, ''), '95272309')
 WHERE id = 11435;
