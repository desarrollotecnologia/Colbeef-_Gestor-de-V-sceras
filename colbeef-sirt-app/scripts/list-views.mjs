import pg from 'pg';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function main() {
  await client.connect();
  const { rows } = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.views
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND (
        table_name ILIKE '%cava%'
        OR table_name ILIKE '%parte_producto%'
        OR table_name ILIKE '%colbeef%'
        OR table_name ILIKE '%visc%'
        OR table_name ILIKE '%despacho%'
      )
    ORDER BY 1, 2
  `);
  rows.forEach((r) => console.log(`${r.table_schema}.${r.table_name}`));
  console.log('total', rows.length);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
