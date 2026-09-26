#!/usr/bin/env node
/**
 * Tests del Excel de particulares (sin BD).
 * node scripts/test-planilla-particulares.mjs
 */
import assert from 'assert';
import {
  sanearNombreHoja,
  buildExcelParticularesBuffer,
} from '../server/gestor/planillaParticularesExcel.js';

const usados = new Set();
assert.strictEqual(sanearNombreHoja('TRANSCARNES', usados), 'TRANSCARNES');
assert.ok(sanearNombreHoja('A/B*C', usados).indexOf('/') === -1);

const buf = await buildExcelParticularesBuffer({
  fechaIso: '2026-09-26',
  turno: 'LxM',
  porOpl: {
    TRANSCARNES: [
      {
        codigo: '2609-001',
        propietario: 'DEMO SA',
        subproducto: 'Visceras Rojas',
        puesto: '01028 / DEST',
        cava: 'Cava Paquete Visceral',
        estado: 'Pendiente',
      },
    ],
    'DRA CAVA': [],
  },
});
assert.ok(Buffer.isBuffer(buf) && buf.length > 500, 'xlsx buffer');

console.log('test-planilla-particulares: ok', buf.length, 'bytes');
