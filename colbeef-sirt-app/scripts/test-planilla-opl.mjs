/**
 * Planilla: sucursal=puesto, destino=zona (como consulta SIRT del usuario).
 * node scripts/test-planilla-opl.mjs
 */
import assert from 'assert';
import { contarJuegosCompletosPorClave } from '../server/gestor/engine.js';
import { parseLogisticaDespacho, parsePuestoOperacion, filasDespachoTurnoOperacion } from '../server/gestor/engineUtils.js';

const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const turno = 'JxV';
const puesto = `MSASO/Mesa de los Santos/${turno}/`;
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
      'Mesa de los Santos',
      'MSASO/Mesa de los Santos/',
      'MSASO',
      'CRA 10E N 32-8',
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
      'La Cumbre',
      'JM./La Cumbre/',
      'JM.',
      'LOCAL 301',
    ]),
  ],
  turno
);

const log = parseLogisticaDespacho(filas[0]);
assert.strictEqual(log.zona, 'Mesa de los Santos', 'col 8 = destino = zona');
assert.strictEqual(log.sucursal, 'MSASO', 'col 10 = sucursal = puesto');
assert.strictEqual(log.etiqueta, 'MSASO · Mesa de los Santos');

const mapa = { 'PROP A': 'OPL-A', 'PROP B': 'OPL-B' };
const porOpl = contarJuegosCompletosPorClave(
  filas,
  cols,
  (f) => mapa[String(f[4] ?? '').trim().toUpperCase()] || 'TRANSCARNES',
  ''
);
assert.strictEqual(porOpl['OPL-A'], 1);
assert.strictEqual(porOpl['OPL-B'], 1);

const po = parsePuestoOperacion('MSASO/Mesa de los Santos/JxV/');
assert.strictEqual(po.etiqueta, 'MSASO · Mesa de los Santos');

console.log('test-planilla-opl: ok');
