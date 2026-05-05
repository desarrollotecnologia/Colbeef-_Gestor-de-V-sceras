import pg from 'pg';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const readOnly = String(process.env.POSTGRES_READ_ONLY || 'true').toLowerCase() === 'true';

export const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
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
