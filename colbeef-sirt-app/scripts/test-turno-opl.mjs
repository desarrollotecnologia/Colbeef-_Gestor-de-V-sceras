/**
 * Turno operativo: excluye otros sufijos, normaliza turno detectado.
 * node scripts/test-turno-opl.mjs
 */
import assert from 'assert';
import {
  detectarTurnoDesdeDatos,
  filasDespachoTurnoOperacion,
  resolverTurnoOperacion,
} from '../server/gestor/engineUtils.js';

const filas = [
  ['', '', '', '1', 'P', '', '', 'VR', '', '01028/BUCA/CALLE/'],
  ['', '', '', '2', 'P', '', '', 'VR', '', '01028/BUCA/CALLE/JxV/'],
  ['', '', '', '3', 'P', '', '', 'VR', '', '01028/BUCA/CALLE/LxM/'],
];

assert.strictEqual(detectarTurnoDesdeDatos(filas, '2026-06-11'), 'JxV');

const jxv = filasDespachoTurnoOperacion(filas, 'JxV');
assert.strictEqual(jxv.length, 2, 'sin LxM; incluye sin sufijo + JxV');
assert.ok(jxv[0][9].includes('JxV'), 'asigna JxV al puesto sin sufijo');

assert.strictEqual(
  resolverTurnoOperacion({ from: '2026-06-11' }, filas),
  'JxV',
  'turno desde datos Despachos_Cavas'
);

// Puesto SIRT sin sufijo de turno → juegos OPL tras normalizar (4 piezas = 1 juego)
import { contarJuegosCompletosPorClave } from '../server/gestor/engine.js';
const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const animal = '2606-12001';
const sinSufijo = filasDespachoTurnoOperacion(
  [
    ['', '', '', `${animal}-1`, 'PROP A', '', '', 'Visceras Rojas', '', '01028/BUCA/CALLE/'],
    ['', '', '', `${animal}-2`, 'PROP A', '', '', 'Cabeza', '', '01028/BUCA/CALLE/'],
    ['', '', '', `${animal}-3`, 'PROP A', '', '', 'Visceras Blancas', '', '01028/BUCA/CALLE/'],
    ['', '', '', `${animal}-4`, 'PROP A', '', '', 'Patas y Manos', '', '01028/BUCA/CALLE/'],
  ],
  'JxV'
);
assert.strictEqual(
  contarJuegosCompletosPorClave(sinSufijo, cols, () => 'OPL-X', '')[ 'OPL-X'],
  1,
  'OPL cuenta juegos aunque puesto no traiga JxV en SIRT'
);

console.log('test-turno-opl: ok');
