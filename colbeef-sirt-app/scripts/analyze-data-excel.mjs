/**
 * Lee los Excel de muestra en ../data y muestra encabezados + mapeo al SQL del gestor.
 * Uso: npm run analyze:data-excel
 */
import XLSX from 'xlsx';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');

function sheetRows(path) {
  const wb = XLSX.readFile(path, { cellDates: true, raw: false });
  const sh = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
}

function findHeaderRow(rows, predicate) {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => String(c).trim().toLowerCase());
    if (predicate(cells, rows[i])) return i;
  }
  return -1;
}

console.log('=== Análisis Excel (data/) vs Apps Script / Node SIRT ===\n');

const estadoPath = join(dataDir, 'estado de productos en cavas y en plan de faena actual.xls');
const decPath = join(dataDir, 'reporte de decomisos de subproductos.xls');

const estado = sheetRows(estadoPath);
const dec = sheetRows(decPath);

const hEst = findHeaderRow(
  estado,
  (cells) => cells.some((s) => s.includes('código')) && cells.some((s) => s.includes('destino'))
);
const hDec = findHeaderRow(
  dec,
  (cells) => cells.some((s) => s.includes('identific')) && cells.some((s) => s.includes('producto'))
);

console.log('1) ESTADO DE PRODUCTOS EN CAVAS (.xls)');
console.log('   Fila encabezado detectada (1-based):', hEst >= 0 ? hEst + 1 : '(no encontrada)');
if (hEst >= 0) console.log('   Columnas:', estado[hEst].filter(Boolean).join(' | '));
console.log(
  '   → Apps Script: hoja Estado_Cavas; resumirDecomisos leía fila 12+ col B–I (ID, …, Destino).'
);
console.log(
  '   → Node: trazabilidad_proceso.parte_producto (id_producto, tipo, identificación, con_destino, observaciones).\n'
);

console.log('2) REPORTE DECOMISOS (.xls)');
console.log('   Fila encabezado detectada (1-based):', hDec >= 0 ? hDec + 1 : '(no encontrada)');
if (hDec >= 0) console.log('   Columnas:', dec[hDec].filter(Boolean).join(' | '));
console.log('   → Apps Script: Reporte_Decomisos; col A = ID, col C = producto.');
console.log('   → Node: sai.decomiso (codigo_maquina o id + tipo parte producto).\n');

console.log('3) CRUCE');
console.log('   Excel: Código (estado) vs Identificación (decomiso).');
console.log('   Node: mismo criterio + normalización de ID (trim/minúsculas/codigoBase).\n');

if (hEst >= 0 && hDec >= 0) {
  const colCod = estado[hEst].findIndex((c) => String(c).toLowerCase().includes('código'));
  const colIdDec = dec[hDec].findIndex((c) => String(c).toLowerCase().includes('identific'));
  const setDec = new Set();
  for (let r = hDec + 2; r < dec.length; r++) {
    const id = String(dec[r][colIdDec] ?? '').trim();
    if (id) setDec.add(id.toLowerCase());
  }
  let match = 0;
  let sample = 0;
  for (let r = hEst + 2; r < estado.length && sample < 500; r++) {
    const code = String(estado[r][colCod] ?? '').trim();
    if (!code) continue;
    sample++;
    if (setDec.has(code.toLowerCase())) match++;
  }
  console.log('4) Muestra (hasta 500 códigos con datos en estado):');
  console.log('   Códigos que también están en Identificación (este par de archivos):', match, '/', sample);
}

console.log('\n5) Despachos: en data/ no hay el tercer Excel; Node usa desposte.* (equiv. vw_producto_vendido_colbeef).\n');
