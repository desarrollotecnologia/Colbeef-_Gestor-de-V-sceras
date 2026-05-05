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
    SELECT COUNT(DISTINCT CASE
      WHEN pp.id_producto ~ '^[0-9]+-[0-9]+-'
      THEN substring(pp.id_producto from '^([0-9]+-[0-9]+)-')
      ELSE pp.id_producto
    END)::int AS juegos
    FROM trazabilidad_proceso.parte_producto pp
    JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
    WHERE pp.fecha_registro::date >= CURRENT_DATE - INTERVAL '7 days'
      AND (
        t.nombre ILIKE '%visc%'
        OR t.nombre ILIKE '%cabeza%'
        OR t.nombre ILIKE '%mano%'
        OR t.nombre ILIKE '%pata%'
      )
  `);
  console.log(rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
