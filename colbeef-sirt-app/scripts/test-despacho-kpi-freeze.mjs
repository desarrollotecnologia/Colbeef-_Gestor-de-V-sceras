/**
 * KPIs congelados del tablero: no bajan al despachar, solo si se quita la salida del día.
 * node scripts/test-despacho-kpi-freeze.mjs
 */
import assert from 'assert';
import { actualizarBaselineDespachoKpisSync } from '../server/gestor/engine.js';
import { defaultState } from '../server/gestor/store.js';

const animalA = '2606-90001';
const animalB = '2606-90002';
const puesto = '01009/BUCA/MxJ/';
const turno = 'MxJ';
const fecha = '2026-06-10';

const tipos = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];

function filasJuego(animal, puestoFull) {
  return tipos.map((tipo, i) => [
    '',
    '',
    '',
    `${animal}-${i + 1}`,
    'PROP TEST',
    '',
    '',
    tipo,
    '',
    puestoFull,
  ]);
}

function filasSalida(animal, puestoFull) {
  return filasJuego(animal, puestoFull).map((f) => [`${fecha}`, ...f.slice(1)]);
}

const s = {
  ...defaultState(),
  lastSyncRange: { from: fecha, to: fecha },
  estadoFromRow12: [],
  despachosCavas: [...filasJuego(animalA, puesto), ...filasJuego(animalB, puesto)],
  salidasCavaDia: [],
  reporteDecomisos: [],
};

const frozen1 = actualizarBaselineDespachoKpisSync(s, turno);
assert.strictEqual(frozen1.totalJuegos, 2, 'dos juegos programados');

s.despachosCavas = filasJuego(animalB, puesto);
s.salidasCavaDia = filasSalida(animalA, puesto);
const frozen2 = actualizarBaselineDespachoKpisSync(s, turno);
assert.strictEqual(frozen2.totalJuegos, 2, 'sigue en 2 tras despachar animal A');

s.salidasCavaDia = [];
const frozen3 = actualizarBaselineDespachoKpisSync(s, turno);
assert.strictEqual(frozen3.totalJuegos, 1, 'baja solo si ya no hay salida del día');

console.log('test-despacho-kpi-freeze: ok');
