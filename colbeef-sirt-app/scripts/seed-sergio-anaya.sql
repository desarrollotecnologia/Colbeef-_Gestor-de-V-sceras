-- Primer operario del Gestor de Vísceras
-- Usuario: sergio anaya
-- Contraseña: Colbeef2026*
-- Ejecutar en MySQL Workbench contra la BD colbeef_gestor

USE colbeef_gestor;

INSERT INTO usuarios (nombre, rol, activo, password_hash)
VALUES (
  'sergio anaya',
  'operador',
  1,
  'scrypt$40ed7b1f92ee711c9a44725e5a99d3e8$3219192265a56189980139fcc7a78fec43ef93b69491f0552598a7115b9afb85fe00992785a35a5c33f0012d7879a7b1f246f13ad9d1797db2305f14c65d85c3'
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  rol = 'operador',
  activo = 1;

SELECT id, nombre, rol, activo, created_at FROM usuarios;
