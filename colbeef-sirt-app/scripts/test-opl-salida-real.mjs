/**
 * OPL: pendientes = en cava turno; despachados = salida real (fecha_salida) del turno.
 * node scripts/test-opl-salida-real.mjs
 */
import assert from 'assert';
import {
  contarJuegosCompletosPorClave,
  construirProgresoOplDesdeDespachos,
} from '../server/gestor/engine.js';
import { filasDespachoTurnoOperacion, despachosProgramadosSinSalidasDelDia } from '../server/gestor/engineUtils.js';

const cols = { id: 3, tipo: 7, prop: 4, puesto: 9 };
const turno = 'JxV';
const puesto = 'MSASO/La Cumbre/';
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
  c[0] = '2026-06-11';
  return c;
});
const enCava = juego(animalEnCava);

const salidasTurno = filasDespachoTurnoOperacion(salidas, turno);
const progNeto = despachosProgramadosSinSalidasDelDia(
  filasDespachoTurnoOperacion(enCava, turno),
  salidasTurno
);

const prog = contarJuegosCompletosPorClave(progNeto, cols, () => opl, '');
const sal = contarJuegosCompletosPorClave(salidasTurno, cols, () => opl, '');

assert.strictEqual(prog[opl], 1, '1 juego pendiente en cava');
assert.strictEqual(sal[opl], 1, '1 juego con salida real');
assert.strictEqual((prog[opl] || 0) + (sal[opl] || 0), 2, 'total turno = en cava + salidos');

const pack = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-06-11', to: '2026-06-11' },
    despachosCavas: enCava,
    salidasCavaDia: salidas,
    oplConfig: [{ propietario: prop, opl, total: 0 }],
    resumenDespachos: {
      turno,
      resultado: [
        {
          puesto: puesto,
          Juegos: 1,
          juegosPorOpl: { [opl]: 1 },
        },
      ],
    },
  },
  turno,
  '11/06/2026 16:00'
);
const row = pack.todosOPL.find((p) => p.opl === opl);
assert.ok(row, 'OPL presente');
assert.strictEqual(row.total, 2);
assert.strictEqual(row.despachados, 1);
assert.strictEqual(row.pendientes, 1);
assert.strictEqual(row.progreso, 50);
assert.strictEqual(pack.operacionFinalizada, false, 'no debe marcar operación finalizada');

console.log('test-opl-salida-real: ok');
