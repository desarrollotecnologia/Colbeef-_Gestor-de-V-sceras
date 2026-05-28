import pg from 'pg';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const readOnly = String(process.env.POSTGRES_READ_ONLY || 'true').toLowerCase() === 'true';
const useSsl = String(process.env.POSTGRES_SSL || 'false').toLowerCase() === 'true';

const statementTimeoutMs = Number(process.env.POSTGRES_STATEMENT_TIMEOUT_MS || 30000);

/** dotenv puede dejar la clave vacía si el valor empieza con ! sin comillas. */
function envStr(key) {
  const v = process.env[key];
  return v === undefined || v === null ? '' : String(v);
}

const pgHost = envStr('POSTGRES_HOST');
const pgUser = envStr('POSTGRES_USER');
const pgPassword = envStr('POSTGRES_PASSWORD');
const pgDb = envStr('POSTGRES_DB');

if (!pgPassword) {
  console.warn(
    '[db] POSTGRES_PASSWORD vacío. En .env use comillas, p. ej. POSTGRES_PASSWORD="su_clave" (obligatorio si empieza con !).'
  );
}

export const pool = new pg.Pool({
  host: pgHost,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: pgDb,
  user: pgUser,
  password: pgPassword,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  options: `-c statement_timeout=${statementTimeoutMs}`,
});

/**
 * Solo SELECT / WITH ... SELECT. Bloquea escrituras si POSTGRES_READ_ONLY=true.
 */
export async function query(text, params = []) {
  const trimmed = String(text).trim();
  const head = trimmed.replace(/^\(\s*/, '').slice(0, 20).toUpperCase();
  if (readOnly && !head.startsWith('SELECT') && !head.startsWith('WITH')) {
    throw new Error('Solo consultas de lectura permitidas (SELECT/WITH).');
  }
  return pool.query(text, params);
}
