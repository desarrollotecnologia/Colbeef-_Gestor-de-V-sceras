// =====================================================
// planillaPuntos.gs - Colbeef · Gestor de Vísceras
// Módulo: Planilla de Puntos por OPL (VERSIÓN MEJORADA)
// =====================================================
// Lee datos desde fila 16 de Estado_Cavas
// Cada fila aporta 0.25, sin filtrar duplicados
// =====================================================

var PREFIJOS_TURNO = [
  '/LxM/', '/MxM/', '/MxJ/', '/JxV/', '/VxS/', '/SxD/', '/DxL/',
  '/LXM/', '/MXM/', '/MXJ/', '/JXV/', '/VXS/', '/SXD/', '/DXL/'
];

// ─────────────────────────────────────────────────────
// 1. EXTRAER PUESTO (normalizando ceros a la izquierda)
// ─────────────────────────────────────────────────────
function _extraerPuesto(destinoRaw) {
  if (!destinoRaw) return "";
  var d = String(destinoRaw).trim();
  PREFIJOS_TURNO.forEach(function(p) {
    var regex = new RegExp(p.replace(/\//g, '\\/'), 'gi');
    d = d.replace(regex, '');
  });
  var index = d.indexOf('/');
  var puesto = "";
  if (index !== -1) {
    puesto = d.substring(0, index).trim();
  } else {
    puesto = d.trim();
  }
  if (/^\d+$/.test(puesto)) {
    puesto = String(parseInt(puesto, 10));
  }
  return puesto;
}

// ─────────────────────────────────────────────────────
// 2. MAPA DE PLAZAS
// ─────────────────────────────────────────────────────
function _cargarMapaPlazas() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
  var mapa = {};
  if (!sheet || sheet.getLastRow() < 2) {
    inicializarBasePlazas();
    sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
    if (!sheet || sheet.getLastRow() < 2) return mapa;
  }
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  data.forEach(function(r) {
    var puesto = String(r[0] || "").trim();
    var plaza = String(r[1] || "").trim().toUpperCase();
    if (puesto && plaza) mapa[puesto] = plaza;
  });
  return mapa;
}

// ─────────────────────────────────────────────────────
// 3. OBTENER LISTA DE ZONAS ÚNICAS
// ─────────────────────────────────────────────────────
function getZonasUnicas() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
    if (!sheet || sheet.getLastRow() < 2) return [];
    var data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
    var zonas = {};
    data.forEach(function(r) {
      var zona = String(r[0] || "").trim().toUpperCase();
      if (zona) zonas[zona] = true;
    });
    return Object.keys(zonas).sort();
  } catch(e) { return []; }
}

// ─────────────────────────────────────────────────────
// 4. INICIALIZAR BASE DE DATOS DE PLAZAS
// ─────────────────────────────────────────────────────
function inicializarBasePlazas() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
  if (sheet) return { success: true, existe: true };
  sheet = ss.insertSheet("BASE_DE_DATOS_PLAZAS");
  sheet.getRange(1, 1, 1, 2).setValues([["Puesto", "Plaza"]]);
  sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#259c39").setFontColor("white");
  sheet.setFrozenRows(1);
  var datosIniciales = [
    ["01028", "CENTRO"], ["01803", "ENTRADA A CAVA"], ["1203", "CAMPO HERMOSO"],
    ["SP.", "LAGOS"], ["A\\", "VILLABEL"], ["1003", "CENTRO"],
    ["E14", "GIRON"], ["A9", "GIRON"], ["E5", "GIRON"],
    ["10150", "PIEDECUESTA"], ["10308", "PIEDECUESTA"], ["10320", "PIEDECUESTA"],
    ["379P", "PIEDECUESTA"], ["ANAP", "PIEDECUESTA"], ["CRAX", "PIEDECUESTA"],
    ["MRP3", "PIEDECUESTA"], ["NESP", "PIEDECUESTA"], ["PAME", "PIEDECUESTA"],
    ["TOP", "PIEDECUESTA"], ["YP", "PIEDECUESTA"]
  ];
  if (datosIniciales.length) sheet.getRange(2, 1, datosIniciales.length, 2).setValues(datosIniciales);
  sheet.autoResizeColumns(1, 2);
  return { success: true, existe: false, insertados: datosIniciales.length };
}

// ─────────────────────────────────────────────────────
// 5. CONSOLIDAR DATOS (lee desde fila 16 de Estado_Cavas)
// ─────────────────────────────────────────────────────
function consolidarDatos() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetEC = ss.getSheetByName("Estado_Cavas");
    if (!sheetEC || sheetEC.getLastRow() < 16) {
      return { success: false, message: "No hay datos en Estado_Cavas (mínimo fila 16). Procesa primero el módulo de Decomisos." };
    }

    var mapaPlazas = _cargarMapaPlazas();
    var mapaOPL = (typeof _cargarMapaOPL === 'function') ? _cargarMapaOPL() : {};
    var tz = Session.getScriptTimeZone();
    var fechaHoy = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy");

    var sheetRD = ss.getSheetByName("Resumen_Despachos");
    var turno = sheetRD ? String(sheetRD.getRange(1, 8).getValue() || "").trim() : "";

    var startRow = 16;
    var lastRow = sheetEC.getLastRow();
    var datosEC = sheetEC.getRange(startRow, 2, lastRow - startRow + 1, 14).getValues();

    var consolidado = [];
    var noEncontrados = {};

    datosEC.forEach(function(fila) {
      var codigo = String(fila[0] || "").trim();
      var descripcion = String(fila[1] || "").trim();
      var propietario = String(fila[3] || "").trim();
      var destinoRaw = String(fila[8] || "").trim();

      if (!codigo || !descripcion) return;

      var puesto = _extraerPuesto(destinoRaw);
      if (!puesto) return;

      var plaza = mapaPlazas[puesto];
      if (!plaza) {
        plaza = "ENTRADA A CAVA";
        noEncontrados[puesto] = (noEncontrados[puesto] || 0) + 1;
      }
      var opl = mapaOPL[propietario.toUpperCase()] || "TRANSCARNES";

      var cantidad = 0.25;

      consolidado.push([codigo, descripcion, propietario, destinoRaw, puesto, plaza, opl, cantidad, fechaHoy, turno]);
    });

    if (consolidado.length === 0) {
      return { success: false, message: "No se encontraron registros en Estado_Cavas (fila 16 en adelante)." };
    }

    var sheetCons = ss.getSheetByName("CONSOLIDADO");
    if (!sheetCons) sheetCons = ss.insertSheet("CONSOLIDADO");
    else sheetCons.clearContents();

    var encabezados = [["Código", "Tipo", "Propietario", "DestinoRaw", "Puesto", "Plaza", "OPL", "Cantidad", "Fecha", "Turno"]];
    sheetCons.getRange(1, 1, 1, 10).setValues(encabezados);
    sheetCons.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#259c39").setFontColor("white");

    if (consolidado.length) {
      sheetCons.getRange(2, 1, consolidado.length, 10).setValues(consolidado);
    }

    var lastRowCons = consolidado.length + 1;
    if (lastRowCons >= 2) {
      sheetCons.getRange(2, 8, lastRowCons - 1, 1).setNumberFormat("0.00");
    }

    sheetCons.setFrozenRows(1);
    sheetCons.autoResizeColumns(1, 10);

    if (Object.keys(noEncontrados).length) {
      Logger.log("Puestos sin mapeo: " + JSON.stringify(noEncontrados));
    }
    return { success: true, procesados: consolidado.length, turno: turno, faltantes: Object.keys(noEncontrados) };
  } catch (e) {
    Logger.log("consolidarDatos error: " + e);
    return { success: false, message: e.toString() };
  }
}

// ─────────────────────────────────────────────────────
// 6. OBTENER LISTA DE OPLs
// ─────────────────────────────────────────────────────
function getListaOPLsParaPlanilla() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("CONSOLIDADO");
    if (!sheet || sheet.getLastRow() < 2) return [];
    var data = sheet.getRange(2, 7, sheet.getLastRow() - 1, 1).getValues();
    var set = {};
    data.forEach(function(r) {
      var opl = String(r[0] || "").trim();
      if (opl) set[opl] = true;
    });
    return Object.keys(set).sort();
  } catch (e) { return []; }
}

// ─────────────────────────────────────────────────────
// 7. OBTENER RESUMEN DE TODOS LOS OPLs
// ─────────────────────────────────────────────────────
function getResumenTodosOPLs() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("CONSOLIDADO");
    if (!sheet || sheet.getLastRow() < 2) return { success: true, resumen: [] };
    
    var last = sheet.getLastRow();
    var data = sheet.getRange(2, 1, last - 1, 10).getValues();
    var totalGeneral = 0;
    var totalPorOPL = {};
    
    data.forEach(function(fila) {
      var opl = String(fila[6] || "").trim();
      var cantidad = Number(fila[7] || 0);
      if (opl && cantidad > 0) {
        totalPorOPL[opl] = (totalPorOPL[opl] || 0) + cantidad;
        totalGeneral += cantidad;
      }
    });
    
    var resumen = [];
    for (var opl in totalPorOPL) {
      var total = totalPorOPL[opl];
      var porcentaje = totalGeneral > 0 ? (total / totalGeneral * 100).toFixed(1) : "0.0";
      resumen.push({ opl: opl, totalJuegos: Math.round(total * 100) / 100, porcentaje: porcentaje });
    }
    resumen.sort(function(a, b) { return b.totalJuegos - a.totalJuegos; });
    
    return { success: true, resumen: resumen, totalGeneral: Math.round(totalGeneral * 100) / 100 };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ─────────────────────────────────────────────────────
// 8. GENERAR PLANILLA DE PUNTOS PARA UN OPL
// ─────────────────────────────────────────────────────
function generarPlanillaPuntos(opl) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("CONSOLIDADO");
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: false, message: "No hay datos. Ejecuta 'consolidarDatos' primero." };
    }

    var last = sheet.getLastRow();
    var data = sheet.getRange(2, 1, last - 1, 10).getValues();

    var zonasMap = {};
    var totalOPL = 0;
    var totalGlobal = 0;
    var turno = "";

    data.forEach(function(fila) {
      var oplReg = String(fila[6] || "").trim();
      var zona = String(fila[5] || "ENTRADA A CAVA").trim();
      var puesto = String(fila[4] || "").trim();
      var cantidad = Number(fila[7]);
      if (isNaN(cantidad)) cantidad = 0;
      if (turno === "" && fila[8]) turno = String(fila[8]);
      totalGlobal += cantidad;

      if (opl !== "TODOS" && oplReg !== opl) return;

      totalOPL += cantidad;
      if (!zonasMap[zona]) zonasMap[zona] = { total: 0, puestos: {} };
      zonasMap[zona].total += cantidad;
      zonasMap[zona].puestos[puesto] = (zonasMap[zona].puestos[puesto] || 0) + cantidad;
    });

    var zonasArray = Object.keys(zonasMap).map(function(zona) {
      var puestosArray = Object.keys(zonasMap[zona].puestos).map(function(p) {
        return { puesto: p, cantidad: Math.round(zonasMap[zona].puestos[p] * 100) / 100 };
      }).sort(function(a, b) { return a.puesto.localeCompare(b.puesto); });
      return {
        nombre: zona,
        total: Math.round(zonasMap[zona].total * 100) / 100,
        puestos: puestosArray
      };
    }).sort(function(a, b) { return b.total - a.total; });

    var pct = totalGlobal > 0 ? (totalOPL / totalGlobal * 100).toFixed(1) : "0.0";

    return {
      success: true,
      opl: opl,
      zonas: zonasArray,
      totalOPL: Math.round(totalOPL * 100) / 100,
      totalGlobal: Math.round(totalGlobal * 100) / 100,
      porcentaje: pct,
      turno: turno,
      fecha: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy")
    };
  } catch (e) {
    Logger.log("generarPlanillaPuntos error: " + e);
    return { success: false, message: e.toString() };
  }
}

// ─────────────────────────────────────────────────────
// 9. GENERAR HTML PARA PDF (formato horizontal A4 - SIN RESUMEN GENERAL)
// ─────────────────────────────────────────────────────
function generarHTMLPlanillaPDF(opl) {
  var datos = generarPlanillaPuntos(opl);
  if (!datos.success) return { success: false, message: datos.message };
  
  // ELIMINADO: ya no se obtiene el resumen de todos los OPLs
  
  var zonasHtml = "";
  datos.zonas.forEach(function(z) {
    var filas = z.puestos.map(function(p) {
      var cantStr = (p.cantidad % 1 === 0) ? p.cantidad.toString() : p.cantidad.toFixed(2);
      return "<tr><td style='text-align:left;padding:5px 8px;border-bottom:1px solid #d1fae5;font-weight:500;font-size:0.75rem;'>" + p.puesto + "</td>"
        + "<td style='text-align:center;padding:5px 8px;border-bottom:1px solid #d1fae5;font-weight:700;color:#259c39;font-size:0.75rem;'>" + cantStr + "</td></tr>";
    }).join("");

    zonasHtml += "<div style='background:white;border-radius:8px;border:1px solid #b7e4c7;overflow:hidden;min-width:160px;max-width:200px;flex:0 0 auto;page-break-inside:avoid;'>"
      + "<div style='background:#259c39;color:white;font-weight:700;padding:6px 8px;text-align:center;font-size:0.8rem;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact;'>"
      + z.nombre + " <span style='background:rgba(255,255,255,0.2);padding:2px 6px;border-radius:20px;font-size:0.7rem;'>" + z.total + "</span></div>"
      + "<table style='width:100%;border-collapse:collapse;font-size:0.7rem;'>"
      + "<thead>"
      + "<tr><th style='background:#e8f5e9;padding:5px 6px;font-weight:700;text-align:left;font-size:0.7rem;'>Puesto</th>"
      + "<th style='background:#e8f5e9;padding:5px 6px;font-weight:700;text-align:center;font-size:0.7rem;'>Cant</th></tr>"
      + "</thead>"
      + "<tbody>" + filas + "</tbody>"
      + "</table></div>";
  });

  var fechaActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  var html = "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'>"
    + "<style>"
    + "*{margin:0;padding:0;box-sizing:border-box;}"
    + "body{font-family:'Segoe UI',Arial,sans-serif;background:white;padding:0;margin:0;}"
    + ".page{max-width:1000px;margin:0 auto;padding:0.5cm;}"
    + ".watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);"
    + "width:100%;text-align:center;z-index:999;opacity:0.06;pointer-events:none;"
    + "font-size:12rem;font-weight:800;letter-spacing:0.2rem;white-space:nowrap;}"
    + ".watermark span:first-child{color:#259c39;}.watermark span:last-child{color:#dc2626;}"
    + "@page{size:A4 landscape;margin:0.6cm;}"
    + "@media print{body{margin:0;padding:0;}.page{padding:0;}}"
    + ".titulo-principal{text-align:center;margin-bottom:0.8rem;}"
    + ".titulo-principal h3{font-size:1.3rem;font-weight:800;color:#259c39;margin:0 0 3px 0;}"
    + ".subtitulo{font-size:0.85rem;color:#6b7280;margin-top:3px;}"
    + ".planilla-grid{display:flex;flex-wrap:wrap;gap:0.4rem;justify-content:flex-start;margin-bottom:0.8rem;}"
    + ".resumen-card{background:white;border-radius:10px;padding:0.5rem 1rem;border:1px solid #b7e4c7;min-width:280px;margin:0 auto;}"
    + ".resumen-card table{width:100%;border-collapse:collapse;}"
    + ".resumen-card th{background:#259c39;color:white;padding:8px 10px;font-size:0.8rem;text-align:center;}"
    + ".resumen-card td{padding:6px 10px;text-align:center;border-bottom:1px solid #b7e4c7;font-size:0.8rem;}"
    + ".resumen-card .total-row td{background:#e8f5e9;font-weight:800;}"
    + ".footer{text-align:center;margin-top:0.8rem;font-size:0.65rem;color:#9ca3af;}"
    + "</style></head><body>"
    + "<div class='page'>"
    + "<div class='watermark'><span>Col</span><span>beef</span></div>"
    + "<div class='titulo-principal'>"
    + "<h3>📋 LISTA DE PUESTOS: VISCERAS DE SALIDA DE CAVA</h3>"
    + "<div class='subtitulo'>Fecha: " + fechaActual + " | OPL: <strong>" + datos.opl + "</strong>"
    + " | Total: <strong>" + datos.totalOPL + "</strong> juegos"
    + " | Participación: <strong>" + datos.porcentaje + "%</strong></div>"
    + "</div>"
    + "<div class='planilla-grid'>" + zonasHtml + "</div>"
    + "<div class='resumen-final' style='display:flex;justify-content:center;margin-top:0.8rem;margin-bottom:0.5rem;'>"
    + "<div class='resumen-card'>"
    + "<table>"
    + "<thead>"
    + "<tr><th>Operador Logístico</th><th>Total Juegos</th><th>Participación</th></tr>"
    + "</thead>"
    + "<tbody><tr class='total-row'>"
    + "<td><strong>" + datos.opl + "</strong></td>"
    + "<td><strong>" + datos.totalOPL + "</strong></td>"
    + "<td><strong>" + datos.porcentaje + "%</strong></td>"
    + "</tr></tbody>"
    + "</table>"
    + "</div>"
    + "</div>"
    + "<div class='footer'>Colbeef S.A.S · Gestión de Vísceras · " + fechaActual + "</div>"
    + "</div></body></html>";
  return { success: true, html: html };
}

// ─────────────────────────────────────────────────────
// 10. EXPORTAR A PDF
// ─────────────────────────────────────────────────────
function exportarPlanillaPDF(opl) {
  var htmlRes = generarHTMLPlanillaPDF(opl);
  if (!htmlRes.success) return { success: false, message: htmlRes.message };
  try {
    var blob = Utilities.newBlob(htmlRes.html, "text/html", "planilla.html");
    var pdfBlob = blob.getAs("application/pdf");
    var nombre = "Planilla_Puntos_" + opl + "_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmm") + ".pdf";
    pdfBlob.setName(nombre);
    var file = DriveApp.createFile(pdfBlob);
    return { success: true, url: file.getUrl() };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// ─────────────────────────────────────────────────────
// 11. MOSTRAR RESUMEN DE PARTICIPACIÓN POR OPL EN PANTALLA
// ─────────────────────────────────────────────────────
function mostrarResumenGeneral() {
  var resumenTodos = getResumenTodosOPLs();
  if (!resumenTodos.success) {
    SpreadsheetApp.getUi().alert('Error', resumenTodos.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  if (resumenTodos.resumen.length === 0) {
    SpreadsheetApp.getUi().alert('Información', 'No hay datos de resumen disponibles. Ejecuta "Consolidar Datos" primero.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  // Obtener fecha actual
  var fechaActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  // Generar filas de la tabla
  var filasResumen = '';
  resumenTodos.resumen.forEach(function(item) {
    filasResumen += '<tr style="border-bottom:1px solid #e0e0e0;">'
      + '<td style="padding:12px 15px; text-align:left; font-weight:500;">' + item.opl + '<tr>'
      + '<td style="padding:12px 15px; text-align:center; font-weight:600;">' + item.totalJuegos + '</td>'
      + '<td style="padding:12px 15px; text-align:center; font-weight:600; color:#259c39;">' + item.porcentaje + '%' + '</tr>'
      + '</tr>';
  });
  
  // Agregar fila de total general
  filasResumen += '<tr style="background:#e8f5e9; font-weight:bold; border-top:2px solid #259c39;">'
    + '<td style="padding:12px 15px; text-align:left; font-size:1rem;">📊 TOTAL GENERAL' + '</td>'
    + '<td style="padding:12px 15px; text-align:center; font-size:1rem; font-weight:800;">' + resumenTodos.totalGeneral + '</td>'
    + '<td style="padding:12px 15px; text-align:center; font-size:1rem; font-weight:800;">100%' + '</td>'
    + '</tr>';
  
  // HTML del diálogo
  var html = '<!DOCTYPE html>'
    + '<html>'
    + '<head>'
    + '<meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<title>Resumen Despacho por Operador Logístico</title>'
    + '<style>'
    + '* { margin: 0; padding: 0; box-sizing: border-box; }'
    + 'body { '
    + '  font-family: "Segoe UI", Arial, sans-serif; '
    + '  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); '
    + '  min-height: 100vh; '
    + '  padding: 2rem; '
    + '}'
    + '.container { '
    + '  max-width: 800px; '
    + '  margin: 0 auto; '
    + '  background: white; '
    + '  border-radius: 20px; '
    + '  box-shadow: 0 20px 60px rgba(0,0,0,0.3); '
    + '  overflow: hidden; '
    + '  animation: slideIn 0.3s ease-out; '
    + '}'
    + '@keyframes slideIn { '
    + '  from { transform: translateY(-30px); opacity: 0; } '
    + '  to { transform: translateY(0); opacity: 1; } '
    + '}'
    + '.header { '
    + '  background: linear-gradient(135deg, #259c39 0%, #1e7a2e 100%); '
    + '  color: white; '
    + '  padding: 1.5rem; '
    + '  text-align: center; '
    + '}'
    + '.header h1 { '
    + '  font-size: 1.5rem; '
    + '  margin-bottom: 0.3rem; '
    + '}'
    + '.header p { '
    + '  opacity: 0.9; '
    + '  font-size: 0.85rem; '
    + '}'
    + '.content { '
    + '  padding: 1.5rem; '
    + '  max-height: 60vh; '
    + '  overflow-y: auto; '
    + '}'
    + 'table { '
    + '  width: 100%; '
    + '  border-collapse: collapse; '
    + '  background: white; '
    + '  border-radius: 10px; '
    + '  overflow: hidden; '
    + '  box-shadow: 0 2px 8px rgba(0,0,0,0.08); '
    + '}'
    + 'thead tr { '
    + '  background: #259c39; '
    + '  color: white; '
    + '}'
    + 'th { '
    + '  padding: 14px 16px; '
    + '  text-align: center; '
    + '  font-size: 0.9rem; '
    + '  font-weight: 600; '
    + '}'
    + 'th:first-child { '
    + '  text-align: left; '
    + '}'
    + 'td { '
    + '  padding: 12px 16px; '
    + '  border-bottom: 1px solid #e0e0e0; '
    + '  font-size: 0.9rem; '
    + '} '
    + 'td:first-child { '
    + '  text-align: left; '
    + '  font-weight: 500; '
    + '}'
    + 'td:not(:first-child) { '
    + '  text-align: center; '
    + '}'
    + '.footer { '
    + '  padding: 1rem 1.5rem; '
    + '  background: #f8f9fa; '
    + '  text-align: center; '
    + '  color: #6c757d; '
    + '  font-size: 0.8rem; '
    + '  border-top: 1px solid #e0e0e0; '
    + '}'
    + '.btn-cerrar { '
    + '  background: #dc2626; '
    + '  color: white; '
    + '  border: none; '
    + '  padding: 10px 20px; '
    + '  border-radius: 8px; '
    + '  cursor: pointer; '
    + '  font-size: 0.9rem; '
    + '  font-weight: 600; '
    + '  margin-top: 1rem; '
    + '  transition: transform 0.2s, background 0.2s; '
    + '}'
    + '.btn-cerrar:hover { '
    + '  background: #b91c1c; '
    + '  transform: scale(1.05); '
    + '}'
    + '</style>'
    + '</head>'
    + '<body>'
    + '<div class="container">'
    + '<div class="header">'
    + '<h1>📊 RESUMEN DESPACHO POR OPERADOR LOGÍSTICO</h1>'
    + '<p>' + fechaActual + '</p>'
    + '</div>'
    + '<div class="content">'
    + ' <caption style="caption-side: top; text-align: center; padding: 10px; font-weight: bold; color: #259c39;">📋 Distribución de Juegos por Operador</caption>'
    + '<table>'
    + '<thead>'
    + ' <tr>'
    + '   <th>Operador Logístico</th>'
    + '   <th>Total Juegos</th>'
    + '   <th>Participación</th>'
    + ' </tr>'
    + '</thead>'
    + '<tbody>'
    + filasResumen
    + '</tbody>'
    + '</table>'
    + '<div style="text-align: center; margin-top: 1.5rem;">'
    + '<button class="btn-cerrar" onclick="google.script.host.close()">✖️ Cerrar</button>'
    + '</div>'
    + '</div>'
    + '<div class="footer">'
    + 'Colbeef S.A.S · Gestión de Vísceras'
    + '</div>'
    + '</div>'
    + '</body>'
    + '</html>';
  
  var htmlOutput = HtmlService
    .createHtmlOutput(html)
    .setWidth(750)
    .setHeight(550)
    .setTitle('Resumen Despacho por Operador Logístico');
  
  SpreadsheetApp.getUi()
    .showModalDialog(htmlOutput, '📊 Resumen Despacho por Operador Logístico');
}

// ─────────────────────────────────────────────────────
// 12. CONSOLIDAR DATOS CON UI
// ─────────────────────────────────────────────────────
function consolidarDatosUI() {
  var resultado = consolidarDatos();
  var ui = SpreadsheetApp.getUi();
  if (resultado.success) {
    var mensaje = "✅ Éxito\n\n" +
      "📊 Procesados: " + resultado.procesados + " registros\n" +
      "🕒 Turno: " + (resultado.turno || 'No definido') + "\n";
    
    if (resultado.faltantes && resultado.faltantes.length > 0) {
      mensaje += "\n⚠️ Puestos sin mapear: " + resultado.faltantes.length + "\n" +
        "📍 Revisar hoja BASE_DE_DATOS_PLAZAS";
    }
    
    ui.alert('✅ Consolidación Exitosa', mensaje, ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Error', resultado.message, ui.ButtonSet.OK);
  }
}

// ─────────────────────────────────────────────────────
// 13. MENÚ PERSONALIZADO (se ejecuta al abrir el archivo)
// ─────────────────────────────────────────────────────
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createMenu('📋 Vísceras Colbeef');
  menu.addItem('🔄 Consolidar Datos', 'consolidarDatosUI');
  menu.addSeparator();
  menu.addItem('📊 RESUMEN GENERAL', 'mostrarResumenGeneral');
  menu.addSeparator();
  menu.addItem('⚙️ Configurar Plazas', 'mostrarConfiguracionPlazas');
  menu.addToUi();
}

// ─────────────────────────────────────────────────────
// 14. MOSTRAR CONFIGURACIÓN DE PLAZAS
// ─────────────────────────────────────────────────────
function mostrarConfiguracionPlazas() {
  var html = '<!DOCTYPE html>'
    + '<html>'
    + '<head>'
    + '<meta charset="UTF-8">'
    + '<style>'
    + 'body { font-family: "Segoe UI", Arial, sans-serif; padding: 20px; }'
    + 'h3 { color: #259c39; }'
    + '.info { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0; }'
    + 'button { background: #259c39; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }'
    + 'button:hover { background: #1e7a2e; }'
    + '</style>'
    + '</head>'
    + '<body>'
    + '<h3>⚙️ Configuración de Plazas</h3>'
    + '<div class="info">'
    + '<p><strong>📌 Instrucciones:</strong></p>'
    + '<p>La configuración de plazas se realiza directamente en la hoja de cálculo:</p>'
    + '<p><strong>📊 BASE_DE_DATOS_PLAZAS</strong></p>'
    + '<hr>'
    + '<p><strong>Columnas:</strong></p>'
    + '<ul>'
    + '<li><strong>Columna A:</strong> Puesto (código del puesto)</li>'
    + '<li><strong>Columna B:</strong> Plaza (zona/ubicación)</li>'
    + '</ul>'
    + '<p><strong>Ejemplo:</strong> 01028 → CENTRO</p>'
    + '</div>'
    + '<button onclick="google.script.host.close()">Cerrar</button>'
    + '</body>'
    + '</html>';
  
  var dialog = HtmlService.createHtmlOutput(html)
    .setWidth(450)
    .setHeight(350)
    .setTitle('Configuración de Plazas');
  
  SpreadsheetApp.getUi().showModalDialog(dialog, 'Configuración de Plazas');
}

// =====================================================
// CONFIGURACIÓN DE PLAZAS (CRUD MEJORADO)
// =====================================================
function getPlazas() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
    if (!sheet) return { success: true, rows: [] };
    var last = sheet.getLastRow();
    if (last < 2) return { success: true, rows: [] };
    var data = sheet.getRange(2, 1, last - 1, 2).getValues();
    var rows = data.map(function(r, i) { return { idx: i+2, puesto: r[0], plaza: r[1] }; });
    return { success: true, rows: rows };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function insertarPlazaPorZona(puesto, plaza) {
  try {
    if (!puesto || !plaza) return { success: false, message: "Puesto y Plaza son requeridos" };
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
    if (!sheet) sheet = ss.insertSheet("BASE_DE_DATOS_PLAZAS");
    var last = sheet.getLastRow();
    if (last >= 2) {
      var data = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === puesto) {
          return { success: false, message: "El puesto ya existe. Use modificar." };
        }
      }
    }
    sheet.appendRow([puesto, plaza]);
    return { success: true, message: "Plaza agregada correctamente a la zona: " + plaza };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function insertarPlaza(puesto, plaza) {
  return insertarPlazaPorZona(puesto, plaza);
}

function modificarPlaza(filaIdx, nuevoPuesto, nuevaPlaza) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
    if (!sheet) return { success: false, message: "No existe la hoja" };
    if (filaIdx < 2) return { success: false, message: "Índice inválido" };
    sheet.getRange(filaIdx, 1, 1, 2).setValues([[nuevoPuesto, nuevaPlaza]]);
    return { success: true, message: "Plaza modificada correctamente" };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function eliminarPlaza(filaIdx) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("BASE_DE_DATOS_PLAZAS");
    if (!sheet) return { success: false, message: "No existe la hoja" };
    if (filaIdx < 2) return { success: false, message: "No se puede eliminar la fila de encabezado" };
    sheet.deleteRow(filaIdx);
    return { success: true, message: "Plaza eliminada correctamente" };
  } catch(e) { return { success: false, message: e.toString() }; }
}