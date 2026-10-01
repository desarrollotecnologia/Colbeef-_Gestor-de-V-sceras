/**
 * Excel de particulares: hoja General (con todos los OPL) + una por OPL, adicionales en azul.
 * node scripts/test-particulares-excel.mjs
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { buildExcelParticularesBuffer } from '../server/gestor/planillaParticularesExcel.js';

const fila = (codigo, subproducto, puesto, adicional = false) => ({
  codigo,
  propietario: 'PROPIETARIO PRUEBA',
  subproducto,
  puesto,
  cava: 'Cava Paquete Visceral',
  estado: 'Pendiente',
  adicional,
  fechaAsignacion: '30/09/2026',
  horaAsignacion: adicional ? '16:05' : '09:40',
});

const porOpl = {
  'CAVA AJR': [fila('3009-00001', 'Cabeza', '2086'), fila('3009-00001', 'Visceras Rojas', '2086', true)],
  'CAVA WO': [fila('3009-00002', 'Patas y Manos', '1009')],
  'EDGAR AM': [],
  TRANSCARNES: [
    fila('3009-00003', 'Visceras Blancas', '01014', true),
    fila('3009-00004', 'Cabeza', '01014'),
    fila('3009-00005', 'Cabeza', '02071'),
  ],
};
const totalFilas = Object.values(porOpl).reduce((n, a) => n + a.length, 0);
const totalAdicionales = Object.values(porOpl).reduce((n, a) => n + a.filter((r) => r.adicional).length, 0);

const buffer = await buildExcelParticularesBuffer({
  fechaIso: '2026-09-30',
  turno: 'SxD',
  porOpl,
  general: true,
  corteLabel: '15:20',
});
const destino = path.join(os.tmpdir(), 'Particulares_prueba.xlsx');
fs.writeFileSync(destino, buffer);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);
const AZUL = 'FFBDD7EE';
const esAzul = (ws, r) => ws.getCell(r, 1).fill?.fgColor?.argb === AZUL;

assert.deepStrictEqual(
  wb.worksheets.map((w) => w.name),
  ['General', 'CAVA AJR', 'CAVA WO', 'EDGAR AM', 'TRANSCARNES']
);

const g = wb.worksheets[0];
const COLS = 9;
assert.deepStrictEqual(
  Array.from({ length: COLS }, (_, i) => g.getCell(3, i + 1).value),
  ['OPL', 'Código', 'Propietario', 'Subproducto', 'Puesto', 'Cava', 'Estado', 'Fecha asignación', 'Hora asignación']
);
assert.strictEqual(String(g.autoFilter), `A3:I${3 + totalFilas}`, 'filtro cubre todas las filas de General');
assert.strictEqual(g.getCell(4, 8).value, '30/09/2026');
const oplsGeneral = [];
let azulesGeneral = 0;
for (let r = 4; r < 4 + totalFilas; r++) {
  oplsGeneral.push(g.getCell(r, 1).value);
  if (esAzul(g, r)) {
    azulesGeneral++;
    for (let c = 1; c <= COLS; c++) assert.strictEqual(g.getCell(r, c).fill.fgColor.argb, AZUL, 'fila completa en azul');
    assert.strictEqual(g.getCell(r, 9).value, '16:05', 'hora de asignación de la adicional');
  }
}
assert.deepStrictEqual(oplsGeneral, [...oplsGeneral].sort((a, b) => a.localeCompare(b, 'es')), 'orden por OPL');
assert.strictEqual(azulesGeneral, totalAdicionales, 'azules en General = adicionales');

let azulesOpl = 0;
wb.worksheets.slice(1).forEach((ws) => {
  const filas = porOpl[ws.name];
  assert.strictEqual(ws.getCell(3, 1).value, 'Código', `${ws.name} sin columna OPL`);
  assert.strictEqual(ws.getCell(3, 8).value, 'Hora asignación', `${ws.name} con hora de asignación`);
  filas.forEach((f, i) => {
    assert.strictEqual(esAzul(ws, 4 + i), f.adicional, `${ws.name} fila ${i + 1}`);
    if (f.adicional) azulesOpl++;
  });
});
assert.strictEqual(azulesOpl, totalAdicionales, 'azules en hojas OPL = adicionales');

const sinGeneral = new ExcelJS.Workbook();
await sinGeneral.xlsx.load(
  await buildExcelParticularesBuffer({ fechaIso: '2026-09-30', porOpl: { 'CAVA AJR': porOpl['CAVA AJR'] } })
);
assert.deepStrictEqual(sinGeneral.worksheets.map((w) => w.name), ['CAVA AJR'], 'sin "todos" no hay General');

console.log(`test-particulares-excel: ok · ${totalFilas} filas · ${totalAdicionales} adicionales en azul\n  ${destino}`);
