// =====================================================
// LIMPIAR.GS
// Limpia datos de la operación preservando encabezados
// =====================================================

function limpiarResumen() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Limpiar hojas de decomisos
    var hojas = ["Resumen", "Estado_Cavas", "Reporte_Decomisos"];
    hojas.forEach(function(nombre) {
      var sheet = ss.getSheetByName(nombre);
      if (!sheet) return;
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
      }
    });

    // Limpiar OPL_Progreso
    var oplProg = ss.getSheetByName("OPL_Progreso");
    if (oplProg && oplProg.getLastRow() > 1) {
      oplProg.getRange(2, 1, oplProg.getLastRow() - 1, oplProg.getLastColumn()).clearContent();
    }

    // Resetear col C (Total) de OPL_Config a 0
    var oplCfg = ss.getSheetByName("OPL_Config");
    if (oplCfg && oplCfg.getLastRow() > 1) {
      oplCfg.getRange(2, 3, oplCfg.getLastRow() - 1, 1).setValue(0);
    }

    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}