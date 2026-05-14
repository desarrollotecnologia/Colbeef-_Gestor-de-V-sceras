import { query } from '../server/db.js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const d = process.argv[2] || '2026-05-14';
const r1 = await query('SELECT COUNT(*)::int AS n FROM sai.decomiso WHERE fecha_registro = $1::date', [d]);
const r2 = await query('SELECT COUNT(*)::int AS n FROM sai.decomiso WHERE fecha_salida = $1::date', [d]);
const r3 = await query(
  'SELECT COUNT(*)::int AS n FROM sai.decomiso WHERE fecha_registro BETWEEN $1::date - 1 AND $1::date + 1',
  [d]
);
const r4 = await query(
  'SELECT COUNT(*)::int AS n FROM sai.decomiso WHERE COALESCE(fecha_salida, fecha_registro) = $1::date',
  [d]
);
const r5 = await query(
  'SELECT COUNT(*)::int AS n FROM sai.decomiso WHERE fecha_registro = $1::date OR fecha_salida = $1::date',
  [d]
);
console.log('fecha', d);
console.log('count fecha_registro =', d, r1.rows[0].n);
console.log('count fecha_salida =', d, r2.rows[0].n);
console.log('count registro in [d-1,d+1]', r3.rows[0].n);
console.log('count COALESCE(salida,registro)=', d, r4.rows[0].n);
console.log('count registro OR salida =', d, r5.rows[0].n);

for (const day of ['2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16']) {
  const r = await query('SELECT COUNT(*)::int AS n FROM sai.decomiso WHERE fecha_registro = $1::date', [day]);
  console.log('  per-day fecha_registro', day, r.rows[0].n);
}
process.exit(0);
