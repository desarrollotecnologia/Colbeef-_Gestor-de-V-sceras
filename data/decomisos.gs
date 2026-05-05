// =====================================================
// Decomios.GS
// Primera pagina: 16 filas (menos espacio por cabecera)
// Paginas siguientes: 21 filas
// =====================================================

var NOMBRE_GENERADOR  = "Sergio Anaya";
var CARGO_GENERADOR   = "Gestor Visceras";
var FILAS_PRIMERA_PAG = 16;
var FILAS_RESTO_PAG   = 21;

function generarPDFDecomisos() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetResumen = ss.getSheetByName("Resumen");
    var data = sheetResumen.getDataRange().getValues();

    if (data.length <= 1) throw new Error("No hay datos en Resumen para generar PDF");

    var tz = Session.getScriptTimeZone();
    var fechaHoy = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm");
    var fechaNombre = Utilities.formatDate(new Date(), tz, "dd-MM-yyyy");
    var titulo = "Listado de Decomisos Visceras con salida";
    var nombreArchivo = titulo + "_" + fechaNombre + ".pdf";
    var email = Session.getActiveUser().getEmail() || "Sistema";

    var rows = data.slice(1).filter(function(r) { return r[0] && r[1] && r[2]; });

    var totales = {};
    rows.forEach(function(r) {
      var prod = String(r[2]);
      totales[prod] = (totales[prod] || 0) + 1;
    });
    var productosOrdenados = Object.keys(totales).sort();

    var doc = DocumentApp.create(titulo + " " + fechaNombre);
    var body = doc.getBody();
    body.setPageWidth(792);
    body.setPageHeight(612);
    body.setMarginTop(35);
    body.setMarginBottom(35);
    body.setMarginLeft(40);
    body.setMarginRight(40);

    // ── CABECERA: Logo | Titulo centrado ──
    var cab = body.appendTable([["", ""]]);
    cab.setBorderWidth(0);

    var cLogo = cab.getRow(0).getCell(0);
    cLogo.setWidth(140);
    cLogo.setPaddingLeft(0).setPaddingTop(0).setPaddingBottom(0).setPaddingRight(0);
    try {
      var logoBlob = DriveApp.getFileById(LOGO_FILE_ID).getBlob();
      cLogo.clear();
      cLogo.appendImage(logoBlob).setWidth(160).setHeight(64);
    } catch(e) {
      cLogo.setText("Colbeef");
      cLogo.editAsText().setFontSize(16).setBold(true).setForegroundColor("#259c39");
    }

    var cTit = cab.getRow(0).getCell(1);
    cTit.setWidth(560);
    cTit.setPaddingLeft(10).setPaddingRight(10).setPaddingTop(5);
    cTit.clear();
    var pTit = cTit.appendParagraph(titulo.toUpperCase());
    pTit.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pTit.editAsText().setFontSize(16).setBold(true).setForegroundColor("#259c39").setFontFamily("Arial");
    var pSub = cTit.appendParagraph("Fecha de generacion: " + fechaHoy);
    pSub.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pSub.editAsText().setFontSize(9).setItalic(true).setForegroundColor("#6b7280").setFontFamily("Arial");

    body.appendParagraph("");

    // ── TABLA PRINCIPAL ──
    var anchosCols = [140, 430, 130];
    var encabezado = ["Codigo", "Destino", "Decomisos"];

    function aplicarEstiloEncabezado(tabla) {
      var hr = tabla.getRow(0);
      for (var c = 0; c < 3; c++) {
        var hCell = hr.getCell(c);
        hCell.setWidth(anchosCols[c]);
        hCell.setBackgroundColor("#259c39");
        hCell.editAsText().setForegroundColor("#ffffff").setBold(true).setFontSize(10).setFontFamily("Arial");
        hCell.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);
      }
    }

    function aplicarEstiloFila(tabla, indice, esPar) {
      var bg = esPar ? "#f0faf3" : "#ffffff";
      var rowT = tabla.getRow(indice);
      for (var j = 0; j < rowT.getNumCells(); j++) {
        rowT.getCell(j).setBackgroundColor(bg);
        rowT.getCell(j).editAsText().setFontSize(9).setFontFamily("Arial").setForegroundColor("#1f2937");
        rowT.getCell(j).setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(10).setPaddingRight(10);
      }
    }

    // ── DIVIDIR FILAS: primera pagina 16, resto 21 ──
    var bloques = [];
    bloques.push(rows.slice(0, FILAS_PRIMERA_PAG));
    for (var b = FILAS_PRIMERA_PAG; b < rows.length; b += FILAS_RESTO_PAG) {
      bloques.push(rows.slice(b, b + FILAS_RESTO_PAG));
    }
    bloques = bloques.filter(function(bl) { return bl.length > 0; });

    bloques.forEach(function(bloque, idxBloque) {
      if (idxBloque > 0) body.appendParagraph("");

      var bloqueData = [encabezado];
      bloque.forEach(function(r) {
        bloqueData.push([String(r[0]||""), String(r[1]||""), String(r[2]||"")]);
      });

      var tabla = body.appendTable(bloqueData);
      tabla.setBorderColor("#d1d5db");
      aplicarEstiloEncabezado(tabla);

      for (var i = 1; i < tabla.getNumRows(); i++) {
        aplicarEstiloFila(tabla, i, i % 2 === 0);
      }
    });

    body.appendParagraph("");

    // ── TABLA RESUMEN CRUDAS ──
    try {
      var resCrudas2 = (typeof getCrudasResumenPDF === 'function') ? getCrudasResumenPDF() : { success:false };
      if (resCrudas2.success && resCrudas2.filas && resCrudas2.filas.length > 0) {
        body.appendParagraph("");
        var titCrudas2 = body.appendParagraph("RESUMEN DE CRUDAS - VÍSCERAS BLANCAS");
        titCrudas2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        titCrudas2.editAsText().setFontSize(13).setBold(true).setForegroundColor("#d97706").setFontFamily("Arial");

        var encCrudas2 = [["PUESTO", "CANTIDAD", "OPL", "CÓDIGOS"]];
        var filCrudas2 = resCrudas2.filas.map(function(f) {
          return [f.puesto||"", String(f.cantidad||0), f.opl||"—", (f.codigos||[]).join(", ")];
        });

        var tblCrudas2 = body.appendTable(encCrudas2.concat(filCrudas2));
        tblCrudas2.setBorderColor("#f59e0b");
        var hrC2 = tblCrudas2.getRow(0);
        for (var cc2 = 0; cc2 < 4; cc2++) {
          hrC2.getCell(cc2).setBackgroundColor("#fef3c7");
          hrC2.getCell(cc2).setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(8).setPaddingRight(8);
          hrC2.getCell(cc2).editAsText().setFontSize(10).setBold(true).setForegroundColor("#92400e").setFontFamily("Arial");
        }
        for (var ri3 = 1; ri3 < tblCrudas2.getNumRows(); ri3++) {
          for (var rj3 = 0; rj3 < 4; rj3++) {
            var c3 = tblCrudas2.getRow(ri3).getCell(rj3);
            c3.editAsText().setFontSize(9).setFontFamily("Arial");
            c3.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(8).setPaddingRight(8);
            if (rj3 === 1) c3.editAsText().setBold(true).setForegroundColor("#d97706");
          }
        }
      }
    } catch(eCrudas2) { Logger.log('Crudas PDF error: ' + eCrudas2); }

    // ── FIRMA CENTRADA ──
    body.appendParagraph("");
    body.appendParagraph("");
    var firmaLine = body.appendParagraph("___________________________");
    firmaLine.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    firmaLine.editAsText().setFontFamily("Arial");
    var pFN2 = body.appendParagraph(NOMBRE_GENERADOR);
    pFN2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pFN2.editAsText().setFontSize(10).setBold(true).setForegroundColor("#1f2937").setFontFamily("Arial");
    var pFC2 = body.appendParagraph(CARGO_GENERADOR);
    pFC2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pFC2.editAsText().setFontSize(9).setItalic(true).setForegroundColor("#6b7280").setFontFamily("Arial");

    // ── PIE ──
    body.appendParagraph("");
    var pie = body.appendParagraph(
      "Documento generado automaticamente · Gestor de Visceras Colbeef · " + fechaHoy
    );
    pie.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pie.editAsText().setFontSize(7).setItalic(true).setForegroundColor("#9ca3af").setFontFamily("Arial");

    doc.saveAndClose();

    // ── Exportar PDF landscape ──
    var docId = doc.getId();
    var exportUrl = "https://docs.google.com/document/d/" + docId +
      "/export?format=pdf&portrait=false&size=A4&fitw=true";
    var token = ScriptApp.getOAuthToken();
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("Error exportando PDF: HTTP " + response.getResponseCode());
    }
    var pdfBlob = response.getBlob().setName(nombreArchivo);

    var folder;
    var folders = DriveApp.getFoldersByName("Gestor_Visceras_PDF");
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("Gestor_Visceras_PDF");
    var pdfFile = folder.createFile(pdfBlob);

    DriveApp.getFileById(docId).setTrashed(true);

    registrarHistorialPDF(pdfFile, rows.length, email);

    return { success: true, nombre: pdfFile.getName(), url: pdfFile.getUrl() };

  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// ─────────────────────────────────────────────────────
// registrarHistorialPDF
// Guarda el PDF generado en la hoja HistorialPDF
// ─────────────────────────────────────────────────────
function registrarHistorialPDF(pdfFile, numRegistros, email) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('HistorialPDF');
    if (!sheet) {
      sheet = ss.insertSheet('HistorialPDF');
      sheet.appendRow(['Nombre', 'Fecha', 'URL', 'Tipo', 'Registros', 'Usuario']);
    }
    sheet.appendRow([
      pdfFile.getName(),
      new Date(),
      pdfFile.getUrl(),
      'Decomisos',
      numRegistros || 0,
      email || 'Sistema'
    ]);
  } catch(e) {
    // No bloquear el flujo principal si falla el registro
    console.warn('registrarHistorialPDF error:', e.toString());
  }
}

// 👇 AGREGAR ESTO AL FINAL 👇
function invalidarYAutorizar() {
  ScriptApp.invalidateAuth();
  var doc = DocumentApp.create("Forzar_Permisos_" + new Date().getTime());
  doc.getBody().appendParagraph("Forzando autorización");
  doc.saveAndClose();
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  SpreadsheetApp.getUi().alert("✅ PERMISOS RENOVADOS\n\nAhora ejecuta generarPDFDecomisos()");
}