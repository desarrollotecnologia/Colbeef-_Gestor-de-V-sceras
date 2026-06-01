/**
 * Estado en cava sin subproductos que ya salieron el mismo día.
 * node scripts/test-estado-sin-salidas.mjs
 */
import assert from 'assert';
import {
  estadoEnCavaSinSalidasDelDia,
  claveSubproductoEstado,
  claveSubproductoSalida,
} from '../server/gestor/engineUtils.js';

const estado = [
  ['2605-12036-61', 'Visceras Blancas', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['2605-12036-61', 'Cabeza', '', '', '', '', '', '', '', '', '', '', '', ''],
];
const salida = [
  ['28/05/2026', '', '', '2605-12036-61', '', '', '', 'Visceras Blancas', '', 'Puesto A', '', '', ''],
];

assert.strictEqual(
  claveSubproductoEstado(estado[0]),
  claveSubproductoSalida(salida[0]),
  'misma clave estado/salida'
);

const neto = estadoEnCavaSinSalidasDelDia(estado, salida);
assert.strictEqual(neto.length, 1, 'solo queda Cabeza en cava');
assert.strictEqual(neto[0][1], 'Cabeza');
console.log('test-estado-sin-salidas: ok');
