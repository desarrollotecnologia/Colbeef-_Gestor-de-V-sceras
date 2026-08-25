/**
 * Autenticación real del gestor (usuario + contraseña en MySQL).
 * Sesiones con token opaco en tabla auth_sessions.
 */
import crypto from 'crypto';
import { gestorQuery, isGestorMysqlReady } from '../gestorDb.js';
import { recordAuditoria } from './mysqlSchema.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h turno de planta
const TOKEN_BYTES = 32;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const next = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(next, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export async function ensureAuthSessionsTable() {
  if (!isGestorMysqlReady()) return;
  await gestorQuery(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token VARCHAR(64) NOT NULL PRIMARY KEY,
      usuario_id INT UNSIGNED NOT NULL,
      usuario VARCHAR(120) NOT NULL,
      rol ENUM('operador','supervisor','admin') NOT NULL DEFAULT 'operador',
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_auth_sessions_usuario (usuario),
      KEY idx_auth_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/** Crea admin inicial si la tabla usuarios está vacía. */
export async function seedAdminUser() {
  if (!isGestorMysqlReady()) return { ok: false, skipped: true };
  const rows = await gestorQuery('SELECT COUNT(*) AS n FROM usuarios');
  if (Number(rows[0]?.n || 0) > 0) return { ok: true, seeded: false };

  const user = String(process.env.GESTOR_ADMIN_USER || 'sergio anaya').trim().slice(0, 120) || 'sergio anaya';
  const pass = String(process.env.GESTOR_ADMIN_PASSWORD || '').trim();
  if (!pass) {
    console.warn(
      '[auth] No hay usuarios y falta GESTOR_ADMIN_PASSWORD en .env — cree el usuario con: npm run user:create -- --user="sergio anaya" --pass=...'
    );
    return { ok: false, seeded: false, reason: 'no_password' };
  }

  await gestorQuery(
    `INSERT INTO usuarios (nombre, rol, activo, password_hash)
     VALUES (?, 'operador', 1, ?)`,
    [user, hashPassword(pass)]
  );
  console.log(`[auth] Primer usuario creado: ${user} (operador)`);
  return { ok: true, seeded: true, usuario: user };
}

export async function createUser({ nombre, password, rol = 'operador' }) {
  if (!isGestorMysqlReady()) throw new Error('MySQL del gestor no disponible');
  const name = String(nombre || '').trim().slice(0, 120);
  const pwd = String(password || '');
  const role = ['operador', 'supervisor', 'admin'].includes(rol) ? rol : 'operador';
  if (!name || pwd.length < 6) {
    throw new Error('Usuario y contraseña (mín. 6 caracteres) son obligatorios');
  }
  await gestorQuery(
    `INSERT INTO usuarios (nombre, rol, activo, password_hash) VALUES (?, ?, 1, ?)`,
    [name, role, hashPassword(pwd)]
  );
  return { success: true, usuario: name, rol: role };
}

export async function loginUser(usuario, password, reqMeta = {}) {
  if (!isGestorMysqlReady()) {
    return { success: false, message: 'MySQL no disponible. No se puede autenticar.' };
  }
  const name = String(usuario || '').trim().slice(0, 120);
  const pwd = String(password || '');
  if (!name || !pwd) {
    return { success: false, message: 'Usuario y contraseña requeridos.' };
  }

  const rows = await gestorQuery(
    `SELECT id, nombre, rol, activo, password_hash FROM usuarios WHERE nombre = ? LIMIT 1`,
    [name]
  );
  const u = rows[0];
  if (!u || !u.activo) {
    return { success: false, message: 'Usuario o contraseña incorrectos.' };
  }
  if (!u.password_hash || !verifyPassword(pwd, u.password_hash)) {
    void recordAuditoria(
      { usuario: name, accion: 'login_fail', modulo: 'auth', detalle: 'credenciales inválidas' },
      reqMeta
    );
    return { success: false, message: 'Usuario o contraseña incorrectos.' };
  }

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await ensureAuthSessionsTable();
  await gestorQuery(
    `INSERT INTO auth_sessions (token, usuario_id, usuario, rol, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [token, u.id, u.nombre, u.rol, expires]
  );

  void recordAuditoria(
    { usuario: u.nombre, accion: 'login_ok', modulo: 'auth', detalle: `rol=${u.rol}` },
    reqMeta
  );

  return {
    success: true,
    token,
    usuario: u.nombre,
    rol: u.rol,
    expiresAt: expires.toISOString(),
  };
}

export async function logoutUser(token, reqMeta = {}) {
  if (!token || !isGestorMysqlReady()) return { success: true };
  const rows = await gestorQuery(`SELECT usuario FROM auth_sessions WHERE token = ? LIMIT 1`, [
    token,
  ]);
  await gestorQuery(`DELETE FROM auth_sessions WHERE token = ?`, [token]);
  if (rows[0]) {
    void recordAuditoria(
      { usuario: rows[0].usuario, accion: 'logout', modulo: 'auth', detalle: 'ok' },
      reqMeta
    );
  }
  return { success: true };
}

export async function resolveSession(token) {
  if (!token || !isGestorMysqlReady()) return null;
  await ensureAuthSessionsTable();
  const rows = await gestorQuery(
    `SELECT s.token, s.usuario, s.rol, s.expires_at, u.activo
     FROM auth_sessions s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ?
     LIMIT 1`,
    [token]
  );
  const s = rows[0];
  if (!s || !s.activo) return null;
  const exp = s.expires_at instanceof Date ? s.expires_at : new Date(s.expires_at);
  if (Date.now() > exp.getTime()) {
    await gestorQuery(`DELETE FROM auth_sessions WHERE token = ?`, [token]);
    return null;
  }
  return { usuario: s.usuario, rol: s.rol, token: s.token, expiresAt: exp.toISOString() };
}

export function tokenFromReq(req) {
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-colbeef-token'] || '').trim();
}

export function isAuthRequired() {
  return String(process.env.GESTOR_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
}
