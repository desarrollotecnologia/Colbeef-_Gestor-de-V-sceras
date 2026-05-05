import pg from 'pg';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const t = process.argv[2] || 'trazabilidad_proceso.parte_producto';
const [schema, table] = t.split('.');

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function main() {
  await client.connect();
  const { rows } = await client.query(
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `,
    [schema, table]
  );
  console.log(t);
  rows.forEach((r) => console.log(' ', r.column_name, r.data_type));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
