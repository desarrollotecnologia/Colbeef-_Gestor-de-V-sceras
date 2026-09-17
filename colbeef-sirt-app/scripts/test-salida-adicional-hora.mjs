/**
 * Salidas ≥ 15:20 se marcan adicional; antes no.
 * node scripts/test-salida-adicional-hora.mjs
 */
import assert from 'assert';
import {
  esSalidaAdicionalPorHora,
  getSalidaAdicionalCorteLabel,
  parseHoraDesdeCelda,
} from '../server/gestor/engineUtils.js';
import { despachoCavaRowToDto } from '../server/gestor/sirtSync.js';

assert.strictEqual(getSalidaAdicionalCorteLabel(), '15:20');
assert.deepStrictEqual(parseHoraDesdeCelda('2026-09-17T15:20:00'), { h: 15, m: 20 });
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-17T15:19:59'), false);
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-17T15:20:00'), true);
assert.strictEqual(esSalidaAdicionalPorHora('17/09/2026 16:05'), true);
assert.strictEqual(esSalidaAdicionalPorHora('17/09/2026 12:00'), false);
assert.strictEqual(esSalidaAdicionalPorHora('2026-09-17'), false, 'sin hora no marca');

const filaAntes = [
  '2026-09-17T14:00:00',
  '',
  '',
  '2609-1',
  'PROP',
  '',
  'Cava Paquete Visceral',
  'Cabeza',
  'Zona',
  '01001/Zona/',
  '',
  '',
  '',
];
const filaDesp = [
  '2026-09-17T15:45:00',
  '',
  '',
  '2609-2',
  'PROP',
  '',
  'Cava Paquete Visceral',
  'Cabeza',
  'Zona',
  '01001/Zona/',
  '',
  '',
  '',
];
assert.strictEqual(despachoCavaRowToDto(filaAntes).adicional, false);
assert.strictEqual(despachoCavaRowToDto(filaDesp).adicional, true);
assert.strictEqual(despachoCavaRowToDto(filaDesp).tipoSalida, 'adicional');
console.log('test-salida-adicional-hora: ok');
