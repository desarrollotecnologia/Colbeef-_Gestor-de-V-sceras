import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const patterns = [
  'cava',
  'viscer',
  'decomis',
  'despach',
  'opl',
  'subproduct',
  'lote',
  'estado_product',
  'punto',
  'planilla',
  'colbeef',
];

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
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);
  const low = (s) => String(s).toLowerCase();
  for (const p of patterns) {
    const hit = rows.filter((r) => low(r.table_name).includes(p) || low(r.table_schema).includes(p));
    console.log('\n=== pattern:', p, 'count:', hit.length, '===');
    hit.slice(0, 40).forEach((r) => console.log(r.table_schema + '.' + r.table_name));
    if (hit.length > 40) console.log('...');
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
