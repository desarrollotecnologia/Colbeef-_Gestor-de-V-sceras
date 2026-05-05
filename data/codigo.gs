// =====================================================
// CODIGO.GS - Colbeef · Gestor de Vísceras
// =====================================================
const SPREADSHEET_ID = '18R_Rjr86lDS3d-rUluV-iJcy_CkywQn3L0b7hirQPQQ';
const LOGO_FILE_ID   = '1_MrUY2pgrF-5M1Y3ea9rbz9UAO9-QSAA';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Gestor de Vísceras - Colbeef')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function initializeSheets() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    createSheetIfNotExists(ss, 'Estado_Cavas', [
      'Fila','ID','Producto','Cantidad','Fecha Ingreso','Lote','Proveedor','Ubicación','Tipo','Destino'
    ]);
    createSheetIfNotExists(ss, 'Reporte_Decomisos', [
      'ID','Fecha','Producto','Cantidad','Motivo','Responsable'
    ]);
    createSheetIfNotExists(ss, 'Resumen', [
      'ID Producto','Destino','Producto/Subproducto','Fecha Procesamiento'
    ]);
    createSheetIfNotExists(ss, 'Despachos', [
      'ID','Fecha','Categoría','Subcategoría','Producto','Cantidad','Destino','OPL'
    ]);
    createSheetIfNotExists(ss, 'HistorialPDF', [
      'Nombre','Fecha','URL','Tipo','Registros','Usuario'
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function createSheetIfNotExists(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    }
  }
  return sheet;
}

function importarExcel(base64, sheetName) {
  try {
    const decoded  = Utilities.base64Decode(base64);
    const blob     = Utilities.newBlob(decoded,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'temp.xlsx');
    const resource = { title: 'temp_import', mimeType: MimeType.GOOGLE_SHEETS };
    const file     = Drive.Files.insert(resource, blob, { convert: true });
    const data     = SpreadsheetApp.openById(file.id).getSheets()[0].getDataRange().getValues();
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
    const destSheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    destSheet.clear();
    if (data.length > 0) destSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    Drive.Files.remove(file.id);
    return { success: true, rows: data.length };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function resumirDecomisos() {
  try {
    const ss             = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetCavas     = ss.getSheetByName('Estado_Cavas');
    const sheetDecomisos = ss.getSheetByName('Reporte_Decomisos');
    const sheetResumen   = ss.getSheetByName('Resumen');
    if (!sheetCavas || !sheetDecomisos) throw new Error('Faltan hojas de origen');

    const lastRowCavas = sheetCavas.getLastRow();
    let dataCavas = [];
    const startRow = lastRowCavas >= 12 ? 12 : 2;
    if (lastRowCavas >= startRow) {
      dataCavas = sheetCavas.getRange(startRow, 2, lastRowCavas - startRow + 1, 9).getValues();
    }

    const dataDecomisos = sheetDecomisos.getDataRange().getValues();
    let mapa = {};
    dataDecomisos.forEach((fila, idx) => {
      if (idx === 0) return;
      const id = String(fila[0]).trim();
      if (id) mapa[id] = fila[2];
    });

    let resultado = [['ID Producto', 'Destino', 'Producto/Subproducto']];
    dataCavas.forEach(fila => {
      const id = String(fila[0]).trim();
      if (id && mapa[id] !== undefined) resultado.push([id, fila[8], mapa[id]]);
    });

    sheetResumen.clear();
    if (resultado.length > 0) {
      sheetResumen.getRange(1, 1, resultado.length, resultado[0].length).setValues(resultado);
      if (resultado.length > 1) sheetResumen.getRange(2, 4, resultado.length - 1, 1).setValue(new Date());
    }

    // ── ACTUALIZAR CANTIDADES INICIALES OPL desde dataCavas ──
    // Pasar turno vacío para que opl.gs lo detecte del propio archivo
    try {
      actualizarCantidadesInicialesOPL(dataCavas, "");
    } catch(eOpl) {
      Logger.log('OPL cantidades iniciales error: ' + eOpl.toString());
    }

    return {
      success:            true,
      totalProductos:     resultado.length - 1,
      totalDestinos:      [...new Set(resultado.slice(1).map(r => r[1]))].length,
      fechaProcesamiento: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'),
      resultados:         resultado.slice(1).map(r => ({ id: r[0], destino: r[1], producto: r[2] }))
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getResumenDecomisos() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Resumen');
    if (!sheet) return { success: true, totalProductos: 0, totalDestinos: 0, fechaProcesamiento: 'Sin datos', resultados: [] };
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, totalProductos: 0, totalDestinos: 0, fechaProcesamiento: 'Sin datos', resultados: [] };

    const filas = data.slice(1).filter(r => r[0] && r[1] && r[2]);
    let fechaFormatted = 'Sin datos';
    if (filas.length && filas[0][3]) {
      const fObj = (filas[0][3] instanceof Date) ? filas[0][3] : new Date(filas[0][3]);
      if (!isNaN(fObj.getTime())) fechaFormatted = Utilities.formatDate(fObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    }
    return {
      success:            true,
      totalProductos:     filas.length,
      totalDestinos:      [...new Set(filas.map(r => r[1]))].length,
      fechaProcesamiento: fechaFormatted,
      resultados:         filas.map(r => ({ id: r[0], destino: r[1], producto: r[2] }))
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getDashboardData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const resumenSheet   = ss.getSheetByName('Resumen');
    const totalDecomisos = resumenSheet ? Math.max(0, resumenSheet.getLastRow() - 1) : 0;

    const resSalidas   = contarJuegosViscerales();
    const totalSalidas = resSalidas.success ? resSalidas.total : 0;

    const despData             = getDashboardDataDespachos();
    const totalJuegosDespachar = despData.totalJuegosDespachar || 0;
    const turnoDespacho        = despData.turnoDespacho        || '';
    const ultimaActDespachos   = despData.ultimaActDespachos   || '';

    const despachados = Math.max(0, totalSalidas - totalJuegosDespachar);
    const progreso    = totalSalidas > 0
      ? Math.min(100, Math.round((despachados / totalSalidas) * 100))
      : 0;

    // Contar crudas
    var totalCrudas = 0;
    try { totalCrudas = contarCrudas().total; } catch(eC) { Logger.log('Crudas: '+eC); }

    return {
      success:              true,
      totalSalidas:         totalSalidas,
      totalDecomisos:       totalDecomisos,
      totalCrudas:          totalCrudas,
      totalJuegosDespachar: totalJuegosDespachar,
      turnoDespacho:        turnoDespacho,
      ultimaActDespachos:   ultimaActDespachos,
      progreso:             progreso,
      meta:                 totalSalidas
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function getHistorialPDF() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('HistorialPDF');
    if (!sheet) return { success: true, historial: [] };
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, historial: [] };

    const tz = Session.getScriptTimeZone();
    return {
      success:   true,
      historial: data.slice(1).reverse().map(row => {
        let fechaStr = '';
        if (row[1]) {
          const fObj = (row[1] instanceof Date) ? row[1] : new Date(row[1]);
          if (!isNaN(fObj.getTime())) fechaStr = Utilities.formatDate(fObj, tz, 'dd/MM/yyyy HH:mm');
        }
        return { nombre: row[0], fecha: fechaStr, url: row[2], tipo: row[3], registros: row[4], usuario: row[5] };
      })
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}