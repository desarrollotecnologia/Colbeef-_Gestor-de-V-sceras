/**
 * Partición: antes + adicionales = completos; incompletos con detalle;
 * pendientes OPL = solo en cava.
 * node scripts/test-adicionales-particion.mjs
 */
import assert from 'assert';
import { esSalidaAdicionalPorHora } from '../server/gestor/engineUtils.js';
import { construirProgresoOplDesdeDespachos, GESTOR_BUILD } from '../server/gestor/engine.js';

assert.strictEqual(esSalidaAdicionalPorHora('2026-09-17T15:19:00'), false);
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-17T15:20:00'), true);
assert.ok(
  String(GESTOR_BUILD).includes('v24') ||
    String(GESTOR_BUILD).includes('v25') ||
    String(GESTOR_BUILD).includes('v26') ||
    String(GESTOR_BUILD).includes('incompletos') ||
    String(GESTOR_BUILD).includes('beneficio') ||
    String(GESTOR_BUILD).includes('particulares')
);

const puesto = '01001/Bucaramanga/JxV/';
const cava = 'Cava Paquete Visceral 1';
const TIPOS = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];

function piezas(base, horaIso, tipos, prop = 'PROP A') {
  return tipos.map((tipo, i) => [
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

function programado(base, tipos = TIPOS, prop = 'PROP A') {
  return piezas(base, '', tipos, prop).map((f) => {
    const x = [...f];
    x[0] = '';
    return x;
  });
}

const programados = [
  ...programado('2609-001'),
  ...programado('2609-002'),
  ...programado('2609-003'),
];

const salidas = [
  ...piezas('2609-010', '2026-09-17T14:00:00', TIPOS),
  ...piezas('2609-011', '2026-09-17T15:19:00', TIPOS),
  ...piezas('2609-012', '2026-09-17T15:20:00', TIPOS),
  ...piezas('2609-013', '2026-09-17T16:05:00', TIPOS),
  // incompleto: falta Patas (como el caso 23/09)
  ...piezas('2609-08186', '2026-09-17T20:01:00', [
    'Cabeza',
    'Visceras Blancas',
    'Visceras Rojas',
  ]),
];

const s = {
  lastSyncRange: { from: '2026-09-17', to: '2026-09-17' },
  despachosCavas: programados,
  salidasCavaDia: salidas,
  oplConfig: [{ propietario: 'PROP A', opl: 'TRANSCARNES', total: 0 }],
  oplTotalsJuego: {},
  oplTotalsJuegoCompleto: {},
  oplBaselineFecha: '',
  oplBaselineTurno: '',
  oplBaselineBuild: '',
};

const pack = construirProgresoOplDesdeDespachos(s, 'JxV', '17/09/2026 16:00');
assert.strictEqual(pack.juegosSalidaAntes, 2);
assert.strictEqual(pack.juegosSalidaAdicionales, 2);
assert.strictEqual(pack.juegosSalidaAntes + pack.juegosSalidaAdicionales, pack.juegosSalidaTotal);
assert.strictEqual(pack.totalIncompletos, 1);
assert.strictEqual(pack.salidasIncompletas[0].codigoBase, '2609-08186');
assert.deepStrictEqual(pack.salidasIncompletas[0].tiposFaltantes, ['Patas y Manos']);

const tc = pack.todosOPL.find((p) => p.opl === 'TRANSCARNES');
assert.ok(tc);
assert.strictEqual(tc.despachados, 2, 'solo antes del corte');
assert.strictEqual(tc.adicionales, 2);
assert.strictEqual(tc.incompletos, 1);
// 3 aún en cava programados → pendientes = 3 (incompleto NO cuelga)
assert.strictEqual(tc.pendientes, 3, 'pendientes = solo en cava');

console.log('test-adicionales-particion: ok', {
  antes: pack.juegosSalidaAntes,
  adi: pack.juegosSalidaAdicionales,
  inc: pack.totalIncompletos,
  pend: tc.pendientes,
});
