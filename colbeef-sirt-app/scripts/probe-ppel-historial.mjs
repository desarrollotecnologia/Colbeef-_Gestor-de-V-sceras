/**
 * Diagnóstico solo lectura: ¿una adicional fue asignación nueva o modificación?
 * Muestra todas las columnas de la programación (ppel) de cada pieza y busca tablas de
 * historial/auditoría que guarden la asignación original.
 * Uso: node scripts/probe-ppel-historial.mjs 2609-11430 2609-11201
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const animales = process.argv.slice(2);
if (!animales.length) {
  console.log('Uso: node scripts/probe-ppel-historial.mjs <animal> [animal…]');
  process.exit(1);
}
const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});
await client.connect();

const cols = await client.query(
  `SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'trazabilidad_proceso' AND table_name = 'parte_producto_empresa_local'
    ORDER BY ordinal_position`
);
console.log('Columnas de parte_producto_empresa_local:');
console.log('  ' + cols.rows.map((c) => `${c.column_name} (${c.data_type})`).join(', '));

const tablas = await client.query(
  `SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND (table_name ~* '(hist|audit|log|bitacora|traza_cambio|modific)'
           OR table_name ~* 'parte_producto_empresa')
    ORDER BY 1, 2`
);
console.log('\nTablas posibles de historial / programación:');
tablas.rows.forEach((t) => console.log(`  ${t.table_schema}.${t.table_name}`));

for (const animal of animales) {
  const r = await client.query(
    `SELECT pp.id_producto, tpp.nombre AS tipo, ppe.id AS id_ppe, s.nombre AS local, ppel.*
       FROM trazabilidad_proceso.parte_producto pp
       JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
       JOIN trazabilidad_proceso.parte_producto_empresa ppe
         ON ppe.id_parte_producto = pp.id AND ppe.id_producto::text = pp.id_producto::text
       JOIN trazabilidad_proceso.parte_producto_empresa_local ppel ON ppel.id_parte_producto_empresa = ppe.id
       LEFT JOIN organizaciones.sucursal s ON s.id = ppel.id_local
      WHERE pp.id_producto LIKE $1
      ORDER BY pp.id_producto, tpp.nombre, ppel.fecha_registro, ppel.hora_registro`,
    [`${animal}%`]
  );
  console.log(`\n### ${animal}: ${r.rows.length} registro(s) de programación`);
  r.rows.forEach((row) => {
    const limpio = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])
    );
    console.log('  ' + JSON.stringify(limpio));
  });
}
await client.end();
