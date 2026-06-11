/**
 * Progreso OPL: conteo por subproducto, sin duplicar salidas.
 * node scripts/test-opl-subproducto.mjs
 */
import assert from 'assert';
import { contarSubproductosPorClave } from '../server/gestor/engine.js';
import { despachosProgramadosSinSalidasDelDia } from '../server/gestor/engineUtils.js';

const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const turno = 'LxM';
const puesto = '01028/BUCARAMANGA/CALLE 1/LxM/';

const filas = [
  ['', '', '', '2606-12001-1', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
  ['', '', '', '2606-12001-1', 'PROP A', '', '', 'Cabeza', '', puesto],
  ['', '', '', '2606-12002-1', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
];

const conteo = contarSubproductosPorClave(filas, cols, (f) => 'OPL-X', turno);
assert.strictEqual(conteo['OPL-X'], 3, 'cuenta cada subproducto, no exige juego completo');

const dupes = [
  ['', '', '', '2606-12001-1', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
  ['', '', '', '2606-12001-1', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
];
assert.strictEqual(
  contarSubproductosPorClave(dupes, cols, (f) => 'OPL-X', turno)['OPL-X'],
  1,
  'filas duplicadas del mismo subproducto cuentan una vez'
);

const salidas = [
  ['2026-06-10', '', '', '2606-12001-1', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
];
const desp = contarSubproductosPorClave(salidas, cols, (f) => 'OPL-X', '');
assert.strictEqual(desp['OPL-X'], 1, 'salida física de una pieza suma 1');

const programadosObsoletos = [
  ['', '', '', '2606-12001-1', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
  ['', '', '', '2606-12001-1', 'PROP A', '', '', 'Cabeza', '', puesto],
];
const neto = despachosProgramadosSinSalidasDelDia(programadosObsoletos, salidas);
assert.strictEqual(neto.length, 1, 'quita de pendientes lo que ya salió');
assert.strictEqual(neto[0][7], 'Cabeza');

const pend = contarSubproductosPorClave(neto, cols, (f) => 'OPL-X', turno);
assert.strictEqual(pend['OPL-X'], 1, 'pendientes netos');
assert.strictEqual(pend['OPL-X'] + desp['OPL-X'], 2, 'unión operación sin doble conteo de VR despachada');

// Total fijo = baseline; pendientes = total - despachados
const totalOperacion = 10;
const despachadosSim = 7;
const pendientesSim = Math.max(0, totalOperacion - despachadosSim);
assert.strictEqual(pendientesSim, 3, 'pendientes = total operación - despachados');

console.log('test-opl-subproducto: ok');
