import pg from 'pg';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });
function envStr(k) { return String(process.env[k] || ''); }
const pool = new pg.Pool({
  host: envStr('POSTGRES_HOST'),
  port: 5432,
  database: envStr('POSTGRES_DB'),
  user: envStr('POSTGRES_USER'),
  password: envStr('POSTGRES_PASSWORD'),
});

async function q(label, sql, params = []) {
  const r = await pool.query(sql, params);
  console.log('\n=== ' + label + ' ===');
  console.log(JSON.stringify(r.rows, null, 2));
}

await q('MEDIA CANAL EN CAVA (todos)', `
  SELECT tpp.nombre AS tipo, COUNT(*)::int AS cantidad
  FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
  JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
  JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
  WHERE ppcr.fecha_salida IS NULL AND tpp.nombre ILIKE '%Media Canal%'
  GROUP BY tpp.nombre
`);

await q('MEDIA CANAL EN CAVA POR DIAS', `
  SELECT tpp.nombre AS tipo, CURRENT_DATE - ppcr.fecha_ingreso::date AS dias, COUNT(*)::int AS cantidad
  FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
  JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
  JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
  WHERE ppcr.fecha_salida IS NULL AND tpp.nombre ILIKE '%Media Canal%'
  GROUP BY tpp.nombre, dias ORDER BY dias DESC LIMIT 15
`);

await q('TIPO_PARTE_PRODUCTO_CAVA (productos clave)', `
  SELECT tpp.id, tpp.nombre AS tipo_producto, c.id AS id_cava, c.nombre AS cava
  FROM trazabilidad_proceso.tipo_parte_producto_cava tppc
  JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = tppc.id_tipo_parte_producto
  JOIN trazabilidad_proceso.cava c ON c.id = tppc.id_cava
  WHERE tpp.nombre ILIKE '%Media%' OR tpp.nombre ILIKE '%Lengua%' OR tpp.nombre ILIKE '%Visc%'
     OR tpp.nombre ILIKE '%Pata%' OR tpp.nombre ILIKE '%Cabeza%'
  ORDER BY tpp.nombre, c.nombre
`);

await q('COLUMNAS DESPOSTE', `
  SELECT table_name, column_name, data_type FROM information_schema.columns
  WHERE table_schema='desposte' AND table_name IN ('producto_desposte','caja','cava_desposte')
  ORDER BY table_name, ordinal_position
`);

await q('CORTES POR VENCER (producto_desposte)', `
  SELECT pd.id, nc.nombre AS corte, pd.fecha_vencimiento, cd.nombre AS cava_desposte,
         pd.fecha_vencimiento::date - CURRENT_DATE AS dias_hasta_vencimiento
  FROM desposte.producto_desposte pd
  JOIN desposte.nombre_corte nc ON nc.id = pd.id_nombre_corte
  LEFT JOIN desposte.cava_desposte cd ON cd.id = pd.id_cava_desposte
  WHERE pd.fecha_vencimiento IS NOT NULL
    AND pd.fecha_vencimiento::date <= CURRENT_DATE + 3
  ORDER BY pd.fecha_vencimiento
  LIMIT 15
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

await q('QUERY REPORTE 3 DIAS (productos clave)', `
  SELECT
    COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text) AS codigo,
    TRIM(tpp.nombre) AS tipo_producto,
    COALESCE(NULLIF(TRIM(e3.nombre), ''), 'SIN PROPIETARIO') AS propietario,
    ppcr.fecha_ingreso,
    CURRENT_DATE - ppcr.fecha_ingreso::date AS dias_en_cava,
    COALESCE(c.nombre, '') AS cava,
    COALESCE(ppcr.id_riel::text, '') AS riel,
    COALESCE(s.nombre, '') AS sucursal,
    COALESCE(de.nombre, '') AS destino,
    COALESCE(pp.observaciones, '') AS observaciones
  FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
  JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
  JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
  JOIN trazabilidad_proceso.producto p ON p.id::text = pp.id_producto::text
  JOIN trazabilidad_proceso.producto_empresa pe ON pe.id_producto::text = p.id::text AND pe.activo = true
  JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
  LEFT JOIN trazabilidad_proceso.cava c ON c.id = ppcr.id_cava
  LEFT JOIN trazabilidad_proceso.parte_producto_empresa ppe ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
  LEFT JOIN trazabilidad_proceso.parte_producto_empresa_local ppel ON ppel.id_parte_producto_empresa = ppe.id
  LEFT JOIN organizaciones.sucursal s ON s.id = ppel.id_local
  LEFT JOIN trazabilidad_proceso.destino de ON de.id = s.id_destino
  WHERE ppcr.fecha_salida IS NULL
    AND ppcr.fecha_ingreso::date = CURRENT_DATE - 3
    AND TRIM(tpp.nombre) IN (
      'Lengua', 'Media Canal 1', 'Media Canal 1 ', 'Media Canal 2 Cola',
      'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas', 'Cabeza'
    )
  ORDER BY tipo_producto, codigo
  LIMIT 20
`);

await pool.end();
