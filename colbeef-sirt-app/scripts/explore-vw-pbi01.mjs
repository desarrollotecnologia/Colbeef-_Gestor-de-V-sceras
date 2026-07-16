import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const p = new pg.Pool({
  host: process.env.POSTGRES_HOST, port: 5432, database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER, password: String(process.env.POSTGRES_PASSWORD || ''),
});
const r = await p.query(`
  SELECT nombre_parte, COUNT(*)::int AS c
  FROM trazabilidad_proceso.vw_pbi01
  WHERE fecha_salida_cava IS NULL AND dias_en_cava = 3
    AND nombre_parte IN ('Lengua','Media Canal 1 ','Media Canal 2 Cola','Patas y Manos','Visceras Blancas','Visceras Rojas','Cabeza')
  GROUP BY nombre_parte
`);
console.log('VW_PBI01 dias_en_cava=3:', JSON.stringify(r.rows, null, 2));
await p.end();
