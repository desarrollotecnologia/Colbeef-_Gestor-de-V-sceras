// =====================================================
// DESPACHOS.GS - Colbeef · Gestor de Vísceras
// =====================================================
// Estructura archivo estado_de_productos (importado):
//   Fila 14 = encabezados, fila 15+ = datos
//   D(3)=Identificación  E(4)=Propietario
//   H(7)=Tipo de producto  J(9)=Puesto
// =====================================================

var PUESTOS_EXCLUIDOS_DESP = [
  "01305/TEMP1 /DxL///CALLE 23# 6-52 PLACITA GIRARDOT",
  "03105/Guarin //Cra 33a # 32-109",
  "05200/TEMP1 /DxL///CARRERA 3#61-39 LOS NARANJOS",
  "12157/Giron /DxL///CARRERA 22 # 13a-10 barrio EL CONSUELO",
  "379P/Piedecuesta /VxS/",
  "CAVA AJR/CAVA //CAVA AJR",
  "CAVA FORTUNATO/CAVA //CAVA",
  "CAVA MIREYA/CAVA //CAVA",
  "CAVA./CAVA ///",
  "CCARNES CAVA/CARNES Y CARNES //Cra 34 W #71-100 Bdga 46",
  "OLIMPICA/Barranquilla //6ta Entrada Km 2-701 via Caracoli-Malambo",
  "OLIMPICA/Barranquilla //6ta Entrada Km 2-701 vía Caracolí-Malambo",
  "RH32/Temp 2 Giron /DxL///CRA 29 # 33-70 LLANITO PARTE BAJA",
  "RH32/Temp 2 Girón /DxL///CRA 29 # 33-70 LLANITO PARTE BAJA"
];

var TIPOS_PRODUCTO = ["Cabeza", "Patas y Manos", "Visceras Blancas", "Visceras Rojas"];

function detectarTurnoDesdeDatos() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Despachos_Cavas");
    if (!sheet || sheet.getLastRow() < 15) return detectarTurnoPorDia();

    var turnos = ["SxD","VxS","JxV","MxJ","MxM","LxM","DxL"];
    var conteo = {};
    turnos.forEach(function(t){ conteo[t] = 0; });

    var muestra = Math.min(sheet.getLastRow() - 14, 300);
    var data    = sheet.getRange(15, 10, muestra, 1).getValues();

    data.forEach(function(fila){
      var puesto = String(fila[0] || "").trim();
      turnos.forEach(function(t){ if (puesto.indexOf(t) !== -1) conteo[t]++; });
    });

    var ganador = detectarTurnoPorDia(), max = 0;
    turnos.forEach(function(t){ if (conteo[t] > max){ max = conteo[t]; ganador = t; } });
    return ganador;
  } catch(e) { return detectarTurnoPorDia(); }
}

function detectarTurnoPorDia() {
  return ({0:"DxL",1:"LxM",2:"MxM",3:"MxJ",4:"JxV",5:"VxS",6:"SxD"})[new Date().getDay()] || "SxD";
}

function getTurnoActual() {
  return { success: true, turno: detectarTurnoDesdeDatos() };
}

function procesarDespachos(turnoForzado) {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Despachos_Cavas");

    if (!sheet)              throw new Error("Hoja Despachos_Cavas no encontrada. Importe el archivo primero.");
    if (sheet.getLastRow() < 15) throw new Error("El archivo no tiene datos desde fila 15.");

    var numFilas = sheet.getLastRow() - 14;
    var data     = sheet.getRange(15, 1, numFilas, 13).getValues();

    var turno = (turnoForzado && turnoForzado.length > 0)
      ? turnoForzado
      : detectarTurnoDesdeDatos();

    var mapaPuestos = {};

    data.forEach(function(fila){
      var id     = String(fila[3] || "").trim();
      var prop   = String(fila[4] || "").trim();
      var tipo   = String(fila[7] || "").trim();
      var puesto = String(fila[9] || "").trim();

      if (!id || !tipo || !puesto) return;
      if (puesto.indexOf(turno) === -1) return;

      for (var i = 0; i < PUESTOS_EXCLUIDOS_DESP.length; i++) {
        if (puesto === PUESTOS_EXCLUIDOS_DESP[i]) return;
      }

      if (!mapaPuestos[puesto]) {
        mapaPuestos[puesto] = {"Cabeza":0,"Patas y Manos":0,"Visceras Blancas":0,"Visceras Rojas":0};
      }
      if (TIPOS_PRODUCTO.indexOf(tipo) !== -1) mapaPuestos[puesto][tipo]++;
    });

    var resultado = [];
    Object.keys(mapaPuestos).sort().forEach(function(p){
      var r = { puesto: p };
      TIPOS_PRODUCTO.forEach(function(t){ r[t] = mapaPuestos[p][t] || 0; });
      resultado.push(r);
    });

    var totalJuegos = resultado.reduce(function(s,r){ return s + (r["Visceras Rojas"]||0); }, 0);

    _guardarResumenDespachos(ss, resultado, turno, totalJuegos);

    // Guardar fecha de inicio de operación (solo primera vez del turno)
    try { guardarFechaInicioOperacion(turno); } catch(eF){ Logger.log('FechaInicio: '+eF); }

    // ── AGREGAR OPL: calcular progreso tras cada despacho ──
    try { calcularProgresoOPL(totalJuegos); } catch(eOpl) { Logger.log('OPL recalc warning: ' + eOpl); }

    return {
      success:      true,
      turno:        turno,
      totalPuestos: resultado.length,
      totalJuegos:  totalJuegos,
      tipos:        TIPOS_PRODUCTO,
      resultado:    resultado
    };

  } catch(e) { return { success: false, message: e.toString() }; }
}

function _guardarResumenDespachos(ss, resultado, turno, totalJuegos) {
  var sheet = ss.getSheetByName("Resumen_Despachos");
  if (!sheet) sheet = ss.insertSheet("Resumen_Despachos");
  sheet.clear();

  // Siempre guardar metadatos (turno, fecha, totalJuegos) aunque no haya puestos
  var fechaStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  sheet.getRange(1, 8).setValue(turno);
  sheet.getRange(1, 9).setValue(fechaStr);
  sheet.getRange(1,10).setValue(totalJuegos);

  if (resultado.length === 0) return;

  var headers = ["Puesto","Cabeza","Patas y Manos","Visceras Blancas","Visceras Rojas","Total"];
  var filas   = [headers];

  resultado.forEach(function(r){
    var total = TIPOS_PRODUCTO.reduce(function(s,t){ return s+(r[t]||0); }, 0);
    filas.push([r.puesto, r["Cabeza"], r["Patas y Manos"], r["Visceras Blancas"], r["Visceras Rojas"], total]);
  });

  var tots = ["TOTAL"];
  TIPOS_PRODUCTO.forEach(function(t){
    tots.push(resultado.reduce(function(s,r){ return s+(r[t]||0); }, 0));
  });
  tots.push(resultado.reduce(function(s,r){
    return s + TIPOS_PRODUCTO.reduce(function(s2,t){ return s2+(r[t]||0); }, 0);
  }, 0));
  filas.push(tots);

  sheet.getRange(1, 1, filas.length, headers.length).setValues(filas);
  sheet.getRange(1,1,1,headers.length)
    .setFontWeight("bold").setBackground("#259c39").setFontColor("#ffffff");
  sheet.getRange(filas.length,1,1,headers.length)
    .setFontWeight("bold").setBackground("#e8f5e9");

}

function getResumenDespachoActual() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Resumen_Despachos");
    if (!sheet || sheet.getLastRow() < 2) return { success: true, hayDatos: false };

    var turno       = String(sheet.getRange(1,8).getValue()  || "");
    var rawFecha2   = sheet.getRange(1,9).getValue();
    var fechaUltima = "";
    if (rawFecha2) {
      try {
        var d2 = (rawFecha2 instanceof Date) ? rawFecha2 : new Date(rawFecha2);
        fechaUltima = Utilities.formatDate(d2, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      } catch(fe2) { fechaUltima = String(rawFecha2); }
    }
    var totalJuegos = Number(sheet.getRange(1,10).getValue() || 0);

    if (!turno) return { success: true, hayDatos: false };

    var lastRow = sheet.getLastRow();
    var data    = sheet.getRange(1, 1, lastRow, 6).getValues();

    var resultado = [];
    for (var i = 1; i < lastRow - 1; i++) {
      var fila = data[i];
      if (!fila[0] || fila[0] === "TOTAL") continue;
      var r = { puesto: String(fila[0]) };
      r["Cabeza"]           = Number(fila[1]||0);
      r["Patas y Manos"]    = Number(fila[2]||0);
      r["Visceras Blancas"] = Number(fila[3]||0);
      r["Visceras Rojas"]   = Number(fila[4]||0);
      resultado.push(r);
    }

    return {
      success:      true,
      hayDatos:     resultado.length > 0,
      turno:        turno,
      fechaUltima:  fechaUltima,
      totalJuegos:  totalJuegos,
      totalPuestos: resultado.length,
      tipos:        TIPOS_PRODUCTO,
      resultado:    resultado
    };

  } catch(e) { return { success: false, message: e.toString() }; }
}

function getDetallesPuesto(puesto) {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Despachos_Cavas");
    if (!sheet || sheet.getLastRow() < 15) return { success: true, filas: [] };

    var lastRow = sheet.getLastRow();
    var data    = sheet.getRange(15, 1, lastRow - 14, 13).getValues();
    var filas   = [];

    data.forEach(function(fila){
      var id     = String(fila[3] || "").trim();
      var prop   = String(fila[4] || "").trim();
      var tipo   = String(fila[7] || "").trim();
      var pFila  = String(fila[9] || "").trim();
      if (pFila === puesto && id) filas.push({ id:id, propietario:prop, tipo:tipo });
    });

    filas.sort(function(a,b){ return a.tipo.localeCompare(b.tipo); });
    return { success: true, puesto: puesto, filas: filas };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function getDashboardDataDespachos() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Resumen_Despachos");
    // getLastRow() puede ser 1 cuando resultado vacío pero metadatos sí guardados en fila 1
    if (!sheet || sheet.getLastRow() < 1) {
      return { totalJuegosDespachar: 0, turnoDespacho: "", ultimaActDespachos: "" };
    }
    // Verificar que hay metadatos (col I = fecha)
    if (!sheet.getRange(1,9).getValue()) {
      return { totalJuegosDespachar: 0, turnoDespacho: "", ultimaActDespachos: "" };
    }
    var turno       = String(sheet.getRange(1,8).getValue()  || "");
    var totalJuegos = Number(sheet.getRange(1,10).getValue() || 0);
    var rawFecha    = sheet.getRange(1,9).getValue();
    var fechaUltima = "";
    if (rawFecha) {
      try {
        var d = (rawFecha instanceof Date) ? rawFecha : new Date(rawFecha);
        fechaUltima = Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      } catch(fe) {
        fechaUltima = String(rawFecha);
      }
    }
    return { totalJuegosDespachar: totalJuegos, turnoDespacho: turno, ultimaActDespachos: fechaUltima };
  } catch(e) {
    return { totalJuegosDespachar: 0, turnoDespacho: "", ultimaActDespachos: "" };
  }
}

function limpiarDespachos() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var cavSheet = ss.getSheetByName("Despachos_Cavas");
    if (cavSheet) cavSheet.clear();

    var resSheet = ss.getSheetByName("Resumen_Despachos");
    if (resSheet) resSheet.clear();

    // ── AGREGAR OPL: resetear totales al limpiar ──
    try { resetearTotalesOPL(); } catch(e) { Logger.log('OPL reset: ' + e); }

    // Limpiar fecha de inicio y flag de histórico
    var resSheet2 = ss.getSheetByName('Resumen_Despachos');
    if (resSheet2) {
      try { resSheet2.getRange(1,11).clearContent(); } catch(e){}
      try { resSheet2.getRange(1,12).clearContent(); } catch(e){} // flag histórico
    }

    return { success: true };
  } catch(e) { return { success: false, message: e.toString() }; }
}