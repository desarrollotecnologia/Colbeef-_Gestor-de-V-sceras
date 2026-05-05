import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Client } = pg;
const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 8000,
});

async function main() {
  await client.connect();
  const tables = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);
  console.log('Tables:', tables.rows.length);
  for (const r of tables.rows.slice(0, 80)) {
    console.log(`${r.table_schema}.${r.table_name}`);
  }
  if (tables.rows.length > 80) console.log('... truncated');
  await client.end();
}

main().catch((e) => {
  console.error('PROBE_ERROR', e.message);
  process.exit(1);
});
