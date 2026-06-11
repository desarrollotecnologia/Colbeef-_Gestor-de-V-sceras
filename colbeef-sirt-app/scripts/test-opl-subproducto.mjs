/**
 * Progreso OPL cuenta piezas (subproductos), no juegos completos.
 * node scripts/test-opl-subproducto.mjs
 */
import assert from 'assert';
import { contarSubproductosPorClave } from '../server/gestor/engine.js';

const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const turno = 'LxM';
const puesto = '01028/BUCARAMANGA/CALLE 1/LxM/';

const filas = [
  ['', '', '', '2606-001', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
  ['', '', '', '2606-001', 'PROP A', '', '', 'Cabeza', '', puesto],
  ['', '', '', '2606-002', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
];

const conteo = contarSubproductosPorClave(filas, cols, (f) => 'OPL-X', turno);
assert.strictEqual(conteo['OPL-X'], 3, 'cuenta cada subproducto, no exige juego completo');

const salidas = [
  ['', '', '', '2606-001', 'PROP A', '', '', 'Visceras Rojas', '', puesto],
];
const desp = contarSubproductosPorClave(salidas, cols, (f) => 'OPL-X', '');
assert.strictEqual(desp['OPL-X'], 1, 'salida física de una pieza suma 1');

console.log('test-opl-subproducto: ok');
