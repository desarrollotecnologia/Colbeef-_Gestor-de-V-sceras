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

async function q(label, sql, params = []) {
  const t0 = Date.now();
  const { rows } = await client.query(sql, params);
  console.log(label, Date.now() - t0 + 'ms', rows[0] || rows);
}

async function main() {
  await client.connect();

  await q(
    'vw rows last 7d',
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(sum),0)::numeric AS kg
     FROM trazabilidad_proceso.vw_producto_vendido_colbeef
     WHERE fecha_despacho_planta >= (CURRENT_DATE - INTERVAL '7 day')`
  );

  await q(
    'distinct propietarios vw',
    `SELECT COUNT(DISTINCT propietario)::int AS n FROM trazabilidad_proceso.vw_producto_vendido_colbeef
     WHERE fecha_despacho_planta >= (CURRENT_DATE - INTERVAL '30 day')`
  );

  await q(
    'parte_producto visceras tipos sample',
    `SELECT t.nombre, COUNT(*)::int
     FROM trazabilidad_proceso.parte_producto pp
     JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
     WHERE t.nombre ILIKE '%visc%' OR t.nombre ILIKE '%cabeza%' OR t.nombre ILIKE '%pata%'
     GROUP BY t.nombre
     ORDER BY COUNT(*) DESC
     LIMIT 15`
  );

  await q(
    'juegos base únicos (visc+cabeza+patas tipos)',
    `SELECT COUNT(DISTINCT
       CASE
         WHEN pp.id_producto ~ '^[0-9]+-[0-9]+-' THEN substring(pp.id_producto from '^([0-9]+-[0-9]+)-')
         ELSE pp.id_producto
       END
     )::int AS juegos
     FROM trazabilidad_proceso.parte_producto pp
     JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
     WHERE (t.nombre ILIKE '%visc%' OR t.nombre ILIKE '%cabeza%' OR t.nombre ILIKE '%mano%' OR t.nombre ILIKE '%pata%')`
  );

  await q(
    'cava_riel: con salida vs sin salida (filas)',
    `SELECT
       COUNT(*) FILTER (WHERE pcr.fecha_salida IS NULL)::int AS sin_salida,
       COUNT(*) FILTER (WHERE pcr.fecha_salida IS NOT NULL)::int AS con_salida
     FROM trazabilidad_proceso.parte_producto_cava_riel pcr`
  );

  await q(
    'decomisos últimos 30d',
    `SELECT COUNT(*)::int AS n FROM sai.decomiso WHERE fecha_registro >= (CURRENT_DATE - INTERVAL '30 day')`
  );

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
