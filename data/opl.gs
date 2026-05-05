// =====================================================
// OPL.GS - Operadores Logísticos · Colbeef
// =====================================================
// OPL_Config:   A=Propietario, B=OPL, C=Total
// OPL_Progreso: A=OPL, B=Total, C=Despachados, D=Pendientes, E=Progreso%, F=FechaCalculo
//
// FLUJO:
//   1. resumirDecomisos() → actualizarCantidadesInicialesOPL(dataCavas, turno)
//      Cuenta VR únicas por propietario en Estado_Cavas
//      Actualiza OPL_Config col C con el total por propietario
//
//   2. procesarDespachos() → calcularProgresoOPL()
//      Lee OPL_Config (propietario→OPL→total)
//      Cuenta VR pendientes por propietario en Despachos_Cavas
//      Agrupa por OPL y guarda en OPL_Progreso
//      Solo muestra OPLs con total > 0 y progreso < 100%
// =====================================================

var OPL_DEFAULT = "TRANSCARNES";

var OPL_EXCEPCIONES_DEFAULT = [
  ["AVILA MONSALVE REINALDO",                       "DRA CAVA"],
  ["BENITEZ GARNICA CEFERINO",                      "EDGAR AM"],
  ["CALIXTO ARDILA JAIME",                          "DRA CAVA"],
  ["CARNES SANTACRUZ S.A.S",                        "CSZ B/GA"],
  ["CRUZ LEONIDAS",                                 "CAVA WO"],
  ["DRISTRIBUDORA DE CARNES AJR S.A.S",             "CAVA AJR"],
  ["INVERSIONES ZULUAGA RUEDA S.A.S.",              "MLT. GUARIN"],
  ["JAIMES BERMUDEZ JOSE MARIA",                    "MLT. GUARIN"],
  ["SANCHEZ CALDERON MIREYA",                       "CAVA MIREYA"],
  ["SUPERMERCADOS MAS POR MENOS S.A.S.",            "MLT. GUARIN"],
  ["TECNOLOGÍAS AGROPECUARIAS DE COLOMBIA S.A.S.",  "CAVA T.A"],
  ["ROMERO OSORIO JOHN IGNACIO",                    "SMOYA"],
  ["COLBEEF S.A.S",                                 "MLT. GUARIN"]
];

// ─────────────────────────────────────────────────────
// Hojas
// ─────────────────────────────────────────────────────
function _getOrCreateOplSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("OPL_Config");
  if (!sheet) {
    sheet = ss.insertSheet("OPL_Config");
    sheet.getRange(1,1,1,3)
         .setValues([["Propietario","OPL","Total"]])
         .setFontWeight("bold").setBackground("#259c39").setFontColor("#ffffff");
    var rows = OPL_EXCEPCIONES_DEFAULT.map(function(r){ return [r[0], r[1], 0]; });
    sheet.getRange(2,1,rows.length,3).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1,3);
  }
  return sheet;
}

function _getOrCreateOplProgresoSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("OPL_Progreso");
  if (!sheet) {
    sheet = ss.insertSheet("OPL_Progreso");
    sheet.getRange(1,1,1,6)
         .setValues([["OPL","Total","Despachados","Pendientes","Progreso%","FechaCalculo"]])
         .setFontWeight("bold").setBackground("#259c39").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
function _cargarMapaOPL() {
  var sheet = _getOrCreateOplSheet();
  var last  = sheet.getLastRow();
  var mapa  = {};
  if (last < 2) return mapa;
  sheet.getRange(2,1,last-1,2).getValues().forEach(function(r) {
    var prop = String(r[0]||"").trim().toUpperCase();
    var opl  = String(r[1]||"").trim();
    if (prop) mapa[prop] = opl || OPL_DEFAULT;
  });
  return mapa;
}

function _resolverOPL(prop, mapa) {
  if (!prop) return OPL_DEFAULT;
  return mapa[String(prop).trim().toUpperCase()] || OPL_DEFAULT;
}

// "2603-03498-60K" → "2603-03498"
function _codigoBase(id) {
  var s = String(id||"").trim().replace(/[^0-9\-]/g,'');
  var g = s.lastIndexOf("-");
  return g > 0 ? s.substring(0,g) : s;
}

// Cuenta juegos únicos por propietario usando código base
// Un juego = código base único (ej: 2603-03498) sin importar el tipo (VR, VB, Cabeza, Patas)
// Si hay decomiso de una parte, el juego sigue contando por el código base
function _contarJuegosporPropietario(rows, cols, turno) {
  var res    = {};
  var vistos = {};
  rows.forEach(function(fila) {
    var id     = String(fila[cols.id]    ||"").trim();
    var prop   = String(fila[cols.prop]  ||"").trim();
    var puesto = cols.puesto !== undefined ? String(fila[cols.puesto]||"").trim() : "";
    if (!id || !prop) return;
    // Filtrar por turno solo si:
    // 1. Hay turno activo
    // 2. El puesto tiene contenido
    // 3. El puesto contiene algún turno conocido (evitar filtrar puestos sin turno)
    if (turno && puesto) {
      var turnos = ["SxD","VxS","JxV","MxJ","MxM","LxM","DxL"];
      var tieneTurno = turnos.some(function(t){ return puesto.indexOf(t) !== -1; });
      if (tieneTurno && puesto.indexOf(turno) === -1) return;
    }
    var base = _codigoBase(id);
    if (!base || vistos[base]) return;
    vistos[base] = true;
    var key = prop.trim().toUpperCase();
    res[key] = (res[key]||0) + 1;
  });
  return res;
}

// Mantener por compatibilidad
function _contarVRporPropietario(rows, cols, turno) {
  return _contarJuegosporPropietario(rows, cols, turno);
}

// =====================================================
// actualizarCantidadesInicialesOPL
// Llamado desde resumirDecomisos() con dataCavas en memoria
// dataCavas = slice desde col B:
//   idx0=ID, idx3=Propietario, idx6=Tipo, idx8=Puesto
// =====================================================
function actualizarCantidadesInicialesOPL(dataCavas, turno) {
  try {
    var sheet = _getOrCreateOplSheet();

    // Salidas de Cava (Estado_Cavas) — índices del slice desde col B:
    //   idx0 = Código animal  (ej: 2603-03498-60)
    //   idx1 = Descripción    (Visceras Rojas / Cabeza / etc)
    //   idx3 = Cliente        (Propietario)
    //   idx8 = Destino        (Puesto — no se filtra por turno aquí)
    //
    // Contar códigos base únicos filtrando SOLO Visceras Rojas
    // SIN filtro de turno — el archivo tiene toda la cava
    var conteo = {};
    var vistos  = {};
    dataCavas.forEach(function(fila) {
      var id   = String(fila[0]||"").trim();  // Código
      var tipo = String(fila[1]||"").trim();  // Descripción
      var prop = String(fila[3]||"").trim();  // Cliente/Propietario
      if (!id || !prop) return;
      if (tipo !== "Visceras Rojas") return;  // solo VR como la macro VBA
      var base = _codigoBase(id);
      if (!base || vistos[base]) return;
      vistos[base] = true;
      conteo[prop.toUpperCase()] = (conteo[prop.toUpperCase()]||0) + 1;
    });

    Logger.log('OPL conteo inicial (Visceras Rojas, sin filtro turno): ' + JSON.stringify(conteo));

    // Limpiar col C (Total) de todas las filas
    var last = sheet.getLastRow();
    if (last >= 2) {
      sheet.getRange(2,3,last-1,1).setValue(0);
    }

    // Leer propietarios existentes → { PROP_UPPER: rowIndex }
    var propFila = {};
    if (last >= 2) {
      sheet.getRange(2,1,last-1,1).getValues().forEach(function(r,i) {
        var p = String(r[0]||"").trim().toUpperCase();
        if (p) propFila[p] = i + 2;
      });
    }

    // Actualizar col C con el total de cada propietario
    var mapa = _cargarMapaOPL();
    Object.keys(conteo).forEach(function(propUpper) {
      var total = conteo[propUpper];
      if (propFila[propUpper]) {
        sheet.getRange(propFila[propUpper], 3).setValue(total);
      } else {
        // Propietario nuevo — agregar fila
        var opl = mapa[propUpper] || OPL_DEFAULT;
        sheet.appendRow([propUpper, opl, total]);
        propFila[propUpper] = sheet.getLastRow();
      }
    });

    Logger.log('OPL_Config actualizado');
    return { success:true, conteo:conteo };
  } catch(e) {
    Logger.log('actualizarCantidadesInicialesOPL error: ' + e.toString());
    return { success:false, message:e.toString() };
  }
}

// =====================================================
// calcularProgresoOPL
// Llamado desde procesarDespachos()
// Lee OPL_Config, cruza con Despachos_Cavas,
// agrupa por OPL y guarda en OPL_Progreso
// =====================================================
function calcularProgresoOPL(totalJuegosParam) {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = _getOrCreateOplSheet();
    var fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

    // ── CASO ESPECIAL: totalJuegos = 0 → operación finalizada ──
    // Forzar todos los OPLs a 100% directamente
    if (totalJuegosParam !== undefined && Number(totalJuegosParam) === 0) {
      var last0 = sheet.getLastRow();
      if (last0 >= 2) {
        var cfg0 = sheet.getRange(2,1,last0-1,3).getValues();
        var rows0 = [];
        cfg0.forEach(function(r) {
          var opl   = String(r[1]||"").trim() || OPL_DEFAULT;
          var total = Number(r[2]||0);
          if (total > 0) rows0.push({ opl:opl, total:total });
        });
        // Agrupar por OPL
        var porOPL0 = {};
        rows0.forEach(function(r) {
          if (!porOPL0[r.opl]) porOPL0[r.opl] = 0;
          porOPL0[r.opl] += r.total;
        });
        var sheetProg0 = _getOrCreateOplProgresoSheet();
        var lastP0     = sheetProg0.getLastRow();
        if (lastP0 > 1) sheetProg0.getRange(2,1,lastP0-1,6).clearContent();
        var opls0 = Object.keys(porOPL0);
        if (opls0.length > 0) {
          sheetProg0.getRange(2,1,opls0.length,6).setValues(
            opls0.map(function(opl) {
              var t = porOPL0[opl];
              return [opl, t, t, 0, 100, fecha];
            })
          );
        }
        Logger.log('OPL: operacion finalizada, todos a 100%');
        return {
          success:             true,
          turno:               "",
          progreso:            [],
          operacionFinalizada: true,
          fecha:               fecha,
          totalJuegos:         0
        };
      }
    }

    // Turno activo desde Resumen_Despachos col H fila 1
    var sheetRD = ss.getSheetByName("Resumen_Despachos");
    var turno   = "";
    if (sheetRD && sheetRD.getLastRow() >= 1) {
      turno = String(sheetRD.getRange(1,8).getValue()||"").trim();
    }
    if (!turno) {
      Logger.log('OPL: sin turno activo');
      return { success:false, message:"Sin turno activo." };
    }

    // Leer OPL_Config: A=Propietario, B=OPL, C=Total
    var last = sheet.getLastRow();
    if (last < 2) return { success:false, message:"OPL_Config vacío." };

    var configData = sheet.getRange(2,1,last-1,3).getValues();

    // Verificar que hay totales
    var hayTotales = configData.some(function(r){ return Number(r[2]||0) > 0; });
    if (!hayTotales) {
      Logger.log('OPL: sin totales en OPL_Config — procesa Decomisos primero');
      return { success:false, message:"Sin totales. Procesa primero el módulo de Decomisos." };
    }

    // Contar VR pendientes por propietario desde Despachos_Cavas
    var sheetDC  = ss.getSheetByName("Despachos_Cavas");
    var pendProp = {};
    if (sheetDC && sheetDC.getLastRow() >= 15) {
      var numFilas = sheetDC.getLastRow() - 14;
      var dataDC   = sheetDC.getRange(15,1,numFilas,13).getValues();
      // Contar SOLO Visceras Rojas pendientes (igual que tarjeta despachos)
      var vistosDC = {};
      dataDC.forEach(function(fila) {
        var id     = String(fila[3]||"").trim();
        var tipo   = String(fila[7]||"").trim();
        var prop   = String(fila[4]||"").trim();
        var puesto = String(fila[9]||"").trim();
        if (!id || !prop || tipo !== "Visceras Rojas") return;
        if (turno && puesto.indexOf(turno) === -1) return;
        var base = _codigoBase(id);
        if (!base || vistosDC[base]) return;
        vistosDC[base] = true;
        var key = prop.trim().toUpperCase();
        pendProp[key] = (pendProp[key]||0) + 1;
      });
    }

    // Agrupar por OPL
    var porOPL = {};
    configData.forEach(function(r) {
      var prop  = String(r[0]||"").trim().toUpperCase();
      var opl   = String(r[1]||"").trim() || OPL_DEFAULT;
      var total = Number(r[2]||0);
      if (total <= 0) return; // ignorar propietarios sin datos

      var pendientes  = Math.min(pendProp[prop]||0, total);
      var despachados = Math.max(0, total - pendientes);

      if (!porOPL[opl]) porOPL[opl] = { total:0, despachados:0, pendientes:0 };
      porOPL[opl].total       += total;
      porOPL[opl].despachados += despachados;
      porOPL[opl].pendientes  += pendientes;
    });

    var fecha      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    var progreso   = []; // OPLs con pendientes (para mostrar en tarjeta)
    var todosOPL   = []; // Todos los OPLs (para guardar en sheet)

    Object.keys(porOPL).sort().forEach(function(opl) {
      var d   = porOPL[opl];
      if (d.total <= 0) return;
      var pct = Math.round((d.despachados / d.total) * 100);
      var item = {
        opl:         opl,
        total:       d.total,
        despachados: d.despachados,
        pendientes:  d.pendientes,
        progreso:    pct
      };
      todosOPL.push(item);           // guardar todos en sheet
      if (pct < 100) progreso.push(item); // mostrar en tarjeta solo incompletos
    });

    // Ordenar: más pendientes primero
    progreso.sort(function(a,b) {
      if (b.pendientes !== a.pendientes) return b.pendientes - a.pendientes;
      return a.opl.localeCompare(b.opl);
    });

    // Verificar si operación está completamente finalizada
    var operacionFinalizada = todosOPL.length > 0 && progreso.length === 0;
    // Guardar histórico solo si la operación acaba de finalizar por primera vez
    if (operacionFinalizada) {
      try {
        // Verificar si ya fue guardado este turno (col L = flag)
        var sheetRD3 = ss.getSheetByName("Resumen_Despachos");
        var yaGuardado = sheetRD3 ? String(sheetRD3.getRange(1,12).getValue()||"") === "1" : false;
        if (!yaGuardado) {
          guardarHistoricoOPL('Completo');
          if (sheetRD3) sheetRD3.getRange(1,12).setValue("1");
          Logger.log('OPL: histórico guardado automáticamente al finalizar');
        }
      } catch(eH){ Logger.log('Historico auto error: '+eH); }
    }

    // Guardar TODOS en OPL_Progreso (incluidos 100%) para mantener historial
    var sheetProg = _getOrCreateOplProgresoSheet();
    var lastP     = sheetProg.getLastRow();
    if (lastP > 1) sheetProg.getRange(2,1,lastP-1,6).clearContent();
    if (todosOPL.length > 0) {
      sheetProg.getRange(2,1,todosOPL.length,6).setValues(
        todosOPL.map(function(p) {
          return [p.opl, p.total, p.despachados, p.pendientes, p.progreso, fecha];
        })
      );
    }

    // Si totalJuegosDespachar = 0 → forzar todos a 100% con pendientes = 0
    // Usar el parámetro directo (más confiable que releer el sheet)
    var totalJuegosRD = (totalJuegosParam !== undefined) ? Number(totalJuegosParam) : -1;
    if (totalJuegosRD < 0) {
      // Fallback: leer del sheet
      var sheetRD2 = ss.getSheetByName("Resumen_Despachos");
      totalJuegosRD = sheetRD2 ? Number(sheetRD2.getRange(1,10).getValue()||0) : -1;
    }
    var operacionCero = totalJuegosRD === 0 && todosOPL.length > 0;

    if (operacionCero) {
      todosOPL.forEach(function(p) {
        p.despachados = p.total;
        p.pendientes  = 0;
        p.progreso    = 100;
      });
      progreso = []; // nada que mostrar en tarjeta
      operacionFinalizada = true;
      // Reescribir sheet con 100% para todos
      var lastP2 = sheetProg.getLastRow();
      if (lastP2 > 1) sheetProg.getRange(2,1,lastP2-1,6).clearContent();
      sheetProg.getRange(2,1,todosOPL.length,6).setValues(
        todosOPL.map(function(p) {
          return [p.opl, p.total, p.total, 0, 100, fecha];
        })
      );
    }

    Logger.log('OPL_Progreso: ' + todosOPL.length + ' total, ' + progreso.length + ' pendientes, cero=' + operacionCero);
    return {
      success:             true,
      turno:               turno,
      progreso:            progreso,
      operacionFinalizada: operacionFinalizada,
      fecha:               fecha,
      totalJuegos:         progreso.reduce(function(s,p){ return s+p.total; },0)
    };

  } catch(e) {
    Logger.log('calcularProgresoOPL error: ' + e.toString());
    return { success:false, message:e.toString() };
  }
}

// =====================================================
// resetearTotalesOPL — llamado al limpiar operación
// =====================================================
function resetearTotalesOPL() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Resetear col C de OPL_Config a 0
    var sheetCfg = ss.getSheetByName("OPL_Config");
    if (sheetCfg && sheetCfg.getLastRow() > 1) {
      sheetCfg.getRange(2,3,sheetCfg.getLastRow()-1,1).setValue(0);
    }

    // Limpiar OPL_Progreso
    var sheetProg = ss.getSheetByName("OPL_Progreso");
    if (sheetProg && sheetProg.getLastRow() > 1) {
      sheetProg.getRange(2,1,sheetProg.getLastRow()-1,6).clearContent();
    }

    return { success:true };
  } catch(e) { return { success:false, message:e.toString() }; }
}

// =====================================================
// getProgresoOPL — lee OPL_Progreso para el dashboard
// =====================================================
function getProgresoOPL() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("OPL_Progreso");
    if (!sheet || sheet.getLastRow() < 2) return { success:true, progreso:[], fecha:"" };

    var progreso   = [];
    var todosOPL   = [];
    var ultimaFecha = "";
    sheet.getRange(2,1,sheet.getLastRow()-1,6).getValues().forEach(function(r) {
      var opl   = String(r[0]||"").trim();
      var total = Number(r[1]||0);
      var pct   = Number(r[4]||0);
      if (!opl || total <= 0) return;
      var rawF  = r[5];
      var fStr  = rawF instanceof Date
        ? Utilities.formatDate(rawF, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm")
        : String(rawF||"");
      if (!ultimaFecha && fStr) ultimaFecha = fStr;
      var item = { opl:opl, total:total, despachados:Number(r[2]||0),
                   pendientes:Number(r[3]||0), progreso:pct, fecha:fStr };
      todosOPL.push(item);
      if (pct < 100) progreso.push(item); // solo incompletos para tarjeta
    });
    var operacionFinalizada = todosOPL.length > 0 && progreso.length === 0;
    return {
      success:             true,
      progreso:            progreso,
      operacionFinalizada: operacionFinalizada,
      fecha:               ultimaFecha
    };
  } catch(e) { return { success:false, message:e.toString() }; }
}

// =====================================================
// getOplConfig — CRUD configuración
// =====================================================
function getOplConfig() {
  try {
    var sheet = _getOrCreateOplSheet();
    var last  = sheet.getLastRow();
    var rows  = [];
    if (last >= 2) {
      sheet.getRange(2,1,last-1,3).getValues().forEach(function(r,i) {
        var prop = String(r[0]||"").trim();
        var opl  = String(r[1]||"").trim();
        if (prop) rows.push({ idx:i+2, propietario:prop, opl:opl, total:Number(r[2]||0) });
      });
    }
    return { success:true, rows:rows, oplDefault:OPL_DEFAULT };
  } catch(e) { return { success:false, message:e.toString() }; }
}

function upsertOpl(propietario, opl) {
  try {
    var sheet = _getOrCreateOplSheet();
    propietario = String(propietario||"").trim();
    opl         = String(opl||"").trim();
    if (!propietario) return { success:false, message:"Propietario vacío." };
    var last = sheet.getLastRow();
    if (last >= 2) {
      var data = sheet.getRange(2,1,last-1,2).getValues();
      for (var i=0; i<data.length; i++) {
        if (String(data[i][0]||"").trim().toUpperCase() === propietario.toUpperCase()) {
          sheet.getRange(i+2,2).setValue(opl);
          return { success:true, action:"updated" };
        }
      }
    }
    sheet.appendRow([propietario, opl, 0]);
    return { success:true, action:"inserted" };
  } catch(e) { return { success:false, message:e.toString() }; }
}

function eliminarOpl(rowIdx) {
  try {
    var sheet = _getOrCreateOplSheet();
    var idx   = Number(rowIdx);
    if (idx < 2 || idx > sheet.getLastRow()) return { success:false, message:"Fila inválida." };
    sheet.deleteRow(idx);
    return { success:true };
  } catch(e) { return { success:false, message:e.toString() }; }
}

// =====================================================
// getOplPorPropietario — configuración rápida en modal
// =====================================================
function getOplPorPropietario() {
  try {
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    var mapa = _cargarMapaOPL();

    var sheetRD = ss.getSheetByName("Resumen_Despachos");
    var turno   = "";
    if (sheetRD && sheetRD.getLastRow() >= 1) {
      turno = String(sheetRD.getRange(1,8).getValue()||"").trim();
    }

    // Fuente: Estado_Cavas (slice col B) o fallback Despachos_Cavas
    var sheetEC = ss.getSheetByName("Estado_Cavas");
    var datos   = [];
    var cols    = { id:0, tipo:6, prop:3, puesto:8 };

    if (sheetEC && sheetEC.getLastRow() >= 12) {
      var lastEC  = sheetEC.getLastRow();
      var startEC = lastEC >= 12 ? 12 : 2;
      datos = sheetEC.getRange(startEC,2,lastEC-startEC+1,9).getValues();
    } else {
      var sheetDC = ss.getSheetByName("Despachos_Cavas");
      if (sheetDC && sheetDC.getLastRow() >= 15) {
        datos = sheetDC.getRange(15,1,sheetDC.getLastRow()-14,13).getValues();
        cols  = { id:3, tipo:7, prop:4, puesto:9 };
      }
    }
    if (datos.length === 0) return { success:false, message:"No hay datos." };

    var conteo  = _contarJuegosporPropietario(datos, cols, turno);
    var oplsSet = {};
    oplsSet[OPL_DEFAULT] = true;
    Object.keys(mapa).forEach(function(k){ if(mapa[k]) oplsSet[mapa[k]]=true; });

    return {
      success: true,
      resultado: Object.keys(conteo).sort().map(function(propUpper) {
        return { propietario:propUpper, opl:mapa[propUpper]||OPL_DEFAULT, juegos:conteo[propUpper] };
      }),
      opls: Object.keys(oplsSet).sort()
    };
  } catch(e) { return { success:false, message:e.toString() }; }
}