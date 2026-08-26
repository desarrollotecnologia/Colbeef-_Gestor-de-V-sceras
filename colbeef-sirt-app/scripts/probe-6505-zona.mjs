/**
 * Observación y zona real de sucursal 6505 (temprana).
 * node scripts/probe-6505-zona.mjs [YYYY-MM-DD]
 */
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: 'C:/Users/CAMPUSLANDS/Colbeef-_Gestor-de-V-sceras-1/colbeef-sirt-app/.env' });

const fecha = String(process.argv[2] || '2026-08-26').trim();

const { query } = await import('../server/db.js');
const { fetchDespachosCavasRows } = await import('../server/gestor/sirtSync.js');
const { formatearCodigoSucursal, parseLogisticaDespacho } = await import('../server/gestor/engineUtils.js');
const { loadPlazasCatalog } = await import('../server/gestor/plazasCatalog.js');

const catalog = loadPlazasCatalog();
const map6505 = Object.entries(catalog.plazasMap).filter(([k]) => k.includes('6505') || k.includes('06505'));
console.log('plazasCatalog 6505:', map6505);

const filas = await fetchDespachosCavasRows({ from: fecha, to: fecha, date: fecha });
const hits = filas.filter((f) => {
  const suc = formatearCodigoSucursal(String(f[10] ?? ''));
  const puesto = String(f[9] ?? '');
  return suc === '6505' || puesto.toUpperCase().includes('6505');
});

console.log('\nProgramados 6505 hoy:', hits.length, 'filas');
const seen = new Set();
for (const f of hits) {
  const log = parseLogisticaDespacho(f);
  const key = `${log.sucursal}|${log.zona}|${f[12]}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log('---');
  console.log('sucursal:', log.sucursal, '| destino SIRT [8]:', f[8], '| zona parse:', log.zona);
  console.log('puesto [9]:', f[9]);
  console.log('observacion [12]:', JSON.stringify(String(f[12] ?? '')));
  console.log('cava:', f[6]);
}

const { rows } = await query(
  `SELECT DISTINCT
      COALESCE(NULLIF(TRIM(s.nombre), ''), 'STOCK') AS sucursal,
      COALESCE(de.nombre, '') AS destino_zona,
      COALESCE(pp.observaciones, '') AS observaciones,
      tpp.nombre AS tipo,
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text) AS codigo
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
    JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel ON ppel.id_parte_producto_empresa = ppe.id
    JOIN organizaciones.sucursal s ON s.id = ppel.id_local
    LEFT JOIN trazabilidad_proceso.destino de ON de.id = s.id_destino
    WHERE ppel.fecha_programacion_despacho::date = $1::date
      AND ppcr.fecha_salida IS NULL
      AND (TRIM(s.nombre) IN ('6505', '06505') OR TRIM(s.nombre) LIKE '%6505%')
    LIMIT 20`,
  [fecha]
);

console.log('\n=== SQL directo ===');
for (const r of rows) {
  console.log({
    sucursal: r.sucursal,
    destino_zona: r.destino_zona,
    observaciones: r.observaciones,
    tipo: r.tipo,
    codigo: r.codigo,
  });
}
