/**
 * Comprueba cruce decomisos tolerante (normalización + codigoBase).
 * node scripts/test-decomiso-cruce.mjs
 */
import assert from 'assert';
import {
  construirMapaReporteDecomisos,
  productoDecomisoDesdeMapa,
} from '../server/gestor/engineUtils.js';

const reporte = [
  ['ABC-1', '2026-01-01', 'Hígado'],
  ['2602-06503', '2026-01-01', 'Corazón'],
];
const mapa = construirMapaReporteDecomisos(reporte);
assert.strictEqual(productoDecomisoDesdeMapa(mapa, 'abc-1'), 'Hígado', 'case insensitive');
assert.strictEqual(productoDecomisoDesdeMapa(mapa, '2602-06503-60'), 'Corazón', 'base lote');
console.log('test-decomiso-cruce: ok');
