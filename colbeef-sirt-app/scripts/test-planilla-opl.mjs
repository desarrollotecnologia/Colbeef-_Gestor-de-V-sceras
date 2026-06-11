/**
 * Planilla: OPL por propietario real, etiqueta de puesto en zonas.
 * node scripts/test-planilla-opl.mjs
 */
import assert from 'assert';
import { contarJuegosCompletosPorClave } from '../server/gestor/engine.js';
import { parsePuestoOperacion, filasDespachoTurnoOperacion } from '../server/gestor/engineUtils.js';

const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const turno = 'JxV';
const puesto = '557/BUCARAMANGA/CALLE 1/JxV/';
const animalA = '2606-12001';
const animalB = '2606-12002';

const filas = filasDespachoTurnoOperacion(
  [
    ...['Visceras Rojas', 'Cabeza', 'Visceras Blancas', 'Patas y Manos'].map((tipo, i) => [
      '',
      '',
      '',
      `${animalA}-${i + 1}`,
      'PROP A',
      '',
      '',
      tipo,
      '',
      puesto,
    ]),
    ...['Visceras Rojas', 'Cabeza', 'Visceras Blancas', 'Patas y Manos'].map((tipo, i) => [
      '',
      '',
      '',
      `${animalB}-${i + 1}`,
      'PROP B',
      '',
      '',
      tipo,
      '',
      puesto,
    ]),
  ],
  turno
);

const mapa = { 'PROP A': 'OPL-A', 'PROP B': 'OPL-B' };
const porOpl = contarJuegosCompletosPorClave(
  filas,
  cols,
  (f) => mapa[String(f[4] ?? '').trim().toUpperCase()] || 'TRANSCARNES',
  ''
);
assert.strictEqual(porOpl['OPL-A'], 1);
assert.strictEqual(porOpl['OPL-B'], 1);

const po = parsePuestoOperacion('557/BUCARAMANGA/CALLE 1/JxV/');
assert.strictEqual(po.etiqueta, '557 · BUCARAMANGA');
assert.notStrictEqual(po.etiqueta, '557', 'etiqueta incluye ciudad, no solo código');

console.log('test-planilla-opl: ok');
