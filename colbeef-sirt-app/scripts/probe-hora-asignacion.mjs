/**
 * Solo lectura: ¿SIRT guarda la hora en que se asigna la salida (programación)?
 * node scripts/probe-hora-asignacion.mjs 2026-09-26
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const fecha = process.argv[2] || '2026-09-26';
const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 10000,
});

async function main() {
  await client.connect();
  const cols = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'trazabilidad_proceso'
      AND table_name IN ('parte_producto_empresa_local', 'parte_producto_empresa')
    ORDER BY table_name, ordinal_position`);
  console.log('Columnas:');
  cols.rows.forEach((r) => console.log(`  ${r.table_name}.${r.column_name} (${r.data_type})`));

  const fechaCols = cols.rows
    .filter((r) => r.table_name === 'parte_producto_empresa_local' && /timestamp|date|time/.test(r.data_type))
    .map((r) => r.column_name);

  const sel = fechaCols.map((c) => `ppel.${c}::text AS "${c}"`).join(', ');
  const muestra = await client.query(
    `SELECT ${sel} FROM trazabilidad_proceso.parte_producto_empresa_local ppel
     WHERE ppel.fecha_programacion_despacho::date = $1::date LIMIT 8`,
    [fecha]
  );
  console.log(`\nMuestra ${fecha}:`);
  console.table(muestra.rows);

  for (const c of fechaCols) {
    const h = await client.query(
      `SELECT to_char(ppel.${c}, 'YYYY-MM-DD HH24') AS hora, COUNT(*)::int AS n
       FROM trazabilidad_proceso.parte_producto_empresa_local ppel
       WHERE ppel.fecha_programacion_despacho::date = $1::date
       GROUP BY 1 ORDER BY 1`,
      [fecha]
    );
    console.log(`\nDistribución por hora de ${c}:`);
    h.rows.forEach((r) => console.log(`  ${r.hora ?? '(null)'}  ${r.n}`));
  }
  await client.end();
}

main().catch((e) => {
  console.error('PROBE_ERROR', e.message);
  process.exit(1);
});
