/**
 * Caso 26/09.
 * - Traslados internos entre cavas no son despacho.
 * - Adicional = juego cuya salida se ASIGNÓ desde las 15:20 (no la hora del pistoleo).
 * - Adicionales quedan fijos aunque salgan de planta.
 * node scripts/test-salidas-traslado.mjs
 */
import assert from 'assert';
import { esSalidaAdicionalPorHora, minutosOperativosDesdeCelda } from '../server/gestor/engineUtils.js';
import { construirProgresoOplDesdeDespachos } from '../server/gestor/engine.js';

assert.strictEqual(minutosOperativosDesdeCelda('2026-09-27T00:34:00'), 24 * 60 + 34);
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-27T00:34:00'), true, 'madrugada = después del corte');
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-26T14:00:00'), false);

const TIPOS = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];
const puesto = '01001/Bucaramanga/';
const cavaDeTipo = (tipo) =>
  tipo === 'Cabeza' || tipo === 'Patas y Manos'
    ? 'Recepción Cabezas Patas y Manos'
    : 'Recepción Vísceras Blancas y Vísceras Rojas';

function fila(base, i, tipo, cava, fechaSalida, registro) {
  return [fechaSalida || '', '', '', `${base}-${60 + i}`, 'PROP A', '', cava, tipo, 'Bucaramanga', puesto, '', '', '', registro];
}
const juego = (base, cava, fechaSalida, registro) =>
  TIPOS.map((t, i) => fila(base, i, t, typeof cava === 'function' ? cava(t) : cava, fechaSalida, registro));

const MANANA = '2026-09-26T13:10:00';
const TARDE = '2026-09-26T17:05:00';
const AYER = '2026-09-25T14:00:00';

// A: asignado 13:10; Rec → Paq2 (16:11) → Paq1 (21:05), sigue en Paquete 1 → pendiente normal.
const aEnCava = juego('2609-09450', 'Cava Paquete Visceral 1', '', MANANA);
const aSalidas = [
  ...juego('2609-09450', cavaDeTipo, '2026-09-26T16:11:00', MANANA),
  ...juego('2609-09450', 'Cava Paquete Visceral 2', '2026-09-26T21:05:00', MANANA),
];
// B: asignado 13:10, sale directo desde Recepción 18:30 → despachado normal (no adicional).
const bSalidas = juego('2609-09001', cavaDeTipo, '2026-09-26T18:30:00', MANANA);
// C: asignado el día anterior, sale 00:34 → despachado normal.
const cSalidas = [
  ...juego('2609-09002', 'Cava Paquete Visceral 2', '2026-09-26T21:05:00', AYER),
  ...juego('2609-09002', 'Cava Paquete Visceral 1', '2026-09-27T00:34:00', AYER),
];
// D: asignado 17:05 y ya salió → adicional (no se descuenta al salir).
const dSalidas = juego('2609-09003', 'Cava Paquete Visceral 2', '2026-09-26T19:00:00', TARDE);
// E: asignado 17:05, aún en cava → adicional pendiente.
const eEnCava = juego('2609-09004', 'Cava Paquete Visceral 2', '', TARDE);

const s = {
  lastSyncRange: { from: '2026-09-26', to: '2026-09-26' },
  despachosCavas: [...aEnCava, ...eEnCava],
  salidasCavaDia: [...aSalidas, ...bSalidas, ...cSalidas, ...dSalidas],
  estadoFromRow12: [],
  oplConfig: [{ propietario: 'PROP A', opl: 'TRANSCARNES', total: 0 }],
  oplTotalsJuego: {},
  oplTotalsJuegoCompleto: {},
  oplBaselineFecha: '',
  oplBaselineTurno: '',
  oplBaselineBuild: '',
};

const pack = construirProgresoOplDesdeDespachos(s, 'SxD', '26/09/2026 21:08');
const tc = pack.todosOPL.find((p) => p.opl === 'TRANSCARNES');
assert.ok(tc);
assert.strictEqual(tc.total, 5, 'meta sin doble conteo');
assert.strictEqual(tc.asignadosAntes, 3, 'A, B, C');
assert.strictEqual(tc.adicionales, 2, 'D y E asignados desde 15:20');
assert.strictEqual(tc.asignadosAntes + tc.adicionales, tc.total);
assert.strictEqual(tc.despachados, 3, 'B, C, D salieron de planta; A es traslado');
assert.strictEqual(tc.pendientes, 2, 'A y E en cava');
assert.strictEqual(tc.pendientesAntes, 1, 'total a despachar = A');
assert.strictEqual(tc.adicionalesPendientes, 1, 'E');
assert.strictEqual(tc.incompletos, 0, 'traslados no generan incompletos');

console.log('test-salidas-traslado: ok', {
  total: tc.total,
  antes: tc.asignadosAntes,
  adi: tc.adicionales,
  desp: tc.despachados,
  pendAntes: tc.pendientesAntes,
  adiPend: tc.adicionalesPendientes,
});
