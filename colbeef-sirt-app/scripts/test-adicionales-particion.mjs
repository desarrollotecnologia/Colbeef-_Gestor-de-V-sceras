/**
 * Partición exacta: antes + adicionales = total salidas del día.
 * node scripts/test-adicionales-particion.mjs
 */
import assert from 'assert';
import { esSalidaAdicionalPorHora } from '../server/gestor/engineUtils.js';

// Re-test helper boundary
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-17T15:19:00'), false);
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-17T15:20:00'), true);

// Build synthetic matrices and use construirProgreso via dynamic import of engine
const { construirProgresoOplDesdeDespachos, GESTOR_BUILD } = await import(
  '../server/gestor/engine.js'
);

const puesto = '01001/Bucaramanga/JxV/';
const cava = 'Cava Paquete Visceral 1';
const TIPOS = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];

function juego(base, horaIso, prop = 'PROP A') {
  return TIPOS.map((tipo, i) => [
    horaIso,
    '',
    '',
    `${base}-${10 + i}`,
    prop,
    '',
    cava,
    tipo,
    'Bucaramanga',
    puesto,
    '',
    '',
    '',
  ]);
}

const programados = [
  ...juego('2609-001', null), // still in cava — but programados use fecha null in col0? use empty
].map((f) => {
  const x = [...f];
  x[0] = ''; // programado sin salida
  return x;
});
// Add more animals still programmed
for (let n = 2; n <= 5; n++) {
  programados.push(
    ...juego(`2609-00${n}`, null).map((f) => {
      const x = [...f];
      x[0] = '';
      return x;
    })
  );
}

const salidas = [
  ...juego('2609-010', '2026-09-17T14:00:00'), // antes
  ...juego('2609-011', '2026-09-17T15:19:00'), // antes (borde)
  ...juego('2609-012', '2026-09-17T15:20:00'), // adicional
  ...juego('2609-013', '2026-09-17T16:05:00'), // adicional
];

const s = {
  lastSyncRange: { from: '2026-09-17', to: '2026-09-17' },
  despachosCavas: [...programados, ...salidas.filter(() => false)], // programados only in cava list
  salidasCavaDia: salidas,
  oplConfig: [{ propietario: 'PROP A', opl: 'TRANSCARNES', total: 0 }],
  oplTotalsJuego: {},
  oplTotalsJuegoCompleto: {},
  oplBaselineFecha: '',
  oplBaselineTurno: '',
  oplBaselineBuild: '',
};

// Programados = animals still without salida (5) — but we also need baseline from salidas
// Put all animals that exited also as having been in programming historically via salidas baseline
s.despachosCavas = [
  ...programados,
  // exited animals no longer in programados
];

const pack = construirProgresoOplDesdeDespachos(s, 'JxV', '17/09/2026 16:00');
assert.ok(GESTOR_BUILD.includes('v23') || GESTOR_BUILD.includes('adicionales'));

assert.strictEqual(pack.juegosSalidaAntes, 2, '2 juegos antes del corte');
assert.strictEqual(pack.juegosSalidaAdicionales, 2, '2 juegos adicionales');
assert.strictEqual(
  pack.juegosSalidaAntes + pack.juegosSalidaAdicionales,
  pack.juegosSalidaTotal,
  'antes + adi = total'
);
assert.strictEqual(pack.juegosSalidaTotal, 4);

// Despachados OPL solo cuentan antes → pendientes no bajan por adicionales
const tc = pack.todosOPL.find((p) => p.opl === 'TRANSCARNES');
assert.ok(tc, 'debe existir TRANSCARNES');
assert.strictEqual(tc.despachados, 2, 'solo 2 despachados (antes)');
assert.strictEqual(tc.adicionales, 2, '2 adicionales en OPL');

console.log('test-adicionales-particion: ok', {
  antes: pack.juegosSalidaAntes,
  adi: pack.juegosSalidaAdicionales,
  total: pack.juegosSalidaTotal,
  desp: tc.despachados,
  pend: tc.pendientes,
  meta: tc.total,
});
