DELETE FROM perfil_accesos
WHERE modulo IN ('actividades');

ALTER TABLE perfil_accesos
  DROP COLUMN can_import;
