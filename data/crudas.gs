// =====================================================
// CRUDAS.GS - Colbeef · Gestor de Vísceras
// =====================================================
// Lee Estado_Cavas (Salidas de Cava) y detecta juegos
// con CRUDAS en col O + Visceras Blancas en col C
// 
// Estructura dataCavas (slice desde col B, 9 cols):
//   idx0 = Código
//   idx1 = Descripción (Visceras Blancas, VR, Cabeza...)
//   idx3 = Cliente/Propietario
//   idx8 = Destino/Puesto
//
// Columna O en el archivo original = col 15 (base 1)
// En el slice desde col B = idx 13 (O - B = 13)
// =====================================================

var CRUDAS_VALORES = [
  "CRUDAS",
  "CRUDAS\nRETIRAR LIBRILLOS ASURCARNES",
  "CRUDAS\nRETIRAR LIBRILLOS ASURCARNESCOL",
  "CRUDAS\nRETIRAR LIBRILLOS DERIVADOS CARNICOS",
  "CRUDAS\nRETIRAR LIBRILLOS RUTH CACUA \nLENGUAS COMPLETAS SIN PELAR\nTRANSPORTA MULTICARNES",
  "CRUDAS\nRETIRAR LIBRILLOS SALOMON"
];

// ─────────────────────────────────────────────────────
// _esCruda — verifica si el valor de col O es CRUDAS
// ─────────────────────────────────────────────────────
function _esCruda(valor) {
  var v = String(valor||"").trim().toUpperCase();
  if (!v) return false;
  // Verificar si empieza con CRUDAS
  if (v === "CRUDAS") return true;
  if (v.indexOf("CRUDAS") === 0) return true;
  return false;
}

// =====================================================
// contarCrudas
// Lee Estado_Cavas y cuenta juegos únicos con cruda
// en Visceras Blancas
// Retorna: { total, codigos (Set de códigos base) }
// =====================================================
function contarCrudas() {
  try {
    var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet   = ss.getSheetByName("Estado_Cavas");
    if (!sheet || sheet.getLastRow() < 12) {
      return { success:true, total:0, codigos:[] };
    }

    var lastRow  = sheet.getLastRow();
    var startRow = lastRow >= 12 ? 12 : 2;
    // Leer 14 columnas desde col B (B a O)
    var datos    = sheet.getRange(startRow, 2, lastRow - startRow + 1, 14).getValues();

    // idx0=Código, idx1=Descripción, idx13=Col O (Crudas)
    var codigosUnicos = {};
    var total         = 0;

    datos.forEach(function(fila) {
      var codigo = String(fila[0]||"").trim();
      var desc   = String(fila[1]||"").trim();
      var colO   = fila[13]; // Col O

      if (!codigo) return;
      if (desc !== "Visceras Blancas") return;
      if (!_esCruda(colO)) return;

      var base = _codigoBase ? _codigoBase(codigo) : codigo;
      if (!base || codigosUnicos[base]) return;
      codigosUnicos[base] = true;
      total++;
    });

    Logger.log('Crudas encontradas: ' + total);
    return {
      success:  true,
      total:    total,
      codigos:  Object.keys(codigosUnicos)
    };

  } catch(e) {
    Logger.log('contarCrudas error: ' + e.toString());
    return { success:false, message:e.toString(), total:0, codigos:[] };
  }
}

// =====================================================
// getCrudasParaDespachos
// Retorna los códigos base de juegos con cruda
// para resaltar en la tabla de despachos
// =====================================================
function getCrudasParaDespachos() {
  try {
    var res = contarCrudas();
    return {
      success: res.success,
      total:   res.total,
      codigos: res.codigos
    };
  } catch(e) {
    return { success:false, total:0, codigos:[] };
  }
}

// =====================================================
// getPuestosCrudas
// Retorna qué puestos tienen al menos un juego cruda
// Cruza código base de crudas con Despachos_Cavas
// =====================================================
function getPuestosCrudas() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // 1. Obtener códigos base con cruda
    var resCrudas = contarCrudas();
    if (!resCrudas.success || resCrudas.codigos.length === 0) {
      return { success:true, puestos:{}, total:0 };
    }
    var setCrudas = {};
    resCrudas.codigos.forEach(function(c){ setCrudas[c] = true; });

    // 2. Cruzar con Despachos_Cavas para saber qué puestos
    var sheetDC = ss.getSheetByName("Despachos_Cavas");
    if (!sheetDC || sheetDC.getLastRow() < 15) {
      return { success:true, puestos:{}, total:resCrudas.total };
    }

    var numFilas = sheetDC.getLastRow() - 14;
    var dataDC   = sheetDC.getRange(15, 1, numFilas, 13).getValues();

    // Turno activo
    var sheetRD = ss.getSheetByName("Resumen_Despachos");
    var turno   = sheetRD ? String(sheetRD.getRange(1,8).getValue()||"").trim() : "";

    // puestos = { "puesto_string": true }
    var puestos = {};
    dataDC.forEach(function(fila) {
      var id     = String(fila[3]||"").trim();  // Identificación
      var puesto = String(fila[9]||"").trim();  // Puesto
      var tipo   = String(fila[7]||"").trim();  // Tipo

      if (!id || !puesto) return;
      if (turno && puesto.indexOf(turno) === -1) return;
      if (tipo !== "Visceras Blancas") return;

      var base = _codigoBase ? _codigoBase(id) : id;
      if (setCrudas[base]) {
        puestos[puesto] = true;
      }
    });

    Logger.log('Puestos con crudas: ' + Object.keys(puestos).length);
    return {
      success: true,
      puestos: puestos,
      total:   resCrudas.total,
      codigos: resCrudas.codigos
    };

  } catch(e) {
    Logger.log('getPuestosCrudas error: ' + e.toString());
    return { success:false, puestos:{}, total:0, codigos:[] };
  }
}

// =====================================================
// getCrudasDetalle
// Retorna tabla completa de crudas para el módulo
// =====================================================
function getCrudasDetalle() {
  try {
    var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetEC = ss.getSheetByName("Estado_Cavas");
    if (!sheetEC || sheetEC.getLastRow() < 12) {
      return { success:true, filas:[] };
    }

    var lastRow  = sheetEC.getLastRow();
    var startRow = 12;
    var datos    = sheetEC.getRange(startRow, 2, lastRow-startRow+1, 14).getValues();

    // Cargar mapa OPL
    var mapaOPL = _cargarMapaOPL ? _cargarMapaOPL() : {};

    // Agrupar crudas por código base + puesto
    var crudas = {};
    datos.forEach(function(fila) {
      var codigo = String(fila[0]||"").trim();  // Col B
      var desc   = String(fila[1]||"").trim();  // Col C
      var cliente= String(fila[3]||"").trim();  // Col E
      var puesto = String(fila[8]||"").trim();  // Col J
      var colO   = fila[13];                    // Col O

      if (!codigo || desc !== "Visceras Blancas") return;
      if (!_esCruda(colO)) return;

      var base = _codigoBase ? _codigoBase(codigo) : codigo;
      var key  = base + "||" + puesto;
      if (!crudas[key]) {
        var opl = mapaOPL[cliente.toUpperCase()] || "TRANSCARNES";
        crudas[key] = {
          codigo:      codigo,
          base:        base,
          puesto:      puesto,
          cliente:     cliente,
          opl:         opl,
          cantidad:    0,
          observacion: String(colO||"").split("\n")[0].trim()
        };
      }
      crudas[key].cantidad++;
    });

    var filas = Object.values(crudas).sort(function(a,b){
      return a.puesto.localeCompare(b.puesto);
    });

    return { success:true, filas:filas };
  } catch(e) {
    Logger.log('getCrudasDetalle error: ' + e.toString());
    return { success:false, message:e.toString(), filas:[] };
  }
}

// =====================================================
// getCrudasResumenPDF
// Retorna resumen agrupado por puesto+OPL para el PDF
// =====================================================
function getCrudasResumenPDF() {
  try {
    var res = getCrudasDetalle();
    if (!res.success || res.filas.length === 0) return { success:true, filas:[] };

    // Agrupar por puesto + OPL
    var grupos = {};
    res.filas.forEach(function(f) {
      var key = f.puesto + "||" + f.opl;
      if (!grupos[key]) {
        grupos[key] = { puesto:f.puesto, opl:f.opl, cantidad:0, codigos:[] };
      }
      grupos[key].cantidad += f.cantidad;
      grupos[key].codigos.push(f.codigo);
    });

    var filas = Object.values(grupos).sort(function(a,b){
      return a.puesto.localeCompare(b.puesto) || a.opl.localeCompare(b.opl);
    });

    return { success:true, filas:filas };
  } catch(e) {
    return { success:false, filas:[] };
  }
}