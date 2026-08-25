/**
 * Esquema MySQL del gestor: se aplica solo al arrancar (idempotente).
 * SIRT permanece en PostgreSQL; aquí solo control, auditoría y estado propio.
 */
import { gestorQuery, isGestorMysqlReady } from '../gestorDb.js';

const SCHEMA_VERSION = 1;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    version INT NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    rol ENUM('operador','supervisor','admin') NOT NULL DEFAULT 'operador',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    password_hash VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuarios_nombre (nombre)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS auditoria (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ts TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    usuario VARCHAR(120) NOT NULL,
    accion VARCHAR(80) NOT NULL,
    modulo VARCHAR(80) NULL,
    detalle VARCHAR(500) NULL,
    meta_json JSON NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(280) NULL,
    KEY idx_auditoria_ts (ts),
    KEY idx_auditoria_usuario (usuario),
    KEY idx_auditoria_accion (accion)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS usability_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(32) NOT NULL,
    ts TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    usuario VARCHAR(120) NOT NULL,
    action VARCHAR(80) NOT NULL,
    module VARCHAR(80) NULL,
    detail VARCHAR(240) NULL,
    session_id VARCHAR(64) NULL,
    page VARCHAR(80) NULL,
    meta_json JSON NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(280) NULL,
    UNIQUE KEY uq_usability_event_id (event_id),
    KEY idx_usability_ts (ts),
    KEY idx_usability_usuario (usuario),
    KEY idx_usability_session (session_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sesion_lock (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    usuario VARCHAR(120) NOT NULL,
    session_id VARCHAR(64) NULL,
    locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_sesion_lock_singleton CHECK (id = 1)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS gestor_state (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    payload JSON NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(120) NULL,
    CONSTRAINT chk_gestor_state_singleton CHECK (id = 1)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Crea tablas si faltan. Seguro llamar en cada arranque. */
export async function ensureGestorSchema() {
  if (!isGestorMysqlReady()) {
    return { ok: false, skipped: true };
  }

  for (const ddl of TABLES) {
    await gestorQuery(ddl);
  }

  const rows = await gestorQuery('SELECT version FROM schema_meta WHERE version = ?', [
    SCHEMA_VERSION,
  ]);
  if (!rows.length) {
    await gestorQuery('INSERT INTO schema_meta (version) VALUES (?)', [SCHEMA_VERSION]);
  }

  console.log(`[gestor-mysql] Esquema OK (versión ${SCHEMA_VERSION})`);
  return { ok: true, version: SCHEMA_VERSION };
}

/**
 * Registra una acción de negocio (cerrar, limpiar, sync, PDF, etc.).
 * No lanza si MySQL no está listo (falla en silencio controlado).
 */
export async function recordAuditoria(payload = {}, reqMeta = {}) {
  if (!isGestorMysqlReady()) return { ok: false, skipped: true };
  try {
    await gestorQuery(
      `INSERT INTO auditoria
        (usuario, accion, modulo, detalle, meta_json, ip, user_agent)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
      [
        String(payload.usuario || 'anonimo').slice(0, 120),
        String(payload.accion || 'event').slice(0, 80),
        String(payload.modulo || '').slice(0, 80) || null,
        String(payload.detalle || '').slice(0, 500) || null,
        JSON.stringify(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
        String(reqMeta.ip || '').slice(0, 64) || null,
        String(reqMeta.userAgent || '').slice(0, 280) || null,
      ]
    );
    return { ok: true };
  } catch (e) {
    console.warn('[gestor-mysql] auditoria:', e.message);
    return { ok: false, error: e.message };
  }
}
