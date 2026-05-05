// =====================================================
// ADICIONALES.GS - Colbeef · Gestor de Vísceras
// =====================================================
// Maneja archivos de movimientos adicionales durante
// la jornada: ADICIONALES, CANCELACIONES, CAMBIOS
//
// Estructura archivo (igual que Salidas de Cava):
//   Fila 14: encabezados
//   Fila 15: vacía
//   Fila 16+: datos
//   Col A=Ingreso, B=Código, C=Descripción, D=Peso
//   Col E=Cliente, F=Sexo, G=Especie, H=PesoProd
//   Col I=Horas, J=Destino, K=Cava, L=Riel
//   Col M=Re-etiquetar, N=Devolución, O=Observaciones
//
// El tipo se detecta del nombre del archivo:
//   "ADICIONALES" → agregar a Estado_Cavas
//   "CANCELACIONES" → eliminar de Estado_Cavas
//   "CAMBIOS" → no modifica conteo (solo actualiza)
// =====================================================

// ─────────────────────────────────────────────────────
// _detectarTipoPorFila
// Detecta tipo por contenido de col J y col O:
//   CANCELACION: col J contiene "QUEDA EN CAVA"
//   CAMBIO:      col O contiene "CAMBIO DE DESTINO"
//   ADICIONAL:   cualquier otro caso
// ─────────────────────────────────────────────────────
function _detectarTipoPorFila(fila) {
  var colJ = String(fila[9] ||"").trim().toUpperCase();
  var colO = String(fila[14]||"").trim().toUpperCase();
  if (colJ.indexOf("QUEDA EN CAVA") !== -1) return "CANCELACION";
  if (colO.indexOf("CAMBIO DE DESTINO") !== -1) return "CAMBIO";
  return "ADICIONAL";
}

// =====================================================
// importarAdicionales
// Lee el archivo subido como sheet temporal y procesa
// según el tipo detectado
// =====================================================
function importarAdicionales(fileData, nombreArchivo, tipoManual) {
  try {
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    Logger.log('importarAdicionales: archivo=' + nombreArchivo);

    // Obtener hoja temporal
    var sheetTemp = ss.getSheetByName("Adicionales_Temp");
    if (!sheetTemp) {
      return { success:false, message:"No se encontró la hoja Adicionales_Temp." };
    }

    var lastRow = sheetTemp.getLastRow();
    if (lastRow < 16) {
      return { success:false, message:"El archivo no tiene datos desde la fila 16." };
    }

    var numFilas = lastRow - 15;
    var datos    = sheetTemp.getRange(16, 1, numFilas, 15).getValues();
    var filas    = datos.filter(function(r){ return r[1] && String(r[1]).trim(); });
    if (filas.length === 0) {
      return { success:false, message:"No se encontraron datos válidos." };
    }

    // Clasificar cada fila — solo adicionales se escriben en Estado_Cavas
    var filasAdicional = filas.filter(function(r){ return _detectarTipoPorFila(r) === "ADICIONAL"; });
    var filasCancel    = filas.filter(function(r){ return _detectarTipoPorFila(r) === "CANCELACION"; });
    var filasCambio    = filas.filter(function(r){ return _detectarTipoPorFila(r) === "CAMBIO"; });

    Logger.log('Clasificacion: adicionales=' + filasAdicional.length
      + ' cancelaciones=' + filasCancel.length
      + ' cambios=' + filasCambio.length);

    var resultado = { success:true, tipo:"ADICIONAL", procesados:0, ignorados:0,
      totalAdicional: filasAdicional.length,
      totalCancel:    filasCancel.length,
      totalCambio:    filasCambio.length,
      mensaje:"" };

    // SOLO los adicionales se escriben en Estado_Cavas
    // Cancelaciones y cambios NO hacen nada
    if (filasAdicional.length > 0) {
      resultado = _procesarAdicional(ss, filasAdicional, resultado);
    } else {
      resultado.mensaje = "ℹ️ No hay juegos adicionales en este archivo.";
    }

    // Log de ignorados
    if (filasCancel.length > 0) {
      Logger.log('Cancelaciones ignoradas (no modifican Estado_Cavas): ' + filasCancel.length);
    }
    if (filasCambio.length > 0) {
      Logger.log('Cambios de destino ignorados: ' + filasCambio.length);
    }

    // Solo actualizar si hubo adicionales reales
    if (resultado.procesados > 0) {
      // Recalcular OPL_Config con Estado_Cavas actualizado
      try {
        var sheetEC2 = ss.getSheetByName("Estado_Cavas");
        if (sheetEC2 && sheetEC2.getLastRow() >= 12) {
          var startEC2  = 12;
          var dataCavas2 = sheetEC2.getRange(startEC2, 2, sheetEC2.getLastRow()-startEC2+1, 14).getValues();
          actualizarCantidadesInicialesOPL(dataCavas2, "");
        }
      } catch(eOpl){ Logger.log('OPL update: '+eOpl); }

      // Recalcular Resumen (decomisos) cruzando con Reporte_Decomisos
      try {
        resumirDecomisos();
      } catch(eDec){ Logger.log('Decomisos update: '+eDec); }
    }

    return resultado;

  } catch(e) {
    Logger.log('importarAdicionales error: ' + e.toString());
    return { success:false, message:e.toString() };
  }
}

// ─────────────────────────────────────────────────────
// _procesarAdicional
// Agrega filas al final de Estado_Cavas
// Verifica duplicados por código
// ─────────────────────────────────────────────────────
function _procesarAdicional(ss, filas, resultado) {
  var sheetEC = ss.getSheetByName("Estado_Cavas");
  if (!sheetEC) {
    resultado.success  = false;
    resultado.mensaje  = "No se encontró la hoja Estado_Cavas.";
    return resultado;
  }

  // Leer códigos existentes para evitar duplicados
  var lastRow   = sheetEC.getLastRow();
  var codigosEC = {};
  if (lastRow >= 12) {
    var colB = sheetEC.getRange(12, 2, lastRow-11, 1).getValues();
    colB.forEach(function(r){ if(r[0]) codigosEC[String(r[0]).trim()] = true; });
  }

  // Construir filas nuevas (solo las que no existen)
  var nuevasFilas = [];
  filas.forEach(function(fila) {
    var codigo = String(fila[1]||"").trim();
    if (!codigo) return;
    if (codigosEC[codigo]) {
      resultado.ignorados++;
      return;
    }
    nuevasFilas.push(fila);
    codigosEC[codigo] = true;
  });

  if (nuevasFilas.length > 0) {
    // Insertar en col A del último row
    sheetEC.getRange(lastRow+1, 1, nuevasFilas.length, 15).setValues(nuevasFilas);
  }

  resultado.procesados = nuevasFilas.length;
  resultado.mensaje    = "✅ " + nuevasFilas.length + " filas adicionales agregadas a Estado_Cavas."
    + (resultado.ignorados > 0 ? " (" + resultado.ignorados + " ya existían)" : "");
  return resultado;
}

// ─────────────────────────────────────────────────────
// _procesarCancelacion
// Elimina filas de Estado_Cavas por código
// ─────────────────────────────────────────────────────
function _procesarCancelacion(ss, filas, resultado) {
  var sheetEC = ss.getSheetByName("Estado_Cavas");
  if (!sheetEC) {
    resultado.success = false;
    resultado.mensaje = "No se encontró la hoja Estado_Cavas.";
    return resultado;
  }

  // Obtener códigos a cancelar
  var codigosAEliminar = {};
  filas.forEach(function(fila) {
    var codigo = String(fila[1]||"").trim();
    if (codigo) codigosAEliminar[codigo] = true;
  });

  var lastRow = sheetEC.getLastRow();
  if (lastRow < 12) {
    resultado.mensaje = "Estado_Cavas vacío.";
    return resultado;
  }

  // Leer col B (códigos) y marcar filas a eliminar
  var colB      = sheetEC.getRange(12, 2, lastRow-11, 1).getValues();
  var filasElim = [];
  colB.forEach(function(r, i) {
    var codigo = String(r[0]||"").trim();
    if (codigosAEliminar[codigo]) filasElim.push(12 + i);
  });

  // Eliminar de abajo hacia arriba para no desplazar índices
  filasElim.reverse().forEach(function(rowIdx) {
    sheetEC.deleteRow(rowIdx);
  });

  resultado.procesados = filasElim.length;
  resultado.mensaje    = "🗑️ " + filasElim.length + " filas canceladas eliminadas de Estado_Cavas.";
  return resultado;
}

// ─────────────────────────────────────────────────────
// _procesarCambio
// Actualiza el destino en Estado_Cavas (no cambia conteo)
// ─────────────────────────────────────────────────────
function _procesarCambio(ss, filas, resultado) {
  var sheetEC = ss.getSheetByName("Estado_Cavas");
  if (!sheetEC) {
    resultado.success = false;
    resultado.mensaje = "No se encontró la hoja Estado_Cavas.";
    return resultado;
  }

  // Mapa código → nuevo destino (col J = idx 9)
  var cambios = {};
  filas.forEach(function(fila) {
    var codigo  = String(fila[1]||"").trim();
    var destino = String(fila[9]||"").trim();
    if (codigo && destino) cambios[codigo] = destino;
  });

  var lastRow = sheetEC.getLastRow();
  if (lastRow < 12) {
    resultado.mensaje = "Estado_Cavas vacío.";
    return resultado;
  }

  // Leer col B y col J
  var dataEC = sheetEC.getRange(12, 2, lastRow-11, 9).getValues();
  var actualizados = 0;

  dataEC.forEach(function(r, i) {
    var codigo = String(r[0]||"").trim();
    if (cambios[codigo]) {
      // Col J en sheet = col 10 (B=2, +8 = col 10)
      sheetEC.getRange(12+i, 10).setValue(cambios[codigo]);
      actualizados++;
    }
  });

  resultado.procesados = actualizados;
  resultado.ignorados  = filas.length - actualizados;
  resultado.mensaje    = "🔄 " + actualizados + " destinos actualizados en Estado_Cavas.";
  return resultado;
}

// =====================================================
// getResumenAdicionales
// Retorna estadísticas del estado actual de adicionales
// =====================================================
function getResumenAdicionales() {
  try {
    var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetEC = ss.getSheetByName("Estado_Cavas");
    if (!sheetEC || sheetEC.getLastRow() < 12) {
      return { success:true, totalSalidas:0, totalDecomisos:0 };
    }

    // Contar juegos totales y decomisos actualizados
    var resSalidas   = contarJuegosViscerales();
    var totalSalidas = resSalidas.success ? resSalidas.total : 0;

    var sheetRes    = ss.getSheetByName("Resumen");
    var totalDecomp = sheetRes ? Math.max(0, sheetRes.getLastRow()-1) : 0;

    return {
      success:       true,
      totalSalidas:  totalSalidas,
      totalDecomisos: totalDecomp
    };
  } catch(e) {
    return { success:false, message:e.toString() };
  }
}

// =====================================================
// importarExcelAdicionales
// Recibe bytes del archivo, lo guarda en hoja temporal
// =====================================================
function importarExcelAdicionales(bytes, nombreArchivo) {
  try {
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    var blob = Utilities.newBlob(bytes, MimeType.MICROSOFT_EXCEL, nombreArchivo);

    // Convertir a Sheets temporalmente
    var recurso = {
      title:    "Adicionales_Temp_Import",
      mimeType: MimeType.GOOGLE_SHEETS
    };
    var fileTemp = Drive.Files.insert(recurso, blob, { convert:true });
    var ssTemp   = SpreadsheetApp.openById(fileTemp.id);
    var sheetOrig= ssTemp.getSheets()[0];

    // Copiar a hoja "Adicionales_Temp" en el spreadsheet principal
    var sheetDest = ss.getSheetByName("Adicionales_Temp");
    if (sheetDest) ss.deleteSheet(sheetDest);
    sheetOrig.copyTo(ss).setName("Adicionales_Temp");

    // Eliminar archivo temporal de Drive
    Drive.Files.remove(fileTemp.id);

    Logger.log('importarExcelAdicionales: OK - ' + nombreArchivo);
    return { success:true, nombre:nombreArchivo };
  } catch(e) {
    Logger.log('importarExcelAdicionales error: ' + e.toString());
    return { success:false, message:e.toString() };
  }
}