/**
 * Diagnóstico OPL en vivo: en cava vs salida real del turno.
 * node scripts/diag-opl-live.mjs [YYYY-MM-DD]
 */
import 'dotenv/config';
import {
  fetchDespachosCavasRows,
  fetchDespachosCavaRielRows,
} from '../server/gestor/sirtSync.js';
import {
  filasDespachoTurnoOperacion,
  resolverTurnoOperacion,
} from '../server/gestor/engineUtils.js';
import { contarJuegosCompletosPorClave } from '../server/gestor/engine.js';
import { OPL_DEFAULT, OPL_EXCEPCIONES_DEFAULT } from '../server/gestor/constants.js';

const fecha = process.argv[2] || '2026-06-11';
const filtro = { from: fecha, to: fecha };
const mapaOPL = {};
OPL_EXCEPCIONES_DEFAULT.forEach(([p, o]) => {
  mapaOPL[String(p).trim().toUpperCase()] = o;
});
const turno = resolverTurnoOperacion(filtro, []);

const [prog, sal] = await Promise.all([
  fetchDespachosCavasRows(filtro),
  fetchDespachosCavaRielRows(filtro),
]);

const progTurno = filasDespachoTurnoOperacion(prog, turno);
const salTurno = filasDespachoTurnoOperacion(sal, turno);
const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const claveOpl = (f) => mapaOPL[String(f[4] || '').trim().toUpperCase()] || OPL_DEFAULT;

const enCava = contarJuegosCompletosPorClave(progTurno, cols, claveOpl, '');
const salidos = contarJuegosCompletosPorClave(salTurno, cols, claveOpl, '');

console.log('fecha:', fecha, 'turno:', turno);
console.log('filas programadas (en cava):', progTurno.length, '→ juegos:', Object.values(enCava).reduce((a, b) => a + b, 0));
console.log('filas salida real:', salTurno.length, '→ juegos:', Object.values(salidos).reduce((a, b) => a + b, 0));
console.log('\nTop OPL (pendientes | despachados | total):');
const opls = new Set([...Object.keys(enCava), ...Object.keys(salidos)]);
[...opls]
  .map((opl) => ({
    opl,
    pend: enCava[opl] || 0,
    sal: salidos[opl] || 0,
    tot: (enCava[opl] || 0) + (salidos[opl] || 0),
  }))
  .sort((a, b) => b.tot - a.tot)
  .slice(0, 8)
  .forEach((r) => {
    const pct = r.tot ? Math.round((r.sal / r.tot) * 100) : 0;
    console.log(`  ${r.opl}: ${r.pend} pend | ${r.sal} sal | ${r.tot} tot (${pct}%)`);
  });
