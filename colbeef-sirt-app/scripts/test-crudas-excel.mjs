/**
 * Arma el Excel de Crudas con las crudas actuales del servidor (solo lectura) y lo verifica.
 * node scripts/test-crudas-excel.mjs [http://192.168.20.205:3001]
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import {
  agruparCrudasPorOpl,
  buildExcelCrudasBuffer,
  buildExcelCrudasGeneralBuffer,
} from '../server/gestor/crudasExcel.js';

const host = process.argv[2] || 'http://192.168.20.205:3001';
const r = await fetch(`${host}/api/rpc`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'getCrudasDetalle', args: [] }),
});
const json = await r.json();
const det = json.result || json;
const filas = det.filas || [];
const opls = agruparCrudasPorOpl(filas);
const buffer = await buildExcelCrudasBuffer({ fechaTxt: 'prueba', turno: det.turno, opls });
const destino = path.join(os.tmpdir(), 'Crudas_por_OPL_prueba.xlsx');
fs.writeFileSync(destino, buffer);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);
assert.strictEqual(wb.worksheets.length, opls.length + 1, 'Resumen + una hoja por OPL');
let suma = 0;
opls.forEach((o, i) => {
  const ws = wb.worksheets[i + 1];
  assert.strictEqual(ws.getCell('A3').value, 'Puesto');
  assert.ok(ws.autoFilter, `filtro en ${ws.name}`);
  const cant = o.puestos.reduce((a, p) => a + p.cantidad, 0);
  suma += cant;
  console.log(`  ${ws.name.padEnd(24)} ${String(o.puestos.length).padStart(3)} puestos ${String(cant).padStart(4)} crudas`);
});
const totalPantalla = filas.reduce((a, f) => a + Number(f.cantidad || 1), 0);
assert.strictEqual(suma, totalPantalla, 'total Excel = total pantalla');

const bufGen = await buildExcelCrudasGeneralBuffer({ fechaTxt: 'prueba', turno: det.turno, opls });
const destinoGen = path.join(os.tmpdir(), 'Crudas_general_prueba.xlsx');
fs.writeFileSync(destinoGen, bufGen);
const wbGen = new ExcelJS.Workbook();
await wbGen.xlsx.load(bufGen);
assert.strictEqual(wbGen.worksheets.length, 1, 'general = una sola hoja');
const g = wbGen.worksheets[0];
assert.deepStrictEqual([1, 2, 3, 4].map((c) => g.getCell(3, c).value), ['OPL', 'Puesto', 'Cantidad', 'Códigos']);
assert.ok(g.autoFilter, 'filtro en hoja general');
const nPuestos = opls.reduce((a, o) => a + o.puestos.length, 0);
let sumaGen = 0;
const oplsEnOrden = [];
for (let r = 4; r < 4 + nPuestos; r++) {
  sumaGen += Number(g.getCell(r, 3).value);
  const o = g.getCell(r, 1).value;
  if (oplsEnOrden[oplsEnOrden.length - 1] !== o) oplsEnOrden.push(o);
}
assert.strictEqual(sumaGen, totalPantalla, 'total hoja general = total pantalla');
assert.deepStrictEqual(oplsEnOrden, opls.map((o) => o.opl), 'agrupado en orden de OPL');
assert.strictEqual(g.getCell(4 + nPuestos, 1).value, 'TOTAL');
console.log(`test-crudas-excel: ok · ${filas.length} crudas · ${opls.length} OPL · ${nPuestos} filas en hoja general`);
console.log(`  ${destino}\n  ${destinoGen}`);
