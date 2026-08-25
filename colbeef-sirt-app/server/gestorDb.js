/**
 * Conexión MySQL propia del gestor (servidor 205).
 *
 * Independiente de PostgreSQL/SIRT (solo lectura).
 * Si GESTOR_MYSQL_ENABLED=false o faltan credenciales, el API sigue
 * funcionando con JSON local; MySQL queda listo para auditoría y control.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function envStr(key, fallback = '') {
  const v = process.env[key];
  if (v == null || String(v).trim() === '') return fallback;
  return String(v).trim();
}

const enabled =
  String(process.env.GESTOR_MYSQL_ENABLED || 'true').toLowerCase() !== 'false';

const cfg = {
  host: envStr('GESTOR_MYSQL_HOST', '127.0.0.1'),
  port: Number(process.env.GESTOR_MYSQL_PORT || 3306),
  user: envStr('GESTOR_MYSQL_USER', 'gestor'),
  password: envStr('GESTOR_MYSQL_PASSWORD', ''),
  database: envStr('GESTOR_MYSQL_DB', 'colbeef_gestor'),
};

/** @type {import('mysql2/promise').Pool | null} */
let pool = null;
let ready = false;
let lastError = null;

export function isGestorMysqlEnabled() {
  return enabled;
}

export function isGestorMysqlReady() {
  return ready && !!pool;
}

export function getGestorMysqlStatus() {
  return {
    enabled,
    ready,
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    lastError: lastError ? String(lastError.message || lastError) : null,
  };
}

async function createPool(database) {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: database || undefined,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    timezone: 'Z',
    dateStrings: false,
  });
}

/**
 * Crea la base si no existe y deja el pool apuntando a GESTOR_MYSQL_DB.
 * Requiere privilegio CREATE DATABASE (o que la BD ya exista).
 */
export async function initGestorMysql() {
  if (!enabled) {
    console.log('[gestor-mysql] Deshabilitado (GESTOR_MYSQL_ENABLED=false). Se usa JSON local.');
    return { ok: false, skipped: true };
  }

  if (!cfg.password && cfg.user !== 'root') {
    console.warn(
      '[gestor-mysql] GESTOR_MYSQL_PASSWORD vacío. Defínalo en .env antes de producción.'
    );
  }

  try {
    const boot = await createPool(null);
    await boot.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database.replace(/`/g, '')}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await boot.end();

    pool = await createPool(cfg.database);
    await pool.query('SELECT 1 AS ok');
    ready = true;
    lastError = null;
    console.log(
      `[gestor-mysql] Conectado a ${cfg.host}:${cfg.port}/${cfg.database}`
    );
    return { ok: true };
  } catch (e) {
    ready = false;
    lastError = e;
    pool = null;
    console.error('[gestor-mysql] No se pudo conectar:', e.message);
    console.error(
      '[gestor-mysql] Instale MySQL en el 205 y revise GESTOR_MYSQL_* en .env. El gestor sigue con JSON.'
    );
    return { ok: false, error: e.message };
  }
}

/** Ejecuta SQL con parámetros nombrados (:name) o posicionales (?). */
export async function gestorQuery(sql, params) {
  if (!pool) throw new Error('MySQL del gestor no está disponible');
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function closeGestorMysql() {
  if (pool) {
    await pool.end();
    pool = null;
    ready = false;
  }
}
