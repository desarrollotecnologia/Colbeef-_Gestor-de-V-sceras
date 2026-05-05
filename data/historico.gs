// =====================================================
// HISTORICO.GS - Colbeef · Gestor de Vísceras
// =====================================================
// Hoja: HISTORICO_OPL
// Columnas:
//   A=Fecha | B=Turno | C=OPL | D=Total | E=Despachados
//   F=Pendientes | G=Progreso% | H=Estado | I=FechaInicio
// =====================================================

var HISTORICO_SHEET = "HISTORICO_OPL";

var ESTADO_COMPLETO  = "Completo";
var ESTADO_PENDIENTE = "Cerrado con pendientes";

// ─────────────────────────────────────────────────────
// _getOrCreateHistoricoSheet
// ─────────────────────────────────────────────────────
function _getOrCreateHistoricoSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(HISTORICO_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(HISTORICO_SHEET);
    var headers = ["Fecha","Turno","OPL","Total","Despachados","Pendientes","Progreso%","Estado","FechaHora"];
    sheet.getRange(1,1,1,headers.length)
         .setValues([headers])
         .setFontWeight("bold")
         .setBackground("#259c39")
         .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 80);
    sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(8, 160);
    sheet.setColumnWidth(9, 140);
  }
  return sheet;
}

// ─────────────────────────────────────────────────────
// _getFechaInicioOperacion
// Lee la fecha de inicio de la operación actual
// Se guarda en Resumen_Despachos col K fila 1
// ─────────────────────────────────────────────────────
function _getFechaInicioOperacion() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Resumen_Despachos");
    if (!sheet || sheet.getLastRow() < 1) return new Date();
    var val = sheet.getRange(1,11).getValue(); // col K
    if (val instanceof Date) return val;
    return new Date();
  } catch(e) { return new Date(); }
}

// ─────────────────────────────────────────────────────
// guardarFechaInicioOperacion
// Se llama la PRIMERA vez que se procesa un despacho
// del turno — guarda la fecha de inicio en col K
// ─────────────────────────────────────────────────────
function guardarFechaInicioOperacion(turno) {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Resumen_Despachos");
    if (!sheet) return;
    // Solo guardar si no hay fecha de inicio ya (evitar sobreescribir)
    var val = sheet.getRange(1,11).getValue();
    if (!val) {
      sheet.getRange(1,11).setValue(new Date());
      Logger.log('Fecha inicio operación guardada: ' + turno);
    }
  } catch(e) { Logger.log('guardarFechaInicioOperacion error: ' + e); }
}

// ─────────────────────────────────────────────────────
// _yaExisteRegistro
// Verifica si ya hay un registro con la misma
// FechaInicio + Turno + OPL para evitar duplicados
// ─────────────────────────────────────────────────────
function _yaExisteRegistro(sheet, fechaInicioStr, turno, opl) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var data = sheet.getRange(2,1,last-1,3).getValues();
  var tz   = Session.getScriptTimeZone();
  for (var i = 0; i < data.length; i++) {
    // La fecha puede ser Date object o string — normalizar siempre a dd/MM/yyyy
    var rawF = data[i][0];
    var f = "";
    if (rawF instanceof Date) {
      f = Utilities.formatDate(rawF, tz, "dd/MM/yyyy");
    } else {
      f = String(rawF||"").trim();
    }
    var t = String(data[i][1]||"").trim();
    var o = String(data[i][2]||"").trim();
    if (f === fechaInicioStr && t === turno && o === opl) return true;
  }
  return false;
}

// =====================================================
// guardarHistoricoOPL
// Guarda snapshot de la operación en HISTORICO_OPL
// estado: "Completo" o "Cerrado con pendientes"
// =====================================================
function guardarHistoricoOPL(estado) {
  try {
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    var tz   = Session.getScriptTimeZone();

    // Leer turno activo
    var sheetRD = ss.getSheetByName("Resumen_Despachos");
    var turno   = "";
    if (sheetRD && sheetRD.getLastRow() >= 1) {
      turno = String(sheetRD.getRange(1,8).getValue()||"").trim();
    }
    if (!turno) {
      Logger.log('guardarHistoricoOPL: sin turno activo');
      return { success:false, message:"Sin turno activo." };
    }

    // Fecha de inicio de la operación
    var fechaInicio    = _getFechaInicioOperacion();
    var fechaInicioStr = Utilities.formatDate(fechaInicio, tz, "dd/MM/yyyy");
    var fechaHoraStr   = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm");
    var estadoFinal    = estado || ESTADO_COMPLETO;

    // Leer OPL_Progreso — tiene el estado actual de todos los OPLs
    var sheetProg = ss.getSheetByName("OPL_Progreso");
    if (!sheetProg || sheetProg.getLastRow() < 2) {
      Logger.log('guardarHistoricoOPL: OPL_Progreso vacío');
      return { success:false, message:"Sin datos en OPL_Progreso." };
    }

    var progData = sheetProg.getRange(2,1,sheetProg.getLastRow()-1,5).getValues();
    var sheetHist = _getOrCreateHistoricoSheet();

    // Construir filas a insertar (evitando duplicados)
    var nuevasFilas = [];
    progData.forEach(function(r) {
      var opl         = String(r[0]||"").trim();
      var total       = Number(r[1]||0);
      var despachados = Number(r[2]||0);
      var pendientes  = Number(r[3]||0);
      var progreso    = Number(r[4]||0);

      if (!opl || total <= 0) return;

      // Verificar duplicado
      if (_yaExisteRegistro(sheetHist, fechaInicioStr, turno, opl)) {
        Logger.log('Duplicado ignorado: ' + fechaInicioStr + ' ' + turno + ' ' + opl);
        return;
      }

      // Estado por fila: si progreso=100 es Completo, si no es el estado pasado
      var estadoFila = (progreso >= 100 || pendientes === 0) ? "Completo" : estadoFinal;

      nuevasFilas.push([
        fechaInicioStr,  // A = Fecha
        turno,           // B = Turno
        opl,             // C = OPL
        total,           // D = Total
        despachados,     // E = Despachados
        pendientes,      // F = Pendientes
        progreso,        // G = Progreso%
        estadoFila,      // H = Estado
        fechaHoraStr     // I = FechaHora cierre
      ]);
    });

    if (nuevasFilas.length === 0) {
      Logger.log('guardarHistoricoOPL: sin filas nuevas (todo ya registrado)');
      return { success:true, insertados:0, message:"Ya registrado." };
    }

    // Insertar todas las filas de una sola vez
    var lastRow = sheetHist.getLastRow();
    sheetHist.getRange(lastRow+1, 1, nuevasFilas.length, nuevasFilas[0].length)
             .setValues(nuevasFilas);

    // Colorear fila según estado
    nuevasFilas.forEach(function(_, i) {
      var row = lastRow + 1 + i;
      var bg  = estadoFinal === ESTADO_COMPLETO ? "#e8f5e9" : "#fff8e1";
      sheetHist.getRange(row, 1, 1, 9).setBackground(bg);
    });

    if (nuevasFilas.length > 0) {
      Logger.log('Histórico guardado: ' + nuevasFilas.length + ' OPLs, estado=' + estadoFinal);
    } else {
      Logger.log('Histórico: todas las filas ya existían, sin duplicados');
    }
    return { success:true, insertados:nuevasFilas.length, turno:turno, estado:estadoFinal };

  } catch(e) {
    Logger.log('guardarHistoricoOPL error: ' + e.toString());
    return { success:false, message:e.toString() };
  }
}

// =====================================================
// cerrarOperacion
// Llamado desde botón "Cerrar Operación" en la app
// Guarda histórico con pendientes y luego limpia
// =====================================================
function cerrarOperacion() {
  try {
    // 1. Guardar histórico con estado "Cerrado con pendientes"
    var resultHist = guardarHistoricoOPL(ESTADO_PENDIENTE);
    if (!resultHist.success) {
      return { success:false, message:"Error guardando histórico: " + resultHist.message };
    }

    // 2. Limpiar operación (igual que limpiarDespachos + resetearTotalesOPL)
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var cavSheet = ss.getSheetByName("Despachos_Cavas");
    if (cavSheet) cavSheet.clear();

    var resSheet = ss.getSheetByName("Resumen_Despachos");
    if (resSheet) resSheet.clear();

    // 3. Resetear OPL
    try { resetearTotalesOPL(); } catch(e) { Logger.log('OPL reset: ' + e); }

    return {
      success:    true,
      insertados: resultHist.insertados,
      turno:      resultHist.turno,
      estado:     ESTADO_PENDIENTE
    };

  } catch(e) {
    Logger.log('cerrarOperacion error: ' + e.toString());
    return { success:false, message:e.toString() };
  }
}

// =====================================================
// getHistoricoResumen
// Retorna los últimos N registros para mostrar
// en el dashboard (llamado desde index.html)
// =====================================================
function getHistoricoResumen(limite) {
  try {
    var sheet = _getOrCreateHistoricoSheet();
    if (sheet.getLastRow() < 2) return { success:true, datos:[] };

    var last  = sheet.getLastRow();
    var n     = Math.min(limite || 50, last - 1);
    var data  = sheet.getRange(last - n + 1, 1, n, 9).getValues();
    var tz    = Session.getScriptTimeZone();

    var datos = data.reverse().map(function(r) {
      return {
        fecha:       String(r[0]||""),
        turno:       String(r[1]||""),
        opl:         String(r[2]||""),
        total:       Number(r[3]||0),
        despachados: Number(r[4]||0),
        pendientes:  Number(r[5]||0),
        progreso:    Number(r[6]||0),
        estado:      String(r[7]||""),
        fechaHora:   String(r[8]||"")
      };
    });

    return { success:true, datos:datos };
  } catch(e) { return { success:false, message:e.toString() }; }
}