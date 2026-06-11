/**
 * Progreso OPL: conteo por juego completo (4 subproductos por animal).
 * node scripts/test-opl-juego.mjs
 */
import assert from 'assert';
import { contarJuegosCompletosPorClave } from '../server/gestor/engine.js';

const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const turno = 'LxM';
const puesto = '01028/BUCARAMANGA/CALLE 1/LxM/';
const animal = '2606-12001';

const juegoCompleto = [
  ['', '', '', `${animal}-1`, 'PROP A', '', '', 'Visceras Rojas', '', puesto],
  ['', '', '', `${animal}-2`, 'PROP A', '', '', 'Cabeza', '', puesto],
  ['', '', '', `${animal}-3`, 'PROP A', '', '', 'Visceras Blancas', '', puesto],
  ['', '', '', `${animal}-4`, 'PROP A', '', '', 'Patas y Manos', '', puesto],
];

const conteo = contarJuegosCompletosPorClave(juegoCompleto, cols, () => 'OPL-X', turno);
assert.strictEqual(conteo['OPL-X'], 1, 'cuenta un juego cuando hay 4 subproductos del mismo animal');

const incompleto = juegoCompleto.slice(0, 2);
assert.strictEqual(
  contarJuegosCompletosPorClave(incompleto, cols, () => 'OPL-X', turno)['OPL-X'] || 0,
  0,
  'sin juego completo si faltan subproductos'
);

const dupes = juegoCompleto.concat([
  ['', '', '', `${animal}-1`, 'PROP A', '', '', 'Visceras Rojas', '', puesto],
]);
assert.strictEqual(
  contarJuegosCompletosPorClave(dupes, cols, () => 'OPL-X', turno)['OPL-X'],
  1,
  'filas duplicadas no duplican el juego'
);

const salidas = [
  ['2026-06-10', '', '', `${animal}-1`, 'PROP A', '', '', 'Visceras Rojas', '', puesto],
  ['2026-06-10', '', '', `${animal}-2`, 'PROP A', '', '', 'Cabeza', '', puesto],
  ['2026-06-10', '', '', `${animal}-3`, 'PROP A', '', '', 'Visceras Blancas', '', puesto],
  ['2026-06-10', '', '', `${animal}-4`, 'PROP A', '', '', 'Patas y Manos', '', puesto],
];
const desp = contarJuegosCompletosPorClave(salidas, cols, () => 'OPL-X', '');
assert.strictEqual(desp['OPL-X'], 1, 'salida física de juego completo suma 1');

const salidaParcial = salidas.slice(0, 2);
assert.strictEqual(
  contarJuegosCompletosPorClave(salidaParcial, cols, () => 'OPL-X', '')['OPL-X'] || 0,
  0,
  'salida parcial no cuenta como juego despachado'
);

console.log('test-opl-juego: ok');
