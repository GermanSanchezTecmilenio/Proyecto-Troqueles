CREATE TABLE perfiles_usuario (
  id BIGINT NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(250) NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uk_perfiles_usuario_codigo (codigo),
  KEY ix_perfiles_usuario_activo_nombre (activo, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO perfiles_usuario (codigo, nombre, descripcion, activo) VALUES
  ('ADMIN', 'Administrador', 'Acceso completo a operacion y ajustes del sistema', TRUE),
  ('OPERADOR', 'Operador', 'Acceso operativo general para captura y consulta', TRUE)
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion),
  activo = TRUE;

ALTER TABLE users
  ADD COLUMN email VARCHAR(160) NULL AFTER display_name,
  ADD COLUMN locked BOOLEAN NOT NULL DEFAULT FALSE AFTER active,
  ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0 AFTER locked,
  ADD COLUMN password_changed_at DATETIME(6) NULL AFTER failed_attempts,
  ADD COLUMN last_login_at DATETIME(6) NULL AFTER password_changed_at;

CREATE INDEX ix_users_active_locked ON users (active, locked);
