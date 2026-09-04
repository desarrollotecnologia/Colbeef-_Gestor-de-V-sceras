/**
 * Decomiso solo marca; no infla columnas. Pieza faltante → incompleto + detalle.
 * node scripts/test-decomiso-cabeza-columna.mjs
 */
import assert from 'assert';
import { construirResumenDespachosDesdeFilas } from '../server/gestor/engine.js';

// Cabeza decomisada sin fila en programados: no contar, sí marcar incompleto + decomiso.
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
assert.strictEqual(row.Cabeza, 0, 'Cabeza no debe contarse si no está en programados');
assert.strictEqual(row['Patas y Manos'], 1);
assert.strictEqual(row['Visceras Blancas'], 1);
assert.strictEqual(row['Visceras Rojas'], 1);
assert.strictEqual(row.incompletoCantidades, true, 'debe marcar incompleto (rojo)');
assert.strictEqual(row.incompletoPorDecomiso, true);
assert.strictEqual(row.decomisoPorTipo.Cabeza, 1);
assert.strictEqual(row.Juegos, 0, 'sin cabeza no es juego completo');
assert.strictEqual(row.animalesIncompletos, 1);

// Caso 02032: decomiso en piezas que SÍ están → 1-1-1-1, solo marca decomiso.
const puesto2 = '02032/San Francisco/VxS/';
const base2 = '2609-00827';
const filas2 = [
  ['', '', '', `${base2}-C`, 'PROP', '', '', 'Cabeza', 'SF', puesto2],
  ['', '', '', `${base2}-PM`, 'PROP', '', '', 'Patas y Manos', 'SF', puesto2],
  ['', '', '', `${base2}-VB`, 'PROP', '', '', 'Visceras Blancas', 'SF', puesto2],
  ['', '', '', `${base2}-VR`, 'PROP', '', '', 'Visceras Rojas', 'SF', puesto2],
];
const reporte2 = [
  [`${base2}`, '2026-09-04', 'Visceras Blancas', '', 'Estreñimiento', '', ''],
  [`${base2}`, '2026-09-04', 'Visceras Rojas', '', 'Estreñimiento', '', 'Omaso - Librillo'],
];
const res2 = construirResumenDespachosDesdeFilas(filas2, 'VxS', reporte2);
const row2 = res2.resultado.find((r) => r.puesto.includes('02032'));
assert.ok(row2, 'debe existir 02032');
assert.strictEqual(row2.Cabeza, 1);
assert.strictEqual(row2['Patas y Manos'], 1);
assert.strictEqual(row2['Visceras Blancas'], 1);
assert.strictEqual(row2['Visceras Rojas'], 1);
assert.strictEqual(row2.incompletoCantidades, false);
assert.strictEqual(row2.incompletoPorDecomiso, true);
assert.strictEqual(row2.decomisoPorTipo['Visceras Blancas'], 1);
assert.strictEqual(row2.decomisoPorTipo['Visceras Rojas'], 1);
console.log('test-decomiso-cabeza-columna: ok');
