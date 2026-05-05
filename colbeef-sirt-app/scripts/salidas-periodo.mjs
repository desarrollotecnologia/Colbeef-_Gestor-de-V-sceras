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
  const days = 7;
  const { rows } = await client.query(
    `
    SELECT COUNT(DISTINCT CASE
      WHEN pcr.id_producto ~ '^[0-9]+-[0-9]+-'
      THEN substring(pcr.id_producto from '^([0-9]+-[0-9]+)-')
      ELSE pcr.id_producto
    END)::int AS bases_salida_cava
    FROM trazabilidad_proceso.parte_producto_cava_riel pcr
    WHERE pcr.fecha_salida::date >= CURRENT_DATE - $1::int
  `,
    [days]
  );
  console.log(rows[0]);
  await client.end();
}

main().catch(console.error);
