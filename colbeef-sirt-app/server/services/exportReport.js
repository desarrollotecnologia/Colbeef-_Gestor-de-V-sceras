import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getDashboard, getDespachosPorPropietario, getCategoriasVw } from './metrics.js';

function bufferPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function buildExcelBuffer(opts) {
  const dash = await getDashboard(opts);
  const prop = await getDespachosPorPropietario({ ...opts, limit: 200 });
  const cat = await getCategoriasVw({ ...opts, limit: 50 });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colbeef Gestor Vísceras (SIRT)';
  wb.created = new Date();

  const s1 = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 1 }] });
  s1.columns = [
    { header: 'Indicador', key: 'k', width: 28 },
    { header: 'Valor', key: 'v', width: 18 },
  ];
  s1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  s1.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF259C39' },
  };
  const periodo =
    dash.desde && dash.hasta
      ? `${dash.desde} — ${dash.hasta}`
      : `Últimos ${dash.dias} días`;
  s1.addRows([
    { k: 'Periodo', v: periodo },
    { k: 'Juegos (tipos vísceras/cabeza/patas)', v: dash.totalSalidas },
    { k: 'Salidas de cava (códigos base)', v: dash.conSalidaCava },
    { k: 'Pendientes (estim.)', v: dash.totalJuegosDespachar },
    { k: 'Progreso %', v: dash.progreso },
    { k: 'Decomisos', v: dash.totalDecomisos },
    { k: 'Crudas (VB + observación)', v: dash.totalCrudas },
    { k: 'Kg vista Colbeef', v: dash.despachoKg },
    { k: 'Filas vista Colbeef', v: dash.filasVw },
    { k: 'Propietarios activos (vista)', v: dash.propietariosActivos },
  ]);

  const s2 = wb.addWorksheet('Por propietario', { views: [{ state: 'frozen', ySplit: 1 }] });
  s2.columns = [
    { header: 'Propietario', key: 'propietario', width: 36 },
    { header: 'Kg', key: 'kg', width: 14 },
    { header: 'Filas', key: 'filas', width: 10 },
    { header: 'Órdenes', key: 'ordenes', width: 10 },
  ];
  s2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  s2.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF259C39' },
  };
  prop.rows.forEach((r) =>
    s2.addRow({
      propietario: r.propietario,
      kg: Number(r.kg),
      filas: r.filas,
      ordenes: r.ordenes,
    })
  );

  const s3 = wb.addWorksheet('Categorías', { views: [{ state: 'frozen', ySplit: 1 }] });
  s3.columns = [
    { header: 'Categoría', key: 'categoria', width: 36 },
    { header: 'Kg', key: 'kg', width: 14 },
  ];
  s3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  s3.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF259C39' },
  };
  cat.rows.forEach((r) => s3.addRow({ categoria: r.categoria, kg: Number(r.kg) }));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildPdfBuffer(opts) {
  const dash = await getDashboard(opts);
  const prop = await getDespachosPorPropietario({ ...opts, limit: 30 });

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const title = 'Colbeef · Gestor de vísceras (SIRT)';
  const periodo =
    dash.desde && dash.hasta
      ? `${dash.desde} — ${dash.hasta}`
      : `Últimos ${dash.dias} días`;

  doc.fillColor('#259c39').fontSize(16).text(title, { align: 'center' });
  doc.moveDown(0.4);
  doc.fillColor('#6b7280').fontSize(10).text(`Periodo: ${periodo}`, { align: 'center' });
  doc.moveDown(1.2);
  doc.fillColor('#111').fontSize(11);
  doc.text(`Juegos (vísceras/cabeza/patas): ${dash.totalSalidas}`);
  doc.text(`Salidas de cava (bases): ${dash.conSalidaCava}`);
  doc.text(`Progreso: ${dash.progreso}%`);
  doc.text(`Pendientes (estim.): ${dash.totalJuegosDespachar}`);
  doc.text(`Decomisos: ${dash.totalDecomisos}`);
  doc.text(`Crudas: ${dash.totalCrudas}`);
  doc.text(`Kg (vista Colbeef): ${dash.despachoKg}`);
  doc.moveDown(0.8);
  doc.fontSize(12).fillColor('#259c39').text('Top propietarios (kg)', { underline: true });
  doc.moveDown(0.3);
  doc.fillColor('#111').fontSize(10);
  prop.rows.slice(0, 15).forEach((r, i) => {
    doc.text(`${i + 1}. ${r.propietario} — ${Number(r.kg).toFixed(2)} kg (${r.filas} filas)`);
  });

  return bufferPdf(doc);
}
