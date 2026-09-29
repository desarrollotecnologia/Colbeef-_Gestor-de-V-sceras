/**
 * Solo lectura: para cada cruda del módulo (servidor) muestra la programación y cava
 * actual de su Víscera Blanca en SIRT, para explicar la diferencia con la tarjeta.
 * node scripts/probe-crudas-diferencia.mjs [2026-09-29] [http://192.168.20.205:3001]
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
const fecha = process.argv[2] || '2026-09-29';
const host = process.argv[3] || 'http://192.168.20.205:3001';

const r = await fetch(`${host}/api/rpc`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'getCrudasDetalle', args: [] }),
});
const json = await r.json();
const det = json.result || json;
const bases = [...new Set(det.filas.map((f) => f.base))];

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: String(process.env.POSTGRES_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
});
await client.connect();
const { rows } = await client.query(
  `SELECT split_part(pp.id_producto, '-', 1) || '-' || split_part(pp.id_producto, '-', 2) AS base,
          (SELECT MIN(ppel.fecha_programacion_despacho)::date
             FROM trazabilidad_proceso.parte_producto_empresa ppe
             JOIN trazabilidad_proceso.parte_producto_empresa_local ppel ON ppel.id_parte_producto_empresa = ppe.id
            WHERE ppe.id_parte_producto = pp.id AND ppe.id_producto::text = pp.id_producto::text) AS prog,
          (SELECT c.nombre FROM trazabilidad_proceso.parte_producto_cava_riel mov
             LEFT JOIN trazabilidad_proceso.cava c ON c.id = mov.id_cava
            WHERE mov.id_parte_producto = pp.id AND mov.id_producto::text = pp.id_producto::text
            ORDER BY mov.fecha_ingreso DESC, mov.id DESC LIMIT 1) AS cava
     FROM trazabilidad_proceso.parte_producto pp
     JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
    WHERE tpp.nombre = 'Visceras Blancas'
      AND (split_part(pp.id_producto, '-', 1) || '-' || split_part(pp.id_producto, '-', 2)) = ANY($1)`,
  [bases]
);
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');
const porGrupo = {};
rows.forEach((x) => {
  const k = `prog ${iso(x.prog) || 'sin programación'} · ${x.cava}`;
  (porGrupo[k] = porGrupo[k] || []).push(x.base);
});
console.log(`Crudas en módulo: ${det.filas.length} (${bases.length} animales)`);
Object.entries(porGrupo)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([k, v]) => console.log(`  ${String(v.length).padStart(3)}  ${k}${v.length <= 10 ? '  → ' + v.join(', ') : ''}`));
const fuera = det.filas.filter((f) => {
  const x = rows.find((y) => y.base === f.base);
  return !x || iso(x.prog) !== fecha;
});
console.log(`\nNo programadas para ${fecha}: ${fuera.length}`);
fuera.forEach((f) => console.log(`  ${f.codigo} · puesto ${f.puesto} · ${f.opl} · ${f.cliente}`));
await client.end();
