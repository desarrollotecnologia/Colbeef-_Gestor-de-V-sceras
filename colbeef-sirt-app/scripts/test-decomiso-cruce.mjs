/**
 * Comprueba cruce decomisos tolerante (normalización + codigoBase).
 * node scripts/test-decomiso-cruce.mjs
 */
import assert from 'assert';
import {
  construirMapaReporteDecomisos,
  productoDecomisoDesdeMapa,
  parsePuestoOperacion,
  claveAgrupacionPuesto,
  filasDespachoTurnoOperacion,
  isodowDesdeFechaISO,
  detectarTurnoPorFechaISO,
  construirIndiceDecomisosVw,
  decomisoInfoDesdeVw,
} from '../server/gestor/engineUtils.js';

const reporte = [
  ['ABC-1', '2026-01-01', 'Hígado'],
  ['2602-06503', '2026-01-01', 'Corazón'],
];
const mapa = construirMapaReporteDecomisos(reporte);
assert.strictEqual(productoDecomisoDesdeMapa(mapa, 'abc-1'), 'Hígado', 'case insensitive');
assert.strictEqual(productoDecomisoDesdeMapa(mapa, '2602-06503-60'), 'Corazón', 'base lote');
const ruta = '01028/BUCARAMANGA/CALLE 1/LxM/';
const po = parsePuestoOperacion(ruta);
assert.strictEqual(po.etiqueta, '1028 · BUCARAMANGA');
assert.strictEqual(claveAgrupacionPuesto(ruta), '1028|BUCARAMANGA');
assert.notStrictEqual(
  claveAgrupacionPuesto('01028/BUCARAMANGA/A'),
  claveAgrupacionPuesto('01028/GIRON/B')
);
assert.strictEqual(isodowDesdeFechaISO('2026-06-02'), 2);
assert.strictEqual(detectarTurnoPorFechaISO('2026-06-02'), 'MxM');
const idx = construirIndiceDecomisosVw([{ codigo_animal: '2605-12622', tipo_parte: 'Hígado' }]);
assert.ok(decomisoInfoDesdeVw(idx, '2605-12622-60'));
const filasSinTurno = [
  ['', '', '', '2602-06503-1', 'PROP', '', '', 'Cabeza', 'Bucaramanga', '01009/Bucaramanga/'],
];
const turnoMxJ = 'MxJ';
const neto = filasDespachoTurnoOperacion(filasSinTurno, turnoMxJ);
assert.ok(String(neto[0][9]).includes('MxJ'), 'turno debe normalizarse en la ruta');
assert.strictEqual(
  claveAgrupacionPuesto('01009/Bucaramanga/MxJ/'),
  claveAgrupacionPuesto(neto[0][9])
);
assert.ok(!String(filasSinTurno[0][9]).includes('MxJ'), 'SIRT puede traer ruta sin sufijo de turno');
console.log('test-decomiso-cruce: ok');
