/**
 * Diagnóstico solo lectura: piezas de un animal (programación, cavas, decomiso).
 * Uso: node scripts/probe-juego.mjs 2609-10235
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const animal = process.argv[2];
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
const piezas = await client.query(
  `SELECT pp.id, pp.id_producto, tpp.nombre AS tipo
     FROM trazabilidad_proceso.parte_producto pp
     JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
    WHERE pp.id_producto LIKE $1
    ORDER BY pp.id_producto, tpp.nombre`,
  [`${animal}%`]
);
for (const p of piezas.rows) {
  const prog = await client.query(
    `SELECT ppel.fecha_programacion_despacho::date AS prog, ppel.fecha_registro, ppel.hora_registro, s.nombre AS local
       FROM trazabilidad_proceso.parte_producto_empresa ppe
       JOIN trazabilidad_proceso.parte_producto_empresa_local ppel ON ppel.id_parte_producto_empresa = ppe.id
       LEFT JOIN organizaciones.sucursal s ON s.id = ppel.id_local
      WHERE ppe.id_parte_producto = $1 AND ppe.id_producto::text = $2
      ORDER BY ppel.fecha_registro, ppel.hora_registro`,
    [p.id, p.id_producto]
  );
  const movs = await client.query(
    `SELECT c.nombre AS cava, mov.fecha_ingreso, mov.fecha_salida
       FROM trazabilidad_proceso.parte_producto_cava_riel mov
       LEFT JOIN trazabilidad_proceso.cava c ON c.id = mov.id_cava
      WHERE mov.id_parte_producto = $1 AND mov.id_producto::text = $2
      ORDER BY mov.fecha_ingreso, mov.id`,
    [p.id, p.id_producto]
  );
  console.log(`\n${p.id_producto} · ${p.tipo}`);
  prog.rows.forEach((r) =>
    console.log(`  programación ${r.prog?.toLocaleDateString('es-CO')} registrada ${r.fecha_registro?.toLocaleDateString('es-CO')} ${r.hora_registro} · ${r.local || ''}`)
  );
  if (!prog.rows.length) console.log('  sin programación');
  movs.rows.forEach((m) =>
    console.log(`  cava ${m.cava} · entra ${m.fecha_ingreso?.toLocaleString('es-CO')} · sale ${m.fecha_salida ? m.fecha_salida.toLocaleString('es-CO') : '(sigue)'}`)
  );
}
const dec = await client.query(
  `SELECT * FROM sai.decomiso WHERE CAST(id_producto AS text) LIKE $1 LIMIT 10`,
  [`${animal}%`]
).catch((e) => ({ rows: [], error: e.message }));
console.log(`\ndecomisos SAI: ${dec.rows.length}${dec.error ? ' (' + dec.error + ')' : ''}`);
dec.rows.forEach((d) => console.log('  ', JSON.stringify(d).slice(0, 300)));
await client.end();
