// =====================================================
// INFORME.GS - Módulo Laboral / Informe Diario
// Colbeef · Gestor de Vísceras
// =====================================================

var CAVAS_DEFAULT = [
  ["V. Rojas & Blancas (V.Rojas)",  40, 20, 0],
  ["V. Rojas & Blancas (V.Blancas)", 22, 25, 0],
  ["V. Acondicionamiento",           22, 25, 0],
  ["Patas & Manos",                  80,  9, 0],
  ["Cabezas",                        80,  9, 0]
];

var PERCHEROS_DEFAULT = [
  ["V. Rojas & Blancas", 0, 0, 0, 0, 0],
  ["V. Acondicionamiento", 0, 0, 0, 0, 0],
  ["Patas & Cabezas",    0, 0, 0, 0, 0],
  ["Recepción",          0, 0, 0, 0, 0],
  ["Retenidos",          0, 0, 0, 0, 0]
];

function _getOrCreateInformeSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Informe_Datos");
  if (!sheet) {
    sheet = ss.insertSheet("Informe_Datos");
    _escribirDefaultsInforme(sheet);
  }
  return sheet;
}

function _escribirDefaultsInforme(sheet) {
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  sheet.getRange(1,1,1,6).setValues([[hoy, 0, 0, 0, 100, 2]]);
  sheet.getRange(3,1,5,4).setValues(CAVAS_DEFAULT);
  sheet.getRange(9,1,20,2).clearContent();
  sheet.getRange(30,1,5,6).setValues(PERCHEROS_DEFAULT);
}

function getInformeDatos() {
  try {
    var sheet = _getOrCreateInformeSheet();
    var meta = sheet.getRange(1,1,1,6).getValues()[0];
    
    var rawFechaMeta = meta[0];
    var fecha;
    if (rawFechaMeta instanceof Date) {
      fecha = Utilities.formatDate(rawFechaMeta, Session.getScriptTimeZone(), "dd/MM/yyyy");
    } else if (rawFechaMeta && String(rawFechaMeta).trim()) {
      fecha = String(rawFechaMeta).trim();
    } else {
      fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
    
    var completos    = Number(meta[1] || 0);
    var incompletos  = Number(meta[2] || 0);
    var beneficioDia = Number(meta[3] || 0);
    var stockTotal   = Number(meta[4] || 100);
    var danados      = Number(meta[5] || 2);

    var cavasRaw = sheet.getRange(3,1,5,4).getValues();
    var cavas = cavasRaw.map(function(r) {
      return {
        grupo:      String(r[0] || ""),
        carros:     Number(r[1] || 0),
        capPorCarro: Number(r[2] || 0),
        inventario: Number(r[3] || 0)
      };
    });

    var novsRaw = sheet.getRange(9,1,20,2).getValues();
    var novedades = [];
    novsRaw.forEach(function(r) {
      var cod  = String(r[0] || "").trim();
      var desc = String(r[1] || "").trim();
      if (cod) novedades.push({ cod: cod, desc: desc });
    });

    var percherosRaw = sheet.getRange(30,1,5,6).getValues();
    var percheros = percherosRaw.map(function(r) {
      return {
        cava:      String(r[0] || ""),
        blancas:   Number(r[1] || 0),
        rojas:     Number(r[2] || 0),
        patasManos: Number(r[3] || 0),
        cabezas:   Number(r[4] || 0),
        crudas:    Number(r[5] || 0)
      };
    });

    return {
      success: true,
      fecha: fecha,
      completos: completos,
      incompletos: incompletos,
      beneficioDia: beneficioDia,
      stockTotal: stockTotal,
      danados: danados,
      cavas: cavas,
      novedades: novedades,
      percheros: percheros
    };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function guardarInformeDatos(payload) {
  try {
    var sheet = _getOrCreateInformeSheet();
    var d = (typeof payload === 'string') ? JSON.parse(payload) : payload;

    sheet.getRange(1,1,1,6).setValues([[
      d.fecha || "",
      Number(d.completos || 0),
      Number(d.incompletos || 0),
      Number(d.beneficioDia || 0),
      Number(d.stockTotal || 100),
      Number(d.danados || 2)
    ]]);

    var cavasData = (d.cavas || CAVAS_DEFAULT).map(function(c) {
      return [c.grupo || "", Number(c.carros||0), Number(c.capPorCarro||0), Number(c.inventario||0)];
    });
    while (cavasData.length < 5) cavasData.push(["",0,0,0]);
    sheet.getRange(3,1,5,4).setValues(cavasData.slice(0,5));

    sheet.getRange(9,1,20,2).clearContent();
    var novs = d.novedades || [];
    if (novs.length > 0) {
      var novsData = novs.slice(0,20).map(function(n){ return [n.cod||"", n.desc||""]; });
      sheet.getRange(9,1,novsData.length,2).setValues(novsData);
    }

    var percData = (d.percheros || PERCHEROS_DEFAULT).map(function(p) {
      return [p.cava||"", Number(p.blancas||0), Number(p.rojas||0),
              Number(p.patasManos||0), Number(p.cabezas||0), Number(p.crudas||0)];
    });
    while (percData.length < 5) percData.push(["",0,0,0,0,0]);
    sheet.getRange(30,1,5,6).setValues(percData.slice(0,5));

    return { success: true };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function limpiarInformeDatos() {
  try {
    var sheet = _getOrCreateInformeSheet();
    sheet.clearContents();
    _escribirDefaultsInforme(sheet);
    return { success: true };
  } catch(e) { return { success: false, message: e.toString() }; }
}

function _calcularTotalJuegos(cavas) {
  var totalBlancas = cavas.reduce(function(s,c){
    return (c.grupo === "V. Rojas & Blancas (V.Blancas)" ||
            c.grupo === "V. Acondicionamiento") ? s + (c.inventario || 0) : s;
  }, 0);
  var vRojas = 0;
  var patasManos = 0;
  var cabezas = 0;
  for (var i = 0; i < cavas.length; i++) {
    if (cavas[i].grupo === "V. Rojas & Blancas (V.Rojas)") vRojas = cavas[i].inventario || 0;
    if (cavas[i].grupo === "Patas & Manos") patasManos = cavas[i].inventario || 0;
    if (cavas[i].grupo === "Cabezas") cabezas = cavas[i].inventario || 0;
  }
  var partes = [vRojas, totalBlancas, patasManos, cabezas];
  var minJuegos = Math.min.apply(null, partes);
  var totalJuegos = minJuegos;
  for (var j = 0; j < partes.length; j++) {
    if (partes[j] > minJuegos) totalJuegos += (partes[j] - minJuegos) * 0.25;
  }
  return totalJuegos;
}

function _calcularTotalesCavas(cavas) {
  var totalCapacidad = 0;
  var totalInventario = 0;
  for (var i = 0; i < cavas.length; i++) {
    var c = cavas[i];
    var cap = (c.carros || 0) * (c.capPorCarro || 0);
    totalCapacidad += cap;
    totalInventario += (c.inventario || 0);
  }
  var promedioPorcentaje = totalCapacidad > 0 ? Math.round((totalInventario / totalCapacidad) * 100) : 0;
  return { totalInventario: totalInventario, promedioPorcentaje: promedioPorcentaje };
}

function _calcularTotalEnUso(percheros) {
  var total = 0;
  for (var i = 0; i < percheros.length; i++) {
    var p = percheros[i];
    total += (p.blancas || 0) + (p.rojas || 0) + (p.patasManos || 0) + (p.cabezas || 0) + (p.crudas || 0);
  }
  return total;
}

function generarInformeHTML(opciones) {
  try {
    var opts = (typeof opciones === 'string') ? JSON.parse(opciones) : (opciones || {});
    var inclInv = opts.inv !== false;
    var inclCavas = opts.cavas !== false;
    var inclPerch = opts.percheros !== false;
    var inclDist = opts.distribucion !== false;

    var d = getInformeDatos();
    if (!d.success) throw new Error(d.message);

    var fecha = d.fecha;
    var completos = d.completos;
    var incompletos = d.incompletos;
    var beneficioDia = d.beneficioDia;
    var stockTotal = d.stockTotal;
    var danados = d.danados;
    var cavas = d.cavas;
    var novedades = d.novedades;
    var percheros = d.percheros;

    var totalJuegosFinal = _calcularTotalJuegos(cavas);
    var totalesCavas = _calcularTotalesCavas(cavas);
    var totalEnUso = _calcularTotalEnUso(percheros);
    var disponibles = stockTotal - danados - totalEnUso;

    var htmlBeneficio = '';
    if (inclCavas) {
      var valorBeneficio = (beneficioDia && beneficioDia > 0) ? beneficioDia : 0;
      htmlBeneficio = '<div style="text-align:center; margin:20px 0;"><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:200px; width:220px; display:block; margin:0 auto; border-top:5px solid #9b59b6;"><div style="color:#7f8c8d; font-size:14px; font-weight:bold; margin-bottom:10px;">🐄 ANIMALES BENEFICIADOS</div><div style="font-size:42px; font-weight:800; color:#9b59b6;">' + valorBeneficio + '</div></div></div>';
    }

    var htmlInv = '';
    if (inclInv) {
      htmlInv = '<h1 style="color:#4CAF50; text-align:center; margin:30px 0 20px; font-size:26px; font-weight:bold;">INVENTARIO PRODUCTO FRÍO EN CAVA</h1><div style="display:flex; justify-content:center; gap:20px; margin:20px 0 30px; flex-wrap:wrap;"><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:150px; border-top:5px solid #27ae60;"><div style="color:#7f8c8d; font-size:12px; font-weight:bold; margin-bottom:8px;">JUEGOS COMPLETOS</div><div style="font-size:32px; font-weight:bold; color:#27ae60;">' + completos + '</div></div><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:150px; border-top:5px solid #e74c3c;"><div style="color:#7f8c8d; font-size:12px; font-weight:bold; margin-bottom:8px;">JUEGOS INCOMPLETOS</div><div style="font-size:32px; font-weight:bold; color:#e74c3c;">' + incompletos + '</div></div><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:150px; border-top:5px solid #3498db;"><div style="color:#7f8c8d; font-size:12px; font-weight:bold; margin-bottom:8px;">TOTAL JUEGOS</div><div style="font-size:32px; font-weight:bold; color:#3498db;">' + (completos + incompletos) + '</div></div></div>';

      if (novedades.length > 0) {
        var filasNovedades = '';
        for (var i = 0; i < novedades.length; i++) {
          filasNovedades += '<tr><td style="padding:12px; font-size:18px; font-weight:bold; border:1px solid #ddd;">' + novedades[i].cod + '</td><td style="padding:12px; font-size:18px; border:1px solid #ddd;">' + novedades[i].desc + '</td></tr>';
        }
        htmlInv += '<h3 style="color:#4CAF50; text-align:center; margin:20px 0 15px; font-size:22px; font-weight:bold;">NOVEDADES POR CÓDIGO</h3><table style="width:80%; margin:0 auto; border-collapse:collapse; box-shadow:0 2px 6px rgba(0,0,0,0.1);"><tr style="background:#4CAF50; color:white;"><th style="padding:14px; font-size:18px; width:30%;">CÓDIGO</th><th style="padding:14px; font-size:18px; width:70%;">DETALLE</th></tr>' + filasNovedades + '</table>';
      }
    }

    var htmlCavas = '';
    if (inclCavas) {
      var filasCavas = '';
      for (var i = 0; i < cavas.length; i++) {
        var c = cavas[i];
        var capTotal = (c.carros || 0) * (c.capPorCarro || 0);
        var pct = capTotal > 0 ? Math.round(((c.inventario || 0) / capTotal) * 100) : 0;
        var bgInventario = '#fff2f2';
        filasCavas += '<tr>'
          + '<td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + c.grupo + '</td>'
          + '<td style="padding:12px; border:1px solid #ddd; font-size:18px;">× ' + c.carros + '</td>'
          + '<td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + capTotal + '</td>'
          + '<td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold; background:' + bgInventario + ';">' + (c.inventario || 0) + '</td>'
          + '<td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold; background:#fff8e1;">' + pct + '%</span></td>'
          + '</tr>';
      }
      htmlCavas = '<h1 style="color:#4CAF50; text-align:center; margin:30px 0 20px; font-size:26px; font-weight:bold;">OCUPACIÓN CAVAS VÍSCERAS</h1><table style="width:90%; margin:0 auto; border-collapse:collapse; box-shadow:0 2px 6px rgba(0,0,0,0.1);">'
        + '<tr style="background:#4CAF50; color:white;"><th style="padding:14px; font-size:18px;">CAVA</th><th style="padding:14px; font-size:18px;">CARROS</th><th style="padding:14px; font-size:18px;">CAPACIDAD TOTAL</th><th style="padding:14px; font-size:18px;">INVENTARIO TOTAL</th><th style="padding:14px; font-size:18px;">PARTICIPACIÓN</th></tr>'
        + filasCavas
        + '<tr style="background:#4CAF50; color:white; font-weight:bold;"><td colspan="3" style="padding:14px; text-align:center; font-size:18px;">TOTAL GENERAL</span></td><td style="padding:14px; font-size:20px;">' + totalJuegosFinal.toFixed(2) + '</td><td style="padding:14px; font-size:20px;">' + totalesCavas.promedioPorcentaje + '%</span></td></tr>'
        + '</table>';
    }

    var htmlPercheros = '';
    if (inclPerch) {
      var badgeStock = disponibles >= 30 ? '<div style="font-size:14px; font-weight:bold; margin-top:8px; color:#27ae60;">✅ OK</div>' : '<div style="font-size:14px; font-weight:bold; margin-top:8px; background:#e74c3c; color:white; padding:4px 12px; border-radius:16px; display:inline-block;">⚠️ BAJO STOCK</div>';
      htmlPercheros = '<h1 style="color:#4CAF50; text-align:center; margin:30px 0 20px; font-size:26px; font-weight:bold;">DISPONIBILIDAD DE CARROS PERCHEROS</h1><div style="display:flex; justify-content:center; gap:15px; margin:20px 0 30px; flex-wrap:wrap;"><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:130px; border-top:5px solid #3498db;"><div style="color:#7f8c8d; font-size:12px; font-weight:bold; margin-bottom:8px;">STOCK TOTAL</div><div style="font-size:28px; font-weight:bold; color:#3498db;">' + stockTotal + '</div></div><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:130px; border-top:5px solid #e74c3c;"><div style="color:#7f8c8d; font-size:12px; font-weight:bold; margin-bottom:8px;">DAÑADOS</div><div style="font-size:28px; font-weight:bold; color:#e74c3c;">' + danados + '</div></div><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:130px; border-top:5px solid #f39c12;"><div style="color:#7f8c8d; font-size:12px; font-weight:bold; margin-bottom:8px;">EN USO</div><div style="font-size:28px; font-weight:bold; color:#f39c12;">' + totalEnUso + '</div></div><div style="background:white; padding:20px; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.12); text-align:center; min-width:130px; border-top:5px solid ' + (disponibles >= 30 ? '#27ae60' : '#e74c3c') + ';"><div style="color:#7f8c8d; font-size:12px; font-weight:bold; margin-bottom:8px;">DISPONIBLES</div><div style="font-size:28px; font-weight:bold; color:' + (disponibles >= 30 ? '#27ae60' : '#e74c3c') + ';">' + disponibles + '</div>' + badgeStock + '</div></div>';

      if (inclDist) {
        var filasPercheros = '';
        for (var i = 0; i < percheros.length; i++) {
          var p = percheros[i];
          filasPercheros += '<tr><td style="text-align:left; padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + p.cava + '</td><td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + (p.blancas || '-') + '</td><td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + (p.rojas || '-') + '</td><td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + (p.patasManos || '-') + '</td><td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + (p.cabezas || '-') + '</td><td style="padding:12px; border:1px solid #ddd; font-size:18px; font-weight:bold;">' + (p.crudas || '-') + '</td></tr>';
        }
        htmlPercheros += '<h2 style="color:#4CAF50; text-align:center; margin:25px 0 15px; font-size:22px; font-weight:bold;">DISTRIBUCIÓN POR CAVAS</h2><table style="width:90%; margin:0 auto; border-collapse:collapse; box-shadow:0 2px 6px rgba(0,0,0,0.1);"><tr style="background:#4CAF50; color:white;"><th style="padding:14px; font-size:18px; text-align:left;">CAVAS</th><th style="padding:14px; font-size:18px;">V-BLANCAS</th><th style="padding:14px; font-size:18px;">V-ROJAS</th><th style="padding:14px; font-size:18px;">PATAS/MANOS</th><th style="padding:14px; font-size:18px;">CABEZAS</th><th style="padding:14px; font-size:18px;">CRUDAS</th></tr><tr style="background:#f0f0f0; font-weight:bold;"><td style="text-align:left; padding:12px; border:1px solid #ddd; font-size:16px;">MÍNIMO PARA INICIAR</span></td><td style="padding:12px; border:1px solid #ddd; font-size:16px;">8</span></td><td style="padding:12px; border:1px solid #ddd; font-size:16px;">8</span></td><td style="padding:12px; border:1px solid #ddd; font-size:16px;">2</span></td><td style="padding:12px; border:1px solid #ddd; font-size:16px;">5</span></td><td style="padding:12px; border:1px solid #ddd; font-size:16px;">1</span></td></tr>' + filasPercheros + '</table>';
      }
    }

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe Laboral · Colbeef</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script><style>*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;color-adjust:exact!important;}body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;margin:0;padding:20px;}.report-container{max-width:1100px;margin:0 auto;background:#ffffff;padding:30px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);}img{display:block;margin:10px auto;max-width:150px;height:auto;}h1{color:#4CAF50;text-align:center;margin:25px 0 20px;font-size:26px;font-weight:bold;}h2{color:#4CAF50;text-align:center;margin:20px 0 15px;font-size:24px;font-weight:bold;}h3{color:#4CAF50;text-align:center;margin:20px 0 15px;font-size:22px;font-weight:bold;}table{width:100%;max-width:900px;margin:15px auto;border-collapse:collapse;font-size:18px;}th,td{border:1px solid #ddd;padding:12px;text-align:center;font-size:18px;}th{background:#4CAF50;color:white;font-weight:bold;}.header{text-align:center;border-bottom:3px solid #4CAF50;padding-bottom:15px;margin-bottom:25px;}.header h1{color:#2c3e50;margin:10px 0 5px;font-size:28px;}.header .subtitle{color:#7f8c8d;font-size:16px;margin-top:5px;font-weight:bold;}.firma{margin-top:30px;text-align:center;color:#4CAF50;font-weight:bold;font-size:18px;padding-top:20px;border-top:2px solid #4CAF50;}.export-button{display:block;margin:30px auto;padding:14px 28px;background:#25D366;color:white;border:none;border-radius:10px;font-size:18px;font-weight:bold;cursor:pointer;width:280px;}.export-button:hover{background:#128C7E;}@media print{.export-button{display:none;}}<\/style></head><body><div class="report-container"><div class="header"><img src="https://lh3.googleusercontent.com/d/1KmxfOEciyJql3_CI_d7nbVjZW8eHRGi-" alt="Colbeef" crossorigin="anonymous" style="max-width:150px;"><h1>GESTIÓN DEL ÁREA DE VÍSCERAS</h1><div class="subtitle">INFORME GENERADO EL: ' + fecha + '</div></div>' + htmlBeneficio + htmlInv + htmlCavas + htmlPercheros + '<div class="firma">SERGIO ANAYA<br><span style="font-size:14px;">GESTOR DE VÍSCERAS</span></div><button class="export-button" onclick="exportarPNGAltaCalidad()" id="exportBtn">📸 Exportar como PNG 4K</button><script>function exportarPNGAltaCalidad(){var btn=document.getElementById("exportBtn");var originalText=btn.innerHTML;btn.innerHTML="⏳ Generando imagen 4K...";btn.disabled=true;btn.style.display="none";var container=document.querySelector(".report-container");setTimeout(function(){html2canvas(container,{scale:4,useCORS:true,backgroundColor:"#ffffff",logging:false,scrollX:0,scrollY:0,windowWidth:container.scrollWidth,windowHeight:container.scrollHeight}).then(function(canvas){var enlace=document.createElement("a");enlace.download="Informe_Visceras.png";enlace.href=canvas.toDataURL("image/png",1.0);document.body.appendChild(enlace);enlace.click();document.body.removeChild(enlace);btn.style.display="block";btn.innerHTML="✅ Descargado";setTimeout(function(){btn.innerHTML=originalText;btn.disabled=false;},2000);}).catch(function(error){console.error("Error:",error);btn.style.display="block";btn.innerHTML="❌ Error - Reintentar";setTimeout(function(){btn.innerHTML=originalText;btn.disabled=false;},3000);});},1000);}<\/script></div></body></html>';

    return { success: true, html: html };
  } catch(e) { return { success: false, message: e.toString() }; }
}