// =====================================================
// SALIDAS.GS - Colbeef · Gestor de Vísceras
// Conteo de juegos viscerales desde Estado_Cavas
// =====================================================

function contarJuegosViscerales() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Estado_Cavas');
    if (!sheet) return { success: false, total: 0, message: 'Hoja Estado_Cavas no encontrada' };

    const lastRow = sheet.getLastRow();
    if (lastRow < 13) return { success: true, total: 0 };

    // Lee columna B desde fila 13
    const valores     = sheet.getRange(13, 2, lastRow - 12, 1).getValues();
    const codigosBase = new Set();

    valores.forEach(fila => {
      const codigo = String(fila[0]).trim();
      if (!codigo) return;
      // "2602-06503-60" → "2602-06503"
      const partes = codigo.split('-');
      if (partes.length >= 2) codigosBase.add(partes[0] + '-' + partes[1]);
    });

    return { success: true, total: codigosBase.size };
  } catch (e) {
    return { success: false, total: 0, message: e.toString() };
  }
}