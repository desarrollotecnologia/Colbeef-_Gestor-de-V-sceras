import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const p = new pg.Pool({
  host: process.env.POSTGRES_HOST, port: 5432, database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER, password: String(process.env.POSTGRES_PASSWORD || ''),
});
const r = await p.query(`
  SELECT ubicacion, COUNT(*)::int AS c
  FROM trazabilidad_proceso.vw_pbi05
  WHERE fecha_vencimiento IS NOT NULL AND fecha_vencimiento::date <= CURRENT_DATE + 3
  GROUP BY ubicacion ORDER BY c DESC
`);
console.log('POR UBICACION:', JSON.stringify(r.rows, null, 2));
const r2 = await p.query(`
  SELECT lote_interno, descripcion_productos, fecha_produccion, fecha_vencimiento,
         CURRENT_DATE - fecha_produccion::date AS dias_desde_produccion,
         fecha_vencimiento::date - CURRENT_DATE AS dias_hasta_vencimiento
  FROM trazabilidad_proceso.vw_pbi05
  WHERE ubicacion ILIKE '%cava%' AND fecha_vencimiento::date <= CURRENT_DATE + 3
  ORDER BY fecha_vencimiento LIMIT 15
`);
console.log('CORTES EN CAVA:', JSON.stringify(r2.rows, null, 2));
await p.end();
