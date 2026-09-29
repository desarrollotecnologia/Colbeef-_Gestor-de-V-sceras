/**
 * Excel del módulo Crudas: hoja Resumen + una hoja por OPL con Puesto / Cantidad / Códigos.
 */
import ExcelJS from 'exceljs';
import { sanearNombreHoja } from './planillaParticularesExcel.js';

const VERDE = 'FF259C39';
const VERDE_CLARO = 'FFE8F5E9';
const BORDE = { style: 'thin', color: { argb: 'FFD1D5DB' } };
const BORDES = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE };

function titulo(ws, rango, texto, subtitulo) {
  ws.mergeCells(`A1:${rango}1`);
  const c1 = ws.getCell('A1');
  c1.value = texto;
  c1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16, name: 'Calibri' };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;
  ws.mergeCells(`A2:${rango}2`);
  const c2 = ws.getCell('A2');
  c2.value = subtitulo;
  c2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF374151' } };
  c2.alignment = { horizontal: 'center' };
}

function encabezados(ws, headers) {
  const hr = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDES;
  });
  hr.height = 22;
}

function filaDatos(ws, nFila, valores, idx, opts = {}) {
  const numCol = opts.numCol ?? 1;
  const row = ws.getRow(nFila);
  valores.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v;
    cell.font = { name: 'Calibri', size: 11, bold: i === numCol };
    cell.border = BORDES;
    cell.alignment = {
      vertical: 'top',
      horizontal: i === numCol ? 'center' : 'left',
      wrapText: i === opts.wrapCol,
    };
    if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_CLARO } };
  });
}

/** Fila TOTAL fuera del rango de filtros; SUBTOTAL suma solo lo visible al filtrar. */
function filaTotal(ws, nFila, primera, ultima, nCols, colCantidad = 2) {
  const row = ws.getRow(nFila);
  const letra = String.fromCharCode(64 + colCantidad);
  row.getCell(1).value = 'TOTAL';
  row.getCell(colCantidad).value = { formula: `SUBTOTAL(109,${letra}${primera}:${letra}${ultima})` };
  for (let i = 1; i <= nCols; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FF065F46' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    cell.border = BORDES;
    cell.alignment = { horizontal: i === colCantidad ? 'center' : 'left' };
  }
}

const ordenNatural = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });

/** Filas de getCrudasDetalle → OPL (orden alfabético) → puestos (orden numérico) con sus códigos. */
export function agruparCrudasPorOpl(filas) {
  const porOpl = {};
  (filas || []).forEach((f) => {
    const opl = String(f.opl || '').trim() || '—';
    const puesto = String(f.puesto || '').trim() || 'SIN PUESTO';
    if (!porOpl[opl]) porOpl[opl] = {};
    if (!porOpl[opl][puesto]) porOpl[opl][puesto] = { puesto, cantidad: 0, codigos: [] };
    porOpl[opl][puesto].cantidad += Number(f.cantidad || 1);
    if (f.codigo) porOpl[opl][puesto].codigos.push(f.codigo);
  });
  return Object.keys(porOpl)
    .sort(ordenNatural)
    .map((opl) => ({
      opl,
      puestos: Object.values(porOpl[opl])
        .sort((a, b) => ordenNatural(a.puesto, b.puesto))
        .map((p) => ({ ...p, codigos: p.codigos.sort(ordenNatural) })),
    }));
}

/**
 * @param {object} opts
 * @param {string} opts.fechaTxt
 * @param {string} [opts.turno]
 * @param {Array<{opl:string, puestos:Array<{puesto:string,cantidad:number,codigos:string[]}>}>} opts.opls
 */
export async function buildExcelCrudasBuffer({ fechaTxt, turno = '', opls = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colbeef Gestor Vísceras';
  wb.created = new Date();
  const usados = new Set(['RESUMEN']);
  const turnoTxt = turno ? ` · turno ${turno}` : '';
  const totalCrudas = opls.reduce(
    (s, o) => s + o.puestos.reduce((a, p) => a + p.cantidad, 0),
    0
  );

  const res = wb.addWorksheet('Resumen');
  titulo(res, 'C', 'CRUDAS POR OPL', `${fechaTxt}${turnoTxt} · ${opls.length} OPL · ${totalCrudas} crudas`);
  encabezados(res, ['OPL', 'Cantidad', 'Puestos']);
  opls.forEach((o, idx) => {
    const cant = o.puestos.reduce((a, p) => a + p.cantidad, 0);
    filaDatos(res, 4 + idx, [o.opl, cant, o.puestos.length], idx);
    res.getRow(4 + idx).getCell(3).alignment = { horizontal: 'center' };
  });
  const ultRes = 3 + Math.max(1, opls.length);
  res.autoFilter = { from: 'A3', to: `C${ultRes}` };
  if (opls.length) filaTotal(res, ultRes + 1, 4, ultRes, 3);
  res.getColumn(1).width = 32;
  res.getColumn(2).width = 12;
  res.getColumn(3).width = 12;
  res.views = [{ state: 'frozen', ySplit: 3 }];

  for (const o of opls) {
    const ws = wb.addWorksheet(sanearNombreHoja(o.opl, usados));
    const cant = o.puestos.reduce((a, p) => a + p.cantidad, 0);
    titulo(ws, 'C', `CRUDAS · ${o.opl}`, `${fechaTxt}${turnoTxt} · ${o.puestos.length} puestos · ${cant} crudas`);
    encabezados(ws, ['Puesto', 'Cantidad', 'Códigos']);
    o.puestos.forEach((p, idx) => {
      filaDatos(ws, 4 + idx, [p.puesto, p.cantidad, p.codigos.join(', ')], idx, { wrapCol: 2 });
    });
    const ult = 3 + Math.max(1, o.puestos.length);
    ws.autoFilter = { from: 'A3', to: `C${ult}` };
    filaTotal(ws, ult + 1, 4, ult, 3);
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 95;
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Una sola hoja con todas las crudas: OPL / Puesto / Cantidad / Códigos, en orden OPL → puesto. */
export async function buildExcelCrudasGeneralBuffer({ fechaTxt, turno = '', opls = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colbeef Gestor Vísceras';
  wb.created = new Date();
  const turnoTxt = turno ? ` · turno ${turno}` : '';
  const filas = opls.flatMap((o) => o.puestos.map((p) => ({ opl: o.opl, ...p })));
  const total = filas.reduce((a, f) => a + f.cantidad, 0);

  const ws = wb.addWorksheet('Crudas');
  titulo(ws, 'D', 'CRUDAS · GENERAL', `${fechaTxt}${turnoTxt} · ${opls.length} OPL · ${filas.length} puestos · ${total} crudas`);
  encabezados(ws, ['OPL', 'Puesto', 'Cantidad', 'Códigos']);
  filas.forEach((f, idx) => {
    filaDatos(ws, 4 + idx, [f.opl, f.puesto, f.cantidad, f.codigos.join(', ')], idx, {
      numCol: 2,
      wrapCol: 3,
    });
  });
  const ult = 3 + Math.max(1, filas.length);
  ws.autoFilter = { from: 'A3', to: `D${ult}` };
  filaTotal(ws, ult + 1, 4, ult, 4, 3);
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 95;
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
