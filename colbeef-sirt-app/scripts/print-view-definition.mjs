/**
 * Imprime la definición SQL de una vista (para reemplazar vw_* por tablas base).
 * Uso: node scripts/print-view-definition.mjs [schema.view]
 * Ejemplo: node scripts/print-view-definition.mjs trazabilidad_proceso.vw_producto_vendido_colbeef
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const fq = process.argv[2] || 'trazabilidad_proceso.vw_producto_vendido_colbeef';

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function main() {
  await client.connect();
  const { rows } = await client.query(`SELECT pg_get_viewdef($1::regclass, true) AS def`, [fq]);
  console.log(rows[0]?.def || '(sin definición)');
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
