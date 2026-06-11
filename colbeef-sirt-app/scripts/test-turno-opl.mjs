/**
 * Detección de turno y filtro OPL por sufijo (JxV, LxM, …).
 * node scripts/test-turno-opl.mjs
 */
import assert from 'assert';
import {
  detectarTurnoDesdeDatos,
  filtrarFilasPorTurnoOperacion,
  resolverTurnoOperacion,
} from '../server/gestor/engineUtils.js';

const filas = [
  ['', '', '', '1', 'P', '', '', 'VR', '', '01028/BUCA/CALLE/JxV/'],
  ['', '', '', '2', 'P', '', '', 'VR', '', '01028/BUCA/CALLE/JxV/'],
  ['', '', '', '3', 'P', '', '', 'VR', '', '01028/BUCA/CALLE/LxM/'],
];

assert.strictEqual(detectarTurnoDesdeDatos(filas, '2026-06-11'), 'JxV');

const jxv = filtrarFilasPorTurnoOperacion(filas, 'JxV');
assert.strictEqual(jxv.length, 2, 'solo filas con sufijo JxV');

assert.strictEqual(
  resolverTurnoOperacion({ from: '2026-06-11' }, filas),
  'JxV',
  'turno desde datos Despachos_Cavas, no solo calendario'
);

console.log('test-turno-opl: ok');
