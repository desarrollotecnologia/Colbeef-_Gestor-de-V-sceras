/**
 * OPL: pendientes = programados turno sin salida; despachados = salidas físicas del día.
 * node scripts/test-opl-salida-real.mjs
 */
import assert from 'assert';
import { construirProgresoOplDesdeDespachos, GESTOR_BUILD } from '../server/gestor/engine.js';

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
const cavaPaquete = 'Cava Paquete Visceral 2';
const salidas = juego(animalSalido).map((f) => {
  const c = f.slice();
  c[0] = '2026-06-11T10:00:00';
  c[6] = cavaPaquete;
  return c;
});
const enCava = juego(animalEnCava).map((f) => {
  const c = f.slice();
  c[6] = cavaPaquete;
  return c;
});

// También cuenta pistoleo en Cava Paquete Visceral 1 (mismo prefijo).
const animalSalidoV1 = '2606-11003';
const salidasV1 = juego(animalSalidoV1).map((f) => {
  const c = f.slice();
  c[0] = '2026-06-11T11:00:00';
  c[6] = 'Cava Paquete Visceral 1';
  return c;
});
const pack = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-06-11', to: '2026-06-11' },
    despachosCavas: enCava,
    salidasCavaDia: [...salidas, ...salidasV1],
    // Meta ya vista cuando los tres estaban programados
    oplTotalsJuego: { [opl]: 3 },
    oplBaselineFecha: '2026-06-11',
    oplBaselineTurno: turno,
    oplBaselineBuild: GESTOR_BUILD,
    oplConfig: [{ propietario: prop, opl, total: 0 }],
    resumenDespachos: { turno, resultado: [] },
  },
  turno,
  '11/06/2026 16:00'
);
const row = pack.todosOPL.find((p) => p.opl === opl);
assert.ok(row, 'OPL presente');
assert.strictEqual(row.total, 3, 'TOTAL congelado 3');
assert.strictEqual(row.despachados, 2, '2 salidas paquete visceral 1 y 2');
assert.strictEqual(row.pendientes, 1, 'PENDIENTES = TOTAL − DESPACHADOS');
assert.strictEqual(row.total, row.despachados + row.pendientes, 'desp + pend = total');
assert.strictEqual(row.progreso, 67);
assert.strictEqual(pack.operacionFinalizada, false, 'no debe marcar operación finalizada');

const packSinSalidaReal = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-08-25', to: '2026-08-25' },
    despachosCavas: enCava,
    salidasCavaDia: [],
    oplTotalsJuego: { [opl]: 103 }, // meta ya vista
    oplBaselineFecha: '2026-08-25',
    oplBaselineTurno: turno,
    oplBaselineBuild: GESTOR_BUILD,
    oplConfig: [{ propietario: prop, opl, total: 0 }],
    resumenDespachos: { turno, resultado: [] },
  },
  turno,
  '25/08/2026 08:00'
);
const row3 = packSinSalidaReal.todosOPL.find((p) => p.opl === opl);
assert.ok(row3);
assert.strictEqual(row3.total, 103, 'TOTAL se mantiene en 103');
assert.strictEqual(row3.despachados, 0);
assert.strictEqual(row3.pendientes, 103, 'pendientes = 103 − 0');
assert.strictEqual(row3.progreso, 0);

// Con despachados parciales: TOTAL fijo, pendientes = total − desp
const salidas25 = juego(animalSalido).map((f) => {
  const c = f.slice();
  c[0] = '2026-08-25T12:00:00';
  c[6] = cavaPaquete;
  return c;
});
const packParcial = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-08-25', to: '2026-08-25' },
    despachosCavas: enCava, // 1 pendiente vivo
    salidasCavaDia: salidas25, // 1 despachado del mismo día
    oplTotalsJuego: { [opl]: 103 },
    oplBaselineFecha: '2026-08-25',
    oplBaselineTurno: turno,
    oplBaselineBuild: GESTOR_BUILD,
    oplConfig: [{ propietario: prop, opl, total: 0 }],
    resumenDespachos: { turno, resultado: [] },
  },
  turno,
  '25/08/2026 12:00'
);
const rowP = packParcial.todosOPL.find((p) => p.opl === opl);
assert.ok(rowP);
assert.strictEqual(rowP.total, 103);
assert.strictEqual(rowP.despachados, 1);
assert.strictEqual(rowP.pendientes, 102, '103 − 1 = 102');
assert.strictEqual(rowP.despachados + rowP.pendientes, rowP.total);

const packSoloPend = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-06-11', to: '2026-06-11' },
    despachosCavas: [
      ...enCava,
      ...juego(animalSalido).map((f) => {
        const c = f.slice();
        c[6] = cavaPaquete;
        return c;
      }),
    ],
    salidasCavaDia: [],
    oplTotalsJuego: {},
    oplBaselineFecha: '2026-06-11',
    oplBaselineTurno: turno,
    oplBaselineBuild: GESTOR_BUILD,
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
assert.strictEqual(row2.total, 2);
assert.strictEqual(row2.progreso, 0);
assert.strictEqual(packSoloPend.operacionFinalizada, false);

// Animal incompleto (falta Cabeza) cuenta en TOTAL/En cava, no en despachados.
const animalInc = '2606-11099';
const incompletoRows = [
  ['', '', '', `${animalInc}-1`, prop, '', cavaPaquete, 'Visceras Rojas', '', puesto],
  ['', '', '', `${animalInc}-2`, prop, '', cavaPaquete, 'Visceras Blancas', '', puesto],
  ['', '', '', `${animalInc}-3`, prop, '', cavaPaquete, 'Patas y Manos', '', puesto],
];
const packInc = construirProgresoOplDesdeDespachos(
  {
    lastSyncRange: { from: '2026-08-25', to: '2026-08-25' },
    despachosCavas: [...enCava, ...incompletoRows],
    salidasCavaDia: [],
    oplTotalsJuego: {},
    oplBaselineFecha: '2026-08-25',
    oplBaselineTurno: turno,
    oplBaselineBuild: GESTOR_BUILD,
    oplConfig: [{ propietario: prop, opl, total: 0 }],
    resumenDespachos: { turno, resultado: [] },
  },
  turno,
  '25/08/2026 08:00'
);
const rowInc = packInc.todosOPL.find((p) => p.opl === opl);
assert.ok(rowInc);
assert.strictEqual(rowInc.total, 2, 'completo + incompleto = 2 en meta');
assert.strictEqual(rowInc.despachados, 0);
assert.strictEqual(rowInc.pendientes, 2, 'incompleto queda pendiente hasta completar');

console.log('test-opl-salida-real: ok');
