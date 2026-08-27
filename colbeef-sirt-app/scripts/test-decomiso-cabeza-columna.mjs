/**
 * Cabeza decomisada sin fila en programados debe contar 1 en las 4 columnas.
 * node scripts/test-decomiso-cabeza-columna.mjs
 */
import assert from 'assert';
import { construirResumenDespachosDesdeFilas } from '../server/gestor/engine.js';

const puesto = '08203/Temp 2 Florida/JxV/';
const base = '2608-08203';
const filas = [
  ['', '', '', `${base}-PM`, 'PROP', '', '', 'Patas y Manos', 'Florida', puesto],
  ['', '', '', `${base}-VB`, 'PROP', '', '', 'Visceras Blancas', 'Florida', puesto],
  ['', '', '', `${base}-VR`, 'PROP', '', '', 'Visceras Rojas', 'Florida', puesto],
];
const reporte = [[`${base}-C`, '2026-08-27', 'Cabeza', '', 'CAUSA TEST', '', 'Cabeza']];

const res = construirResumenDespachosDesdeFilas(filas, 'JxV', reporte);
const row = res.resultado.find((r) => r.puesto.includes('08203'));
assert.ok(row, 'debe existir fila del puesto 08203');
assert.strictEqual(row.Cabeza, 1, 'Cabeza debe contar 1 por decomiso');
assert.strictEqual(row['Patas y Manos'], 1);
assert.strictEqual(row['Visceras Blancas'], 1);
assert.strictEqual(row['Visceras Rojas'], 1);
assert.strictEqual(row.incompletoCantidades, false, 'no debe marcar incompleto');
assert.strictEqual(row.incompletoPorDecomiso, true);
assert.strictEqual(row.decomisoPorTipo.Cabeza, 1);
assert.strictEqual(row.Juegos, 1, 'juego completo con cabeza decomisada');
console.log('test-decomiso-cabeza-columna: ok');
