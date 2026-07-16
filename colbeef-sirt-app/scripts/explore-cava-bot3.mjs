import pg from 'pg';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
function envStr(k) { return String(process.env[k] || ''); }
const pool = new pg.Pool({
  host: envStr('POSTGRES_HOST'), port: 5432, database: envStr('POSTGRES_DB'),
  user: envStr('POSTGRES_USER'), password: envStr('POSTGRES_PASSWORD'),
});

async function q(label, sql, params = []) {
  const r = await pool.query(sql, params);
  console.log('\n=== ' + label + ' ===');
  console.log(JSON.stringify(r.rows, null, 2));
}

await q('FK producto_desposte', `
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'desposte' AND tc.table_name = 'producto_desposte'
`);

await q('VW_PBI05 COLUMNAS', `
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='trazabilidad_proceso' AND table_name='vw_pbi05'
  ORDER BY ordinal_position
`);

await q('VW_PBI05 POR VENCER', `
  SELECT * FROM trazabilidad_proceso.vw_pbi05
  WHERE fecha_vencimiento IS NOT NULL AND fecha_vencimiento::date <= CURRENT_DATE + 3
  LIMIT 5
`);

await q('CAJA POR VENCER EN CAVA?', `
  SELECT c.id, c.codigo, nc.nombre AS corte, c.fecha_vencimiento,
         c.fecha_vencimiento::date - CURRENT_DATE AS dias_hasta_vencimiento,
         c.precamara, c.cuarto_canal
  FROM desposte.caja c
  JOIN desposte.lote l ON l.id = c.id_lote
  JOIN desposte.nombre_corte nc ON nc.id = l.id_nombre_corte
  WHERE c.fecha_vencimiento IS NOT NULL
    AND c.fecha_vencimiento::date <= CURRENT_DATE + 3
    AND c.fecha_despacho IS NULL
  ORDER BY c.fecha_vencimiento
  LIMIT 10
`);

await q('PRODUCTO_DESPOSTE POR VENCER', `
  SELECT pd.id, pd.identificacion, nc.nombre AS corte, pd.fecha_vencimiento,
         pd.fecha_vencimiento::date - CURRENT_DATE AS dias_hasta_vencimiento,
         pd.alistamiento, pd.peso
  FROM desposte.producto_desposte pd
  JOIN desposte.nombre_corte nc ON nc.id = pd.id_nombre_corte
  WHERE pd.fecha_vencimiento IS NOT NULL
    AND pd.fecha_vencimiento::date <= CURRENT_DATE + 3
    AND pd.fecha_fin_vigencia IS NULL
  ORDER BY pd.fecha_vencimiento
  LIMIT 10
`);

await q('REPORTE 3 DIAS - RESUMEN', `
  SELECT TRIM(tpp.nombre) AS tipo, COUNT(*)::int AS cantidad
  FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
  JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
  JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
  WHERE ppcr.fecha_salida IS NULL
    AND ppcr.fecha_ingreso::date = CURRENT_DATE - 3
    AND TRIM(tpp.nombre) IN ('Lengua','Media Canal 1','Media Canal 2 Cola','Patas y Manos','Visceras Blancas','Visceras Rojas','Cabeza')
  GROUP BY TRIM(tpp.nombre)
  ORDER BY tipo
`);

await q('VIDA UTIL CORTE', `
  SELECT vuc.*, nc.nombre AS corte FROM desposte.vida_util_corte vuc
  JOIN desposte.nombre_corte nc ON nc.id = vuc.id_nombre_corte
  LIMIT 10
`);

await pool.end();
