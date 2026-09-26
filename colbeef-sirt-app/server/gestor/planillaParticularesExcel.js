/**
 * Excel multi-hoja de OPLs particulares (solo pendientes).
 */
import ExcelJS from 'exceljs';

/** Nombre de hoja Excel válido (máx. 31, sin \ / * ? : [ ]). */
export function sanearNombreHoja(nombre, usados) {
  const raw = String(nombre || 'OPL')
    .replace(/[\\/*?:\[\]]/g, '-')
    .trim() || 'OPL';
  let base = raw.slice(0, 31);
  let candidato = base;
  let i = 2;
  const set = usados || new Set();
  while (set.has(candidato.toUpperCase())) {
    const suf = `_${i}`;
    candidato = (base.slice(0, Math.max(1, 31 - suf.length)) + suf).slice(0, 31);
    i += 1;
  }
  set.add(candidato.toUpperCase());
  return candidato;
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF259C39' } };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
}

/**
 * @param {object} opts
 * @param {string} opts.fechaIso
 * @param {string} [opts.turno]
 * @param {Record<string, Array<object>>} opts.porOpl  filas DTO por nombre OPL (orden de claves = orden de hojas)
 */
export async function buildExcelParticularesBuffer({ fechaIso, turno = '', porOpl = {} }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colbeef Gestor Vísceras';
  wb.created = new Date();
  const usados = new Set();
  const entradas = Object.entries(porOpl);
  let primero = true;

  if (!entradas.length) {
    const ws = wb.addWorksheet('Sin pendientes');
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = 'PARTICULARES';
    ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16, name: 'Calibri' };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF259C39' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `Sin OPLs / sin pendientes · ${fechaIso}`;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  for (const [opl, filas] of entradas) {
    const titulo = sanearNombreHoja(opl, usados);
    const ws = primero ? wb.addWorksheet(titulo) : wb.addWorksheet(titulo);
    primero = false;
    escribirHojaOpl(ws, opl, fechaIso, turno, filas || []);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function escribirHojaOpl(ws, opl, fechaIso, turno, filas) {
  ws.mergeCells('A1:F1');
  const c1 = ws.getCell('A1');
  c1.value = `OPL ${opl}`;
  c1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16, name: 'Calibri' };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF259C39' } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let col = 2; col <= 6; col++) {
    ws.getCell(1, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF259C39' } };
  }
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:F2');
  const c2 = ws.getCell('A2');
  const turnoTxt = turno || 'Todos';
  c2.value = `Subproductos pendientes · ${fechaIso} · turno ${turnoTxt} · ${filas.length} registros`;
  c2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF374151' } };
  c2.alignment = { horizontal: 'center' };

  const headers = ['Código', 'Propietario', 'Subproducto', 'Puesto', 'Cava', 'Estado'];
  const hr = ws.getRow(3);
  headers.forEach((h, i) => {
    hr.getCell(i + 1).value = h;
  });
  styleHeaderRow(hr);

  const zebra = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
  filas.forEach((r, idx) => {
    const row = ws.getRow(4 + idx);
    const vals = [
      r.codigo || '',
      r.propietario || '',
      r.subproducto || r.descripcion || '',
      r.puesto || '',
      r.cava || '',
      r.estado || 'Pendiente',
    ];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 11 };
      if (idx % 2 === 1) cell.fill = zebra;
    });
  });

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 28;
  ws.getColumn(5).width = 20;
  ws.getColumn(6).width = 12;
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.autoFilter = { from: 'A3', to: `F${Math.max(3, 3 + filas.length)}` };
}
