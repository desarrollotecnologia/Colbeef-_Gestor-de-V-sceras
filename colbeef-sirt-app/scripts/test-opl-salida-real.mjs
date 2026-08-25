/**
 * OPL: pendientes = en cava turno; despachados = meta congelada − pendientes.
 * node scripts/test-opl-salida-real.mjs
 */
import assert from 'assert';
import { construirProgresoOplDesdeDespachos } from '../server/gestor/engine.js';

const turno = 'JxV';
const puesto = 'MSASO/La Cumbre/JxV/';
const prop = 'CARNES SANTACRUZ S.A.S';
const opl = 'CSZ B/GA';

function juego(animal) {
  return [
    ['', '', '', `${animal}-1`, prop, '', '', 'Visceras Rojas', '', puesto],
    ['', '', '', `${animal}-2`, prop, '', '', 'Cabeza', '', puesto],
    ['', '', '', `${animal}-3`, prop, '', '', 'Visceras Blancas', '', puesto],
    ['', '', '', `${animal}-4`, prop, '', '', 'Patas y Manos', '', puesto],
  ];
}

const animalSalido = '2606-11001';
const animalEnCava = '2606-11002';
const salidas = juego(animalSalido).map((f) => {
  const c = f.slice();
  c[0] = '2026-06-11T10:00:00';
  return c;
});
const enCava = juego(animalEnCava);

const pack = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-06-11', to: '2026-06-11' },
    despachosCavas: enCava,
    salidasCavaDia: salidas,
    // Meta ya vista cuando ambos estaban programados
    oplTotalsJuego: { [opl]: 2 },
    oplBaselineFecha: '2026-06-11',
    oplBaselineTurno: turno,
    oplConfig: [{ propietario: prop, opl, total: 0 }],
    resumenDespachos: { turno, resultado: [] },
  },
  turno,
  '11/06/2026 16:00'
);
const row = pack.todosOPL.find((p) => p.opl === opl);
assert.ok(row, 'OPL presente');
assert.strictEqual(row.total, 2, 'meta congelada 2');
assert.strictEqual(row.pendientes, 1, '1 aún en cava');
assert.strictEqual(row.despachados, 1, '1 = meta − pendientes');
assert.strictEqual(row.progreso, 50);
assert.strictEqual(pack.operacionFinalizada, false, 'no debe marcar operación finalizada');

const packSoloPend = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-06-11', to: '2026-06-11' },
    despachosCavas: [...enCava, ...juego(animalSalido)],
    salidasCavaDia: [],
    oplTotalsJuego: {},
    oplBaselineFecha: '2026-06-11',
    oplBaselineTurno: turno,
    oplConfig: [{ propietario: prop, opl, total: 0 }],
    resumenDespachos: { turno, resultado: [] },
  },
  turno,
  '11/06/2026 10:00'
);
const row2 = packSoloPend.todosOPL.find((p) => p.opl === opl);
assert.ok(row2);
assert.strictEqual(row2.pendientes, 2);
assert.strictEqual(row2.despachados, 0);
assert.strictEqual(row2.progreso, 0);
assert.strictEqual(packSoloPend.operacionFinalizada, false);

console.log('test-opl-salida-real: ok');
