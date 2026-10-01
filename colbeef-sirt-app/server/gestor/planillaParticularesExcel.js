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
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
}

const VERDE = 'FF259C39';
const FILL_ZEBRA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
const FILL_ADICIONAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };

/**
 * @param {object} opts
 * @param {string} opts.fechaIso
 * @param {string} [opts.turno]
 * @param {Record<string, Array<object>>} opts.porOpl  filas DTO por nombre OPL (orden de claves = orden de hojas)
 * @param {boolean} [opts.general]  agrega de primera la hoja "General" con todos los OPL
 * @param {string} [opts.corteLabel]  hora desde la que una asignación es adicional (p. ej. 15:20)
 */
export async function buildExcelParticularesBuffer({
  fechaIso,
  turno = '',
  porOpl = {},
  general = false,
  corteLabel = '15:20',
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colbeef Gestor Vísceras';
  wb.created = new Date();
  const usados = new Set();
  const entradas = Object.entries(porOpl);

  if (!entradas.length) {
    const ws = wb.addWorksheet('Sin pendientes');
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = 'PARTICULARES';
    ws.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16, name: 'Calibri' };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `Sin OPLs / sin pendientes · ${fechaIso}`;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  if (general) {
    const todas = [];
    for (const [opl, filas] of entradas) {
      (filas || []).forEach((r) => todas.push({ ...r, opl }));
    }
    const ws = wb.addWorksheet(sanearNombreHoja('General', usados));
    escribirHoja(ws, {
      titulo: 'PARTICULARES · GENERAL',
      fechaIso,
      turno,
      filas: todas,
      conOpl: true,
      corteLabel,
    });
  }

  for (const [opl, filas] of entradas) {
    const ws = wb.addWorksheet(sanearNombreHoja(opl, usados));
    escribirHoja(ws, { titulo: `OPL ${opl}`, fechaIso, turno, filas: filas || [], corteLabel });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function letraColumna(n) {
  return String.fromCharCode(64 + n);
}

function escribirHoja(ws, { titulo, fechaIso, turno, filas, conOpl = false, corteLabel }) {
  const headers = [
    'Código',
    'Propietario',
    'Subproducto',
    'Puesto',
    'Cava',
    'Estado',
    'Fecha asignación',
    'Hora asignación',
  ];
  const anchos = [18, 36, 18, 28, 20, 12, 17, 16];
  if (conOpl) {
    headers.unshift('OPL');
    anchos.unshift(20);
  }
  const nCols = headers.length;
  const ultima = letraColumna(nCols);

  ws.mergeCells(`A1:${ultima}1`);
  const c1 = ws.getCell('A1');
  c1.value = titulo;
  c1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16, name: 'Calibri' };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let col = 1; col <= nCols; col++) {
    ws.getCell(1, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  }
  ws.getRow(1).height = 28;

  const nAdicionales = filas.filter((r) => r.adicional).length;
  ws.mergeCells(`A2:${ultima}2`);
  const c2 = ws.getCell('A2');
  const turnoTxt = turno || 'Todos';
  c2.value =
    `Subproductos pendientes · ${fechaIso} · turno ${turnoTxt} · ${filas.length} registros` +
    ` · Azul = adicional (asignado desde las ${corteLabel}): ${nAdicionales}`;
  c2.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF374151' } };
  c2.alignment = { horizontal: 'center' };

  const hr = ws.getRow(3);
  headers.forEach((h, i) => {
    hr.getCell(i + 1).value = h;
  });
  styleHeaderRow(hr);

  filas.forEach((r, idx) => {
    const row = ws.getRow(4 + idx);
    const vals = [
      r.codigo || '',
      r.propietario || '',
      r.subproducto || r.descripcion || '',
      r.puesto || '',
      r.cava || '',
      r.estado || 'Pendiente',
      r.fechaAsignacion || '',
      r.horaAsignacion || '',
    ];
    if (conOpl) vals.unshift(r.opl || '');
    const fill = r.adicional ? FILL_ADICIONAL : idx % 2 === 1 ? FILL_ZEBRA : null;
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { name: 'Calibri', size: 11 };
      if (i >= vals.length - 2) cell.alignment = { horizontal: 'center' };
      if (fill) cell.fill = fill;
    });
  });

  anchos.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.autoFilter = { from: 'A3', to: `${ultima}${Math.max(3, 3 + filas.length)}` };
}
