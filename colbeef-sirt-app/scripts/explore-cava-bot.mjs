import pg from 'pg';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

function envStr(key) {
  const v = process.env[key];
  return v === undefined || v === null ? '' : String(v);
}

const pool = new pg.Pool({
  host: envStr('POSTGRES_HOST'),
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: envStr('POSTGRES_DB'),
  user: envStr('POSTGRES_USER'),
  password: envStr('POSTGRES_PASSWORD'),
  connectionTimeoutMillis: 15000,
});

async function run() {
  try {
    const tipos = await pool.query(`
      SELECT id, nombre FROM trazabilidad_proceso.tipo_parte_producto
      WHERE nombre ILIKE '%cava%' OR nombre ILIKE '%visc%' OR nombre ILIKE '%pata%'
         OR nombre ILIKE '%lengua%' OR nombre ILIKE '%canal%' OR nombre ILIKE '%cabeza%'
         OR nombre ILIKE '%corte%' OR nombre ILIKE '%mano%' OR nombre ILIKE '%media%'
      ORDER BY nombre
    `);
    console.log('=== TIPOS DE PRODUCTO RELEVANTES ===');
    console.log(JSON.stringify(tipos.rows, null, 2));

    const cols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='trazabilidad_proceso' AND table_name='parte_producto_cava_riel'
      ORDER BY ordinal_position
    `);
    console.log('\n=== COLUMNAS parte_producto_cava_riel ===');
    console.log(JSON.stringify(cols.rows, null, 2));

    const enCava = await pool.query(`
      SELECT tpp.nombre AS tipo, COUNT(*)::int AS cantidad
      FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
      JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
      JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
      WHERE ppcr.fecha_salida IS NULL
        AND ppcr.fecha_ingreso >= (CURRENT_DATE - 30)
      GROUP BY tpp.nombre
      ORDER BY cantidad DESC
    `);
    console.log('\n=== PRODUCTOS EN CAVA AHORA (por tipo) ===');
    console.log(JSON.stringify(enCava.rows, null, 2));

    const tresDias = await pool.query(`
      SELECT tpp.nombre AS tipo, COUNT(*)::int AS cantidad
      FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
      JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
      JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
      WHERE ppcr.fecha_salida IS NULL
        AND ppcr.fecha_ingreso::date = CURRENT_DATE - 3
      GROUP BY tpp.nombre
      ORDER BY cantidad DESC
    `);
    console.log('\n=== PRODUCTOS CON EXACTAMENTE 3 DIAS EN CAVA ===');
    console.log(JSON.stringify(tresDias.rows, null, 2));

    const allTipos = await pool.query(`SELECT id, nombre FROM trazabilidad_proceso.tipo_parte_producto ORDER BY nombre`);
    console.log('\n=== TODOS LOS TIPOS (total: ' + allTipos.rows.length + ') ===');
    console.log(JSON.stringify(allTipos.rows, null, 2));

    const vencCols = await pool.query(`
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE column_name ILIKE '%vencim%' OR column_name ILIKE '%fecha_venc%'
      ORDER BY table_schema, table_name
      LIMIT 80
    `);
    console.log('\n=== COLUMNAS CON VENCIMIENTO ===');
    console.log(JSON.stringify(vencCols.rows, null, 2));

    const cavas = await pool.query(`SELECT id, nombre FROM trazabilidad_proceso.cava ORDER BY id`);
    console.log('\n=== CAVAS ===');
    console.log(JSON.stringify(cavas.rows, null, 2));

    const sample = await pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text) AS codigo,
        tpp.nombre AS tipo,
        ppcr.fecha_ingreso,
        CURRENT_DATE - ppcr.fecha_ingreso::date AS dias_en_cava,
        c.nombre AS cava,
        pp.observaciones
      FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
      JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
      JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
      LEFT JOIN trazabilidad_proceso.cava c ON c.id = ppcr.id_cava
      WHERE ppcr.fecha_salida IS NULL
        AND ppcr.fecha_ingreso::date = CURRENT_DATE - 3
      LIMIT 10
    `);
    console.log('\n=== MUESTRA PRODUCTOS 3 DIAS EN CAVA ===');
    console.log(JSON.stringify(sample.rows, null, 2));

    // Search for media canal / lengua in product descriptions or views
    const mediaCanal = await pool.query(`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_schema IN ('trazabilidad_proceso', 'a_trazabilidad_proceso', 'desposte', 'inventario')
        AND (table_name ILIKE '%cava%' OR table_name ILIKE '%canal%' OR table_name ILIKE '%corte%' OR table_name ILIKE '%lengua%' OR table_name ILIKE '%venc%')
      ORDER BY table_schema, table_name
    `);
    console.log('\n=== TABLAS RELACIONADAS ===');
    console.log(JSON.stringify(mediaCanal.rows, null, 2));

    const vwCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='trazabilidad_proceso' AND table_name='vw_pbi01'
      ORDER BY ordinal_position
    `);
    console.log('\n=== COLUMNAS vw_pbi01 ===');
    console.log(JSON.stringify(vwCols.rows.map(r => r.column_name)));

  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

run();
