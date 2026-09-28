/**
 * Solo lectura: listado de juegos asignados del día (normales / adicionales) con el motor local.
 * node scripts/probe-juegos-asignados.mjs 2026-09-26
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { consultarJuegosAsignadosDelDia } = await import('../server/gestor/engine.js');
const fecha = process.argv[2] || '2026-09-26';
const r = await consultarJuegosAsignadosDelDia({ from: fecha, to: fecha });
console.log({
  fecha: r.fecha,
  total: r.total,
  normales: r.totalNormales,
  adicionales: r.totalAdicionales,
  adicionalesEnCava: r.adicionalesEnCava,
});
console.table(r.filas.filter((f) => f.adicional).slice(0, 10));
process.exit(0);
