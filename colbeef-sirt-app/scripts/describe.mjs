import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const targets = [
  'trazabilidad_proceso.vw_producto_vendido_colbeef',
  'trazabilidad_proceso.parte_producto_cava_riel',
  'trazabilidad_proceso.cava',
  'sai.decomiso',
  'desposte.orden_despacho',
  'desposte.orden_despacho_detalle',
  'desposte.despacho_subproducto',
  'desposte.subproducto',
];

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function cols(schema, table) {
  const { rows } = await client.query(
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `,
    [schema, table]
  );
  return rows;
}

async function main() {
  await client.connect();
  for (const t of targets) {
    const [schema, table] = t.split('.');
    console.log('\n────────', t, '────────');
    const c = await cols(schema, table);
    if (!c.length) {
      console.log('(no columns / missing)');
      continue;
    }
    c.forEach((r) => console.log(' ', r.column_name, '::', r.data_type));
    try {
      const sample = await client.query(`SELECT * FROM ${schema}.${table} LIMIT 1`);
      console.log(' sample keys:', sample.rows[0] ? Object.keys(sample.rows[0]).length : 0);
    } catch (e) {
      console.log(' sample error:', e.message);
    }
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
