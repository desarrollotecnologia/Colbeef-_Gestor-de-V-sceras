// =====================================================
// ANALYTICS.GS - Colbeef · Gestor de Vísceras v2
// =====================================================
// Mejoras: pre-agrupación, comparación OPL, mes vs mes,
// filtro avanzado, productividad real, detección anomalías
// =====================================================

// ─────────────────────────────────────────────────────
// _leerHistorico — carga datos en memoria con pre-agrupación
// ─────────────────────────────────────────────────────
function _leerHistorico() {
  try {
    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("HISTORICO_OPL");
    if (!sheet || sheet.getLastRow() < 2) return [];
    var data = sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues();
    var tz   = Session.getScriptTimeZone();
    return data.map(function(r) {
      var fechaStr = "", fecha = null;
      var rawF = r[0];
      if (rawF instanceof Date) {
        fecha = new Date(rawF.getFullYear(), rawF.getMonth(), rawF.getDate());
        fechaStr = String(fecha.getDate()).padStart(2,"0") + "/" +
                   String(fecha.getMonth()+1).padStart(2,"0") + "/" + fecha.getFullYear();
      } else {
        fechaStr = String(rawF||"").trim();
        var p = fechaStr.split("/");
        if (p.length === 3) fecha = new Date(Number(p[2]), Number(p[1])-1, Number(p[0]));
      }
      return {
        fecha:       fecha,
        fechaStr:    fechaStr,
        turno:       String(r[1]||"").trim(),
        opl:         String(r[2]||"").trim(),
        total:       Number(r[3]||0),
        despachados: Number(r[4]||0),
        pendientes:  Number(r[5]||0),
        progreso:    Number(r[6]||0),
        estado:      String(r[7]||"").trim(),
        fechaHora:   String(r[8]||"").trim()
      };
    }).filter(function(r){ return r.fecha && r.opl; });
  } catch(e) { Logger.log('_leerHistorico: '+e); return []; }
}

// ─────────────────────────────────────────────────────
// _agruparPorFecha — pre-agrupa para evitar loops repetidos
// ─────────────────────────────────────────────────────
function _agruparPorFecha(datos) {
  var mapa = {};
  datos.forEach(function(r) {
    if (!mapa[r.fechaStr]) mapa[r.fechaStr] = [];
    mapa[r.fechaStr].push(r);
  });
  return mapa;
}

// ─────────────────────────────────────────────────────
// _filtrarPorOPL
// ─────────────────────────────────────────────────────
function _filtrarPorOPL(datos, opl) {
  if (!opl || opl === "Todos" || opl === "Todos los OPLs") return datos;
  return datos.filter(function(r){ return r.opl === opl; });
}

// ─────────────────────────────────────────────────────
// _filtrarAvanzado — filtro nivel BI
// ─────────────────────────────────────────────────────
function _filtrarAvanzado(datos, filtro) {
  return datos.filter(function(r) {
    if (filtro.opl && filtro.opl !== "Todos" && filtro.opl !== "Todos los OPLs" && r.opl !== filtro.opl) return false;
    if (filtro.turno && r.turno !== filtro.turno) return false;
    if (filtro.estado && r.estado !== filtro.estado) return false;
    if (filtro.minDespachados && r.despachados < filtro.minDespachados) return false;
    if (filtro.maxPendientes  && r.pendientes  > filtro.maxPendientes)  return false;
    if (filtro.anio && r.fecha.getFullYear() !== Number(filtro.anio)) return false;
    if (filtro.meses && filtro.meses.length > 0 && filtro.meses.indexOf(r.fecha.getMonth()) === -1) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────
// Helpers de período
// ─────────────────────────────────────────────────────
function _esHoy(fecha) {
  var h = new Date();
  return fecha.getFullYear()===h.getFullYear() && fecha.getMonth()===h.getMonth() && fecha.getDate()===h.getDate();
}
function _esSemana(fecha) {
  var h = new Date(); var ini = new Date(h); ini.setDate(h.getDate()-6); ini.setHours(0,0,0,0);
  return fecha >= ini;
}
function _esMes(fecha) { var h=new Date(); return fecha.getFullYear()===h.getFullYear()&&fecha.getMonth()===h.getMonth(); }
function _esAnio(fecha) { return fecha.getFullYear()===new Date().getFullYear(); }
function _sumarDespachados(datos) { return datos.reduce(function(s,r){return s+r.despachados;},0); }
function _promedioProgreso(datos) {
  if (!datos.length) return 0;
  return Math.round(datos.reduce(function(s,r){return s+r.progreso;},0)/datos.length);
}

// ─────────────────────────────────────────────────────
// _compararOPLs — compara rendimiento entre OPLs
// ─────────────────────────────────────────────────────
function _compararOPLs(datos) {
  var porOPL = {};
  datos.forEach(function(r) {
    if (!porOPL[r.opl]) porOPL[r.opl] = { despachados:0, operaciones:0, pendientes:0, completadas:0 };
    porOPL[r.opl].despachados  += r.despachados;
    porOPL[r.opl].pendientes   += r.pendientes;
    porOPL[r.opl].operaciones  += 1;
    if (r.estado === "Completo") porOPL[r.opl].completadas++;
  });
  return Object.keys(porOPL).map(function(opl) {
    var d = porOPL[opl];
    return {
      opl:         opl,
      despachados: d.despachados,
      operaciones: d.operaciones,
      pendientes:  d.pendientes,
      promedio:    d.operaciones > 0 ? Math.round(d.despachados/d.operaciones) : 0,
      eficiencia:  d.operaciones > 0 ? Math.round((d.completadas/d.operaciones)*100) : 0
    };
  }).sort(function(a,b){ return b.despachados-a.despachados; });
}

// ─────────────────────────────────────────────────────
// _compararMeses — tendencia mes a mes dentro del año
// ─────────────────────────────────────────────────────
function _compararMeses(datos, anio) {
  var mesesNombres = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  var vals = Array(12).fill(0);
  datos.forEach(function(r) {
    if (r.fecha.getFullYear() === anio) vals[r.fecha.getMonth()] += r.despachados;
  });
  return vals.map(function(actual, i) {
    var anterior  = i > 0 ? vals[i-1] : 0;
    var variacion = anterior > 0 ? Math.round(((actual-anterior)/anterior)*100) : null;
    return {
      mes:       i,
      nombre:    mesesNombres[i],
      valor:     actual,
      anterior:  anterior,
      variacion: variacion,
      tendencia: variacion === null ? "—" : variacion >= 0 ? "↑" : "↓"
    };
  });
}

// ─────────────────────────────────────────────────────
// _getProductividad — eficiencia real por operación
// ─────────────────────────────────────────────────────
function _getProductividad(datos) {
  var totalDesp = 0, totalOps = 0, totalComp = 0;
  datos.forEach(function(r) {
    totalDesp += r.despachados;
    totalOps++;
    if (r.estado === "Completo") totalComp++;
  });
  return {
    promedioPorOp:   totalOps > 0 ? Math.round(totalDesp/totalOps) : 0,
    totalOps:        totalOps,
    pctCompletadas:  totalOps > 0 ? Math.round((totalComp/totalOps)*100) : 0
  };
}

// ─────────────────────────────────────────────────────
// _detectarAnomalias — OPLs/turnos problemáticos
// ─────────────────────────────────────────────────────
function _detectarAnomalias(datos) {
  var anomalias = [];
  datos.forEach(function(r) {
    if (r.pendientes > 50 || r.progreso < 50) {
      anomalias.push({
        fecha:       r.fechaStr,
        turno:       r.turno,
        opl:         r.opl,
        pendientes:  r.pendientes,
        progreso:    r.progreso,
        tipo:        r.pendientes > 50 ? "pendientes_altos" : "progreso_bajo"
      });
    }
  });
  return anomalias.sort(function(a,b){ return b.pendientes-a.pendientes; });
}

// ─────────────────────────────────────────────────────
// _evolucionPorOPL — seguimiento individual en el tiempo
// ─────────────────────────────────────────────────────
function _evolucionPorOPL(datos, opl) {
  return datos
    .filter(function(r){ return r.opl === opl; })
    .map(function(r){ return { fecha:r.fechaStr, despachados:r.despachados, pendientes:r.pendientes, progreso:r.progreso }; })
    .sort(function(a,b){ return a.fecha.localeCompare(b.fecha); });
}

// ─────────────────────────────────────────────────────
// _contarOperacionesUnicas
// ─────────────────────────────────────────────────────
function _contarOperacionesUnicas(datos) {
  var set = {};
  datos.forEach(function(r){ set[r.fechaStr+"_"+r.turno]=true; });
  return Object.keys(set).length;
}

// ─────────────────────────────────────────────────────
// _getEvolucion14Dias
// ─────────────────────────────────────────────────────
function _getEvolucion14Dias(datos) {
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  // Pre-agrupar para mayor velocidad
  var mapaFecha = _agruparPorFecha(datos);
  var result = [];
  for (var i=13; i>=0; i--) {
    var dia = new Date(hoy); dia.setDate(hoy.getDate()-i);
    var dd  = String(dia.getDate()).padStart(2,"0");
    var mm  = String(dia.getMonth()+1).padStart(2,"0");
    var key = dd+"/"+mm+"/"+dia.getFullYear();
    var filas = mapaFecha[key] || [];
    result.push({
      label:       dd+"/"+mm,
      despachados: filas.reduce(function(s,r){return s+r.despachados;},0),
      pendientes:  filas.reduce(function(s,r){return s+r.pendientes;},0)
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────
// _getRankingOPL — con promedio por operación
// ─────────────────────────────────────────────────────
function _getRankingOPL(datos) {
  var porOPL = {};
  datos.forEach(function(r) {
    if (!porOPL[r.opl]) porOPL[r.opl] = { despachados:0, ops:0 };
    porOPL[r.opl].despachados += r.despachados;
    porOPL[r.opl].ops++;
  });
  return Object.keys(porOPL).map(function(o) {
    var d = porOPL[o];
    return { opl:o, despachados:d.despachados, promedio: d.ops>0?Math.round(d.despachados/d.ops):0 };
  }).sort(function(a,b){ return b.despachados-a.despachados; });
}

// ─────────────────────────────────────────────────────
// _getPorDiaSemana — semana actual vs anterior
// ─────────────────────────────────────────────────────
function _getPorDiaSemana(datos) {
  var dias = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var inicioSem = new Date(hoy); inicioSem.setDate(hoy.getDate()-6);
  var inicioAnt = new Date(hoy); inicioAnt.setDate(hoy.getDate()-13);
  var sumAct=[0,0,0,0,0,0,0], sumAnt=[0,0,0,0,0,0,0], sumHis=[0,0,0,0,0,0,0], cntHis=[0,0,0,0,0,0,0];
  datos.forEach(function(r) {
    var d  = r.fecha.getDay();
    var fd = new Date(r.fecha.getFullYear(), r.fecha.getMonth(), r.fecha.getDate());
    if (fd>=inicioSem && fd<=hoy) sumAct[d]+=r.despachados;
    if (fd>=inicioAnt && fd<inicioSem) sumAnt[d]+=r.despachados;
    sumHis[d]+=r.despachados; cntHis[d]++;
  });
  var totAct = sumAct.reduce(function(s,v){return s+v;},0);
  var diaSemanaHoy = hoy.getDay();
  return dias.map(function(nombre,i) {
    var actual=sumAct[i], anterior=sumAnt[i];
    var variacion = anterior>0 ? Math.round(((actual-anterior)/anterior)*100) : null;
    return {
      dia:       nombre,
      actual:    actual,
      anterior:  anterior,
      variacion: variacion,
      pctActual: totAct>0 ? Math.round((actual/totAct)*100) : 0,
      total:     sumHis[i],
      promedio:  cntHis[i]>0 ? Math.round(sumHis[i]/cntHis[i]) : 0,
      esHoy:     i===diaSemanaHoy,
      ops:       cntHis[i]
    };
  });
}

// ─────────────────────────────────────────────────────
// _getEficiencia
// ─────────────────────────────────────────────────────
function _getEficiencia(datos) {
  var ops = {};
  datos.forEach(function(r) {
    var key = r.fechaStr+"_"+r.turno;
    if (!ops[key]) ops[key] = r.estado;
  });
  var completas=0, conPendientes=0;
  Object.keys(ops).forEach(function(k){
    if (ops[k]==="Completo") completas++; else conPendientes++;
  });
  var total = completas+conPendientes;
  return {
    completas:     completas,
    conPendientes: conPendientes,
    pctCompletas:  total>0 ? Math.round((completas/total)*100) : 0,
    pctPendientes: total>0 ? Math.round((conPendientes/total)*100) : 0
  };
}

// ─────────────────────────────────────────────────────
// _getBacklog
// ─────────────────────────────────────────────────────
function _getBacklog(datos) {
  var porOPL = {};
  datos.forEach(function(r) {
    if (!porOPL[r.opl]) porOPL[r.opl] = { opsPend:0, totalPend:0, totalOps:0, totalDesp:0 };
    porOPL[r.opl].totalOps++;
    porOPL[r.opl].totalDesp += r.despachados;
    if (r.pendientes>0){ porOPL[r.opl].opsPend++; porOPL[r.opl].totalPend+=r.pendientes; }
  });
  return Object.keys(porOPL).map(function(opl) {
    var d  = porOPL[opl];
    var ef = d.totalOps>0 ? Math.round(((d.totalOps-d.opsPend)/d.totalOps)*100) : 100;
    return {
      opl:             opl,
      opsPendientes:   d.opsPend,
      totalPendientes: d.totalPend,
      eficiencia:      ef,
      estado:          ef>=95?"ok":ef>=80?"revisar":"critico"
    };
  }).filter(function(r){return r.totalPendientes>0;})
    .sort(function(a,b){return b.totalPendientes-a.totalPendientes;});
}

// =====================================================
// getKPIs — función principal mejorada
// =====================================================
function getKPIs(opl, filtro) {
  try {
    var todos = _leerHistorico();
    // Pre-agrupar una sola vez para todo el cálculo
    var mapaFechaGlobal = _agruparPorFecha(todos);

    var anioFiltro  = (filtro && filtro.anio)  ? Number(filtro.anio)  : new Date().getFullYear();
    var mesesFiltro = (filtro && filtro.meses && filtro.meses.length>0) ? filtro.meses : null;

    // Filtrar por OPL y período usando _filtrarAvanzado
    var filtroAvanzado = {
      opl:   opl,
      anio:  anioFiltro,
      meses: mesesFiltro
    };
    var datos   = _filtrarAvanzado(todos, filtroAvanzado);
    var todosOpl= _filtrarPorOPL(todos, opl); // para semana/hoy sin filtro de período

    var hoy    = todosOpl.filter(function(r){ return _esHoy(r.fecha); });
    var semana = todosOpl.filter(function(r){ return _esSemana(r.fecha); });

    var periodo = datos;
    var periodoAnt = _filtrarAvanzado(todos, {
      opl:   opl,
      anio:  mesesFiltro ? anioFiltro-1 : anioFiltro-1,
      meses: mesesFiltro
    });
    var anio    = _filtrarAvanzado(todos, { opl:opl, anio:anioFiltro });
    var anioAnt = _filtrarAvanzado(todos, { opl:opl, anio:anioFiltro-1 });

    // ── Semana KPIs ──
    var despSem   = _sumarDespachados(semana);
    var diasConData = {};
    semana.forEach(function(r){ diasConData[r.fechaStr]=true; });
    var promSem   = Math.round(despSem/Math.max(1,Object.keys(diasConData).length));
    var diasNombres=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
    var sumPorDia=[0,0,0,0,0,0,0];
    semana.forEach(function(r){sumPorDia[r.fecha.getDay()]+=r.despachados;});
    var maxDia=0,diaMayor="";
    sumPorDia.forEach(function(v,i){if(v>maxDia){maxDia=v;diaMayor=diasNombres[i];}});

    // ── Mes KPIs ──
    var despMes  = _sumarDespachados(periodo);
    var hoyD     = new Date().getDate(), mitad=Math.floor(hoyD/2);
    var primera  = periodo.filter(function(r){return r.fecha.getDate()<=mitad;});
    var segunda  = periodo.filter(function(r){return r.fecha.getDate()>mitad;});
    var tendencia= _sumarDespachados(segunda)>=_sumarDespachados(primera)?"subiendo":"bajando";

    // ── Año KPIs ──
    var despAnio = _sumarDespachados(anio);
    var opsAnio  = _contarOperacionesUnicas(anio);
    var porMesAnio={};
    anio.forEach(function(r){var m=r.fecha.getMonth();porMesAnio[m]=(porMesAnio[m]||0)+r.despachados;});
    var mesMayor=0,maxMes=0;
    Object.keys(porMesAnio).forEach(function(m){if(porMesAnio[m]>maxMes){maxMes=porMesAnio[m];mesMayor=Number(m);}});
    var mesesNom=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

    // ── Particulares vs TRANSCARNES ──
    var partic = periodo.filter(function(r){return r.opl!=='TRANSCARNES';});
    var trans  = periodo.filter(function(r){return r.opl==='TRANSCARNES';});

    // ── Productividad real ──
    var productividad = _getProductividad(periodo.length>0?periodo:anio);

    // ── Comparación mes a mes ──
    var comparacionMeses = _compararMeses(anio.length>0?anio:todos, anioFiltro);

    // ── Comparación entre OPLs ──
    var comparacionOPLs = _compararOPLs(periodo.length>0?periodo:anio);

    // ── Detección de anomalías ──
    var anomalias = _detectarAnomalias(todos.filter(function(r){
      return r.fecha.getFullYear()===anioFiltro;
    }));

    // ── Gráficos ──
    var evolucion    = _getEvolucion14Dias(todosOpl);
    var ranking      = _getRankingOPL(periodo.length>0?periodo:datos);
    var porDiaSemana = _getPorDiaSemana(periodo.length>0?periodo:anio.length>0?anio:todos);
    var eficiencia   = _getEficiencia(periodo.length>0?periodo:anio.length>0?anio:todos);
    var backlog      = _getBacklog(periodo.length>0?periodo:todos);
    var despPeriodo  = _sumarDespachados(periodo);
    var efPeriodo    = _getEficiencia(periodo);
    var efPeriAnt    = _getEficiencia(periodoAnt);
    var despHoy      = _sumarDespachados(hoy);
    var progHoy      = _promedioProgreso(hoy);

    return {
      success: true,
      kpis: {
        hoy: {
          despachados: despHoy,
          progreso:    progHoy,
          completas:   hoy.filter(function(r){return r.estado==="Completo";}).length,
          total:       hoy.length,
          badge:       progHoy>=100?"100% completo":progHoy+"% promedio"
        },
        semana: {
          despachados: despSem,
          promDiario:  promSem,
          diaMayor:    diaMayor,
          maxDia:      maxDia
        },
        mes: {
          despachados: despMes,
          tendencia:   tendencia
        },
        periodo: {
          despachados: despPeriodo,
          vsMesAnt:    _sumarDespachados(periodoAnt)
        },
        anio: {
          despachados: despAnio,
          operaciones: opsAnio,
          mesMayor:    mesesNom[mesMayor]||"",
          vsAnioAnt:   _sumarDespachados(anioAnt)
        },
        vs: {
          particulares: partic.reduce(function(s,r){return s+r.despachados;},0),
          transcarnes:  trans.reduce(function(s,r){return s+r.despachados;},0)
        },
        eficiencia:      efPeriodo.pctCompletas,
        eficienciaVsAnt: efPeriAnt.pctCompletas,
        productividad:   productividad,
        anomalias:       anomalias.length
      },
      graficos: {
        evolucion:        evolucion,
        ranking:          ranking,
        porDiaSemana:     porDiaSemana,
        eficiencia:       eficiencia,
        comparacionMeses: comparacionMeses,
        comparacionOPLs:  comparacionOPLs
      },
      backlog:    backlog,
      anomalias:  anomalias.slice(0,10)
    };
  } catch(e) {
    Logger.log('getKPIs error: '+e.toString());
    return { success:false, message:e.toString() };
  }
}

// =====================================================
// getAniosDisponibles
// =====================================================
function getAniosDisponibles() {
  try {
    var datos = _leerHistorico();
    var set   = {};
    datos.forEach(function(r){ if(r.fecha) set[r.fecha.getFullYear()]=true; });
    var anios = Object.keys(set).map(Number).sort(function(a,b){return b-a;});
    if (!anios.length) anios = [new Date().getFullYear()];
    return { success:true, anios:anios };
  } catch(e) { return { success:true, anios:[new Date().getFullYear()] }; }
}

// =====================================================
// getListaOPLsHistorico
// =====================================================
function getListaOPLsHistorico() {
  try {
    var datos = _leerHistorico();
    var set   = {};
    datos.forEach(function(r){ if(r.opl) set[r.opl]=true; });
    return { success:true, opls:["Todos los OPLs"].concat(Object.keys(set).sort()) };
  } catch(e) { return { success:false, opls:["Todos los OPLs"] }; }
}

// =====================================================
// generarReporteOPL — genera HTML del reporte PDF
// =====================================================
function generarReporteOPL(opl, filtro) {
  try {
    var res = getKPIs(opl, filtro);
    if (!res || !res.success) return { success:false, message: res?res.message:"Sin datos." };

    var k  = res.kpis;
    var g  = res.graficos;
    var bl = res.backlog;
    var tz = Session.getScriptTimeZone();
    var fechaReporte = Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm");
    var oplTitulo    = opl==="Todos los OPLs"?"Todos los Operadores":opl;
    var esOplIndividual = (opl!=="Todos los OPLs");

    // Backlog filtrado por OPL
    var blFiltrado = esOplIndividual ? bl.filter(function(b){return b.opl===opl;}) : bl;
    var tieneBacklog = blFiltrado.length > 0;

    var filasBacklog = tieneBacklog ? blFiltrado.map(function(b) {
      var color=b.estado==="ok"?"#16a34a":b.estado==="critico"?"#dc2626":"#d97706";
      var bg   =b.estado==="ok"?"#d1fae5":b.estado==="critico"?"#fee2e2":"#fef3c7";
      return "<tr><td style='padding:9px 12px;font-weight:600;border-bottom:1px solid #e5e7eb;'>"+b.opl+"</td>"
        +"<td style='padding:9px 12px;text-align:center;border-bottom:1px solid #e5e7eb;'>"+b.opsPendientes+"</td>"
        +"<td style='padding:9px 12px;text-align:center;border-bottom:1px solid #e5e7eb;'>"+b.totalPendientes+"</td>"
        +"<td style='padding:9px 12px;text-align:center;border-bottom:1px solid #e5e7eb;'>"
        +"<span style='background:"+bg+";color:"+color+";padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;'>"+b.eficiencia+"%</span>"
        +"</td></tr>";
    }).join("") : "";

    // Datos para gráficos
    var ev       = g.evolucion;
    var labEv    = JSON.stringify(ev.map(function(d){return d.label;}));
    var datDesp  = JSON.stringify(ev.map(function(d){return d.despachados;}));
    var datPend  = JSON.stringify(ev.map(function(d){return d.pendientes;}));
    var rank     = g.ranking.slice(0,8);
    var labRank  = JSON.stringify(rank.map(function(r){return r.opl;}));
    var datRank  = JSON.stringify(rank.map(function(r){return r.despachados;}));
    var semana   = g.porDiaSemana;
    var labSem   = JSON.stringify(semana.map(function(d){return d.dia;}));
    var datSemAct= JSON.stringify(semana.map(function(d){return d.actual;}));
    var datSemAnt= JSON.stringify(semana.map(function(d){return d.anterior;}));
    var bgSemAct = JSON.stringify(semana.map(function(d){return d.esHoy?'#1a7a2e':'#259c39';}));
    var hoyIdxS  = semana.map(function(d){return d.esHoy;}).indexOf(true);
    var hoyDS    = hoyIdxS>=0?semana[hoyIdxS]:{dia:'—',actual:0,anterior:0,variacion:null,pctActual:0};
    var diaMFS   = semana.reduce(function(a,b){return a.actual>b.actual?a:b;});
    var varHS    = hoyDS.variacion;
    var varLHS   = varHS===null?'Sin dato ant.':(varHS>=0?'&#8593; +':'&#8595; ')+Math.abs(varHS)+'% vs sem. ant.';
    var varCHS   = varHS===null?'#6b7280':varHS>=0?'#16a34a':'#dc2626';
    var ef       = g.eficiencia;

    // Comparación mes a mes para el reporte
    var compMeses = g.comparacionMeses || [];
    var labMeses  = JSON.stringify(compMeses.map(function(m){return m.nombre;}));
    var datMeses  = JSON.stringify(compMeses.map(function(m){return m.valor;}));

    // Productividad
    var prod = k.productividad || { promedioPorOp:0, totalOps:0, pctCompletadas:0 };

    // Sección backlog
    var secBacklog = tieneBacklog
      ? "<div class='chart-box'><div class='chart-titulo'>Backlog por OPL</div><div class='chart-sub'>OPLs con pendientes acumulados</div>"
        +"<table class='tabla'><thead><tr><th>OPL</th><th>Ops c/pend</th><th>Total pend</th><th>Eficiencia</th></tr></thead>"
        +"<tbody>"+filasBacklog+"</tbody></table></div>"
      : "<div class='chart-box' style='display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f0fdf4;border:1px solid #86efac;'>"
        +"<div style='font-size:28px;margin-bottom:6px;'>&#10003;</div>"
        +"<div style='font-weight:700;color:#16a34a;font-size:13px;'>Sin backlog registrado</div>"
        +"<div style='color:#6b7280;font-size:11px;margin-top:4px;text-align:center;'>Este operador no ha presentado<br>pendientes en operaciones anteriores.</div>"
        +"</div>";

    // KPI1 Particulares vs TRANSCARNES
    var pTotal=k.vs?k.vs.particulares:0, tTotal=k.vs?k.vs.transcarnes:0;
    var grand=pTotal+tTotal, pPct=grand>0?Math.round((pTotal/grand)*100):0, tPct=grand>0?Math.round((tTotal/grand)*100):0;
    var kpi1Html = esOplIndividual
      ? "<div class='kpi'><div class='kpi-label'>"+oplTitulo+"</div><div class='kpi-val'>"+((pTotal+tTotal))+"</div><div class='kpi-sub'>despachados período</div></div>"
      : "<div class='kpi' style='padding:10px 6px;'>"
        +"<div class='kpi-label' style='text-align:center;margin-bottom:8px;'>Particulares vs TRANSCARNES</div>"
        +"<div style='display:flex;justify-content:center;align-items:flex-end;gap:14px;'>"
        +"<div style='text-align:center;'><div style='font-size:22px;font-weight:800;color:#259c39;line-height:1;'>"+pTotal+"</div>"
        +"<div style='font-size:9px;color:#6b7280;font-weight:600;margin-top:2px;'>PARTICULARES</div>"
        +"<div style='font-size:13px;font-weight:700;color:#259c39;'>"+pPct+"%</div></div>"
        +"<div style='font-size:13px;color:#9ca3af;padding-bottom:14px;'>vs</div>"
        +"<div style='text-align:center;'><div style='font-size:22px;font-weight:800;color:#378ADD;line-height:1;'>"+tTotal+"</div>"
        +"<div style='font-size:9px;color:#6b7280;font-weight:600;margin-top:2px;'>TRANSCARNES</div>"
        +"<div style='font-size:13px;font-weight:700;color:#378ADD;'>"+tPct+"%</div></div>"
        +"</div></div>";

    var html = "<!DOCTYPE html><html lang='es'><head>"
      +"<meta charset='UTF-8'><title>Reporte OPL - Colbeef</title>"
      +"<script src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'><\/script>"
      +"<style>"
      +"*{margin:0;padding:0;box-sizing:border-box;}"
      +"@page{size:letter portrait;margin:6mm;}"
      +"body{font-family:Arial,Helvetica,sans-serif;background:#eaf5ec;padding:20px;display:flex;justify-content:center;}"
      +".page{width:100%;max-width:900px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);}"
      +".header{background:linear-gradient(135deg,#259c39 0%,#1a7a2e 100%);padding:22px 36px;color:white;display:flex;justify-content:space-between;align-items:center;}"
      +".header h1{font-size:22px;font-weight:800;line-height:1.1;}"
      +".header .opl-name{font-size:15px;font-weight:700;color:#d1fae5;margin-top:4px;}"
      +".header .fecha{font-size:11px;opacity:0.7;margin-top:3px;}"
      +".brand{font-size:26px;font-weight:800;line-height:1;}"
      +".brand-sub{font-size:10px;opacity:0.75;text-align:right;margin-top:3px;}"
      +".resumen{padding:8px 36px;background:#e8f5e9;border-bottom:2px solid #259c39;font-size:11px;color:#374151;line-height:1.6;}"
      +".resumen strong{color:#259c39;}"
      +".body{padding:16px 36px;}"
      +".seccion{margin-bottom:14px;}"
      +".sec-titulo{background:#259c39;color:white;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;}"
      +".kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}"
      +".kpi{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 8px;border-top:3px solid #259c39;text-align:center;}"
      +".kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#6b7280;margin-bottom:5px;}"
      +".kpi-val{font-size:22px;font-weight:800;color:#259c39;line-height:1;}"
      +".kpi-sub{font-size:10px;color:#6b7280;margin-top:4px;}"
      +".grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}"
      +".chart-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;}"
      +".chart-box-full{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;}"
      +".chart-titulo{font-size:12px;font-weight:700;color:#259c39;margin-bottom:2px;}"
      +".chart-sub{font-size:10px;color:#6b7280;margin-bottom:8px;}"
      +".prod-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;}"
      +".prod-card{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px;text-align:center;}"
      +".prod-val{font-size:18px;font-weight:800;color:#16a34a;}"
      +".prod-label{font-size:9px;color:#6b7280;text-transform:uppercase;margin-top:3px;}"
      +".tabla{width:100%;border-collapse:collapse;font-size:11px;}"
      +".tabla thead tr{background:#259c39;color:white;}"
      +".tabla th{padding:7px 9px;text-align:left;font-weight:700;font-size:10px;}"
      +".tabla th:not(:first-child){text-align:center;}"
      +".footer{background:#259c39;color:white;padding:10px 36px;display:flex;justify-content:space-between;align-items:center;}"
      +".footer-brand{font-size:13px;font-weight:800;color:#d1fae5;}"
      +".footer-info{font-size:10px;opacity:0.8;}"
      +".print-btn{display:block;width:100%;padding:14px;background:#25D366;color:#fff;border:none;font-size:15px;font-weight:700;cursor:pointer;}"
      +".print-btn:hover{background:#1da851;}"
      +"@media print{"
      +".print-btn{display:none!important;}"
      +"html,body{background:white!important;padding:0;}"
      +".page{box-shadow:none!important;border-radius:0;max-width:100%;}"
      +".body{padding:10px 20px;}"
      +".header{padding:14px 20px;border-radius:0;}"
      +".seccion{margin-bottom:8px;page-break-inside:avoid;}"
      +".kpi{padding:7px 5px;}.kpi-val{font-size:18px!important;}.kpi-grid{gap:6px;}"
      +".grid2{gap:8px;}.chart-box,.chart-box-full{padding:8px;}"
      +"}"
      +"<\/style></head><body><div class='page'>";

    html += "<div class='header'>"
      +"<div><h1>Reporte Operativo OPL</h1>"
      +"<div class='opl-name'>"+oplTitulo+"</div>"
      +"<div class='fecha'>Generado el "+fechaReporte+"</div></div>"
      +"<div style='text-align:right;'>"
      +"<div class='brand'><span style='color:#74c69d;'>Col</span><span style='color:#ff8a80;'>beef</span><span style='color:white;font-size:13px;font-weight:400;margin-left:6px;opacity:0.85;vertical-align:middle;'>S.A.S</span></div>"
      +"<div class='brand-sub'>Gesti&oacute;n de V&iacute;sceras</div>"
      +"</div></div>";

    html += "<div class='resumen'>"
      +"Operador: <strong>"+oplTitulo+"</strong> &nbsp;|&nbsp; "
      +"Semana: <strong>"+( k.semana.despachados||0)+"</strong> &nbsp;|&nbsp; "
      +"Mes: <strong>"+(k.mes.despachados||0)+"</strong> &nbsp;|&nbsp; "
      +"A&ntilde;o: <strong>"+(k.anio.despachados||0)+"</strong> &nbsp;|&nbsp; "
      +"Eficiencia: <strong>"+(k.eficiencia||0)+"%</strong> &nbsp;|&nbsp; "
      +"Prom/op: <strong>"+(prod.promedioPorOp||0)+"</strong>"
      +"</div>";

    html += "<div class='body'>";

    // KPIs
    html += "<div class='seccion'><div class='sec-titulo'>Indicadores clave</div>"
      +"<div class='kpi-grid'>"
      +kpi1Html
      +"<div class='kpi' style='border-top-color:#378ADD;'><div class='kpi-label'>Esta semana</div><div class='kpi-val' style='color:#378ADD;'>"+(k.semana.despachados||0)+"</div><div class='kpi-sub'>"+(k.semana.promDiario||0)+" prom/d&iacute;a</div></div>"
      +"<div class='kpi' style='border-top-color:#7F77DD;'><div class='kpi-label'>Este mes</div><div class='kpi-val' style='color:#7F77DD;'>"+(k.mes.despachados||0)+"</div><div class='kpi-sub'>tendencia: "+(k.mes.tendencia||"&mdash;")+"</div></div>"
      +"<div class='kpi' style='border-top-color:#BA7517;'><div class='kpi-label'>A&ntilde;o "+(filtro?filtro.anio:2026)+"</div><div class='kpi-val' style='color:#BA7517;'>"+(k.anio.despachados||0)+"</div><div class='kpi-sub'>"+(k.anio.operaciones||0)+" operaciones</div></div>"
      +"</div></div>";

    // Productividad real
    html += "<div class='seccion'><div class='sec-titulo'>Productividad real</div>"
      +"<div class='prod-grid'>"
      +"<div class='prod-card'><div class='prod-val'>"+prod.promedioPorOp+"</div><div class='prod-label'>Desp por operaci&oacute;n</div></div>"
      +"<div class='prod-card'><div class='prod-val'>"+prod.totalOps+"</div><div class='prod-label'>Total operaciones</div></div>"
      +"<div class='prod-card'><div class='prod-val'>"+prod.pctCompletadas+"%</div><div class='prod-label'>Operaciones completas</div></div>"
      +"</div></div>";

    // Evolución 14 días
    html += "<div class='seccion'><div class='sec-titulo'>Evoluci&oacute;n diaria &mdash; &uacute;ltimos 14 d&iacute;as</div>"
      +"<div class='chart-box-full'><div class='chart-sub'>Verde = despachados &nbsp;&middot;&nbsp; Rojo = pendientes al cierre</div>"
      +"<div style='position:relative;width:100%;height:160px;'><canvas id='rChart1'></canvas></div></div></div>";

    // Ranking + Días semana
    html += "<div class='seccion'><div class='sec-titulo'>Productividad y patrones</div>"
      +"<div class='grid2'>"
      +"<div class='chart-box'><div class='chart-titulo'>Ranking por OPL</div><div class='chart-sub'>Total despachado</div>"
      +"<div style='position:relative;width:100%;height:160px;'><canvas id='rChart2'></canvas></div></div>"
      +"<div class='chart-box'>"
      +"<div class='chart-titulo'>D&iacute;as con m&aacute;s movimiento</div>"
      +"<div style='display:flex;gap:6px;margin-bottom:6px;'>"
      +"<div style='flex:1;background:#f0fdf4;border-radius:5px;padding:5px 8px;'>"
      +"<div style='font-size:8px;color:#6b7280;font-weight:600;text-transform:uppercase;'>D&iacute;a m&aacute;s fuerte</div>"
      +"<div style='font-size:13px;font-weight:800;color:#259c39;'>"+diaMFS.dia+" &mdash; "+diaMFS.actual+"</div></div>"
      +"<div style='flex:1;background:#f0fdf4;border-radius:5px;padding:5px 8px;'>"
      +"<div style='font-size:8px;color:#6b7280;font-weight:600;text-transform:uppercase;'>Hoy ("+hoyDS.dia+")</div>"
      +"<div style='font-size:13px;font-weight:800;color:#259c39;'>"+hoyDS.actual+"</div>"
      +"<div style='font-size:9px;font-weight:700;color:"+varCHS+"'>"+varLHS+"</div></div>"
      +"</div>"
      +"<div style='position:relative;width:100%;height:130px;'><canvas id='rChart3'></canvas></div></div>"
      +"</div></div>";

    // Evolución mes a mes
    html += "<div class='seccion'><div class='sec-titulo'>Evoluci&oacute;n mes a mes &mdash; "+filtro.anio+"</div>"
      +"<div class='chart-box-full'><div class='chart-sub'>Despachados por mes &mdash; comparaci&oacute;n mes a mes</div>"
      +"<div style='position:relative;width:100%;height:140px;'><canvas id='rChart5'></canvas></div></div></div>";

    // Eficiencia + Backlog
    html += "<div class='seccion'><div class='sec-titulo'>Eficiencia operacional"+(tieneBacklog?" y backlog":"")+"</div>"
      +"<div class='grid2'>"
      +"<div class='chart-box'><div class='chart-titulo'>Operaciones completas vs con pendientes</div>"
      +"<div style='position:relative;width:100%;height:140px;'><canvas id='rChart4'></canvas></div></div>"
      +secBacklog
      +"</div></div>";

    html += "</div>"; // /body

    html += "<div class='footer'>"
      +"<div><div class='footer-brand'>Colbeef &middot; Gestor de V&iacute;sceras</div>"
      +"<div class='footer-info'>Reporte generado autom&aacute;ticamente &middot; "+fechaReporte+"</div></div>"
      +"<div class='footer-info' style='text-align:right;'>Datos desde HISTORICO_OPL</div></div>";

    html += "<button class='print-btn' onclick='window.print()'>&#128424; Guardar como PDF &mdash; Ctrl+P</button>"
      +"</div></body>";

    // Scripts Chart.js
    html += "<script>"
      +"(function(){"
      +"function initCharts(){"
      +"if(typeof Chart==='undefined'){setTimeout(initCharts,100);return;}"
      // Chart 1 — Evolución
      +"new Chart(document.getElementById('rChart1'),{type:'line',data:{labels:"+labEv+",datasets:["
      +"{label:'Despachados',data:"+datDesp+",borderColor:'#259c39',backgroundColor:'rgba(37,156,57,0.08)',fill:true,tension:0.4,pointRadius:4},"
      +"{label:'Pendientes',data:"+datPend+",borderColor:'#dc2626',backgroundColor:'rgba(220,38,38,0.05)',fill:true,tension:0.4,pointRadius:4}"
      +"]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:9},padding:8}}},scales:{x:{ticks:{font:{size:9},maxRotation:45}},y:{beginAtZero:true,ticks:{font:{size:9}}}}}});"
      // Chart 2 — Ranking
      +"new Chart(document.getElementById('rChart2'),{type:'bar',data:{labels:"+labRank+",datasets:[{data:"+datRank+",backgroundColor:['#259c39','#378ADD','#7F77DD','#BA7517','#1D9E75','#378ADD','#7F77DD','#BA7517'],borderRadius:3}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:9}}},y:{ticks:{font:{size:9}}}}}});"
      // Chart 3 — Días semana barras agrupadas
      +"new Chart(document.getElementById('rChart3'),{type:'bar',data:{labels:"+labSem+",datasets:["
      +"{label:'Esta sem',data:"+datSemAct+",backgroundColor:"+bgSemAct+",borderRadius:3},"
      +"{label:'Sem ant',data:"+datSemAnt+",backgroundColor:'rgba(37,156,57,0.25)',borderRadius:3}"
      +"]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:8},padding:6}}},scales:{x:{ticks:{font:{size:9}}},y:{beginAtZero:true,ticks:{font:{size:8}}}}}});"
      // Chart 4 — Eficiencia donut
      +"new Chart(document.getElementById('rChart4'),{type:'doughnut',data:{"
      +"labels:['Completas: "+ef.completas+" ops ("+ef.pctCompletas+"%)','Con pendientes: "+ef.conPendientes+" ops ("+ef.pctPendientes+"%)'],"
      +"datasets:[{data:["+ef.completas+","+ef.conPendientes+"],backgroundColor:['#259c39','#fca5a5'],borderWidth:2}]},"
      +"options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:9},padding:8}}}}});"
      // Chart 5 — Evolución mes a mes
      +"var mesesData="+datMeses+";"
      +"var mesesColors=mesesData.map(function(v,i){return i>0&&v>=mesesData[i-1]?'#259c39':'rgba(37,156,57,0.4)';});"
      +"new Chart(document.getElementById('rChart5'),{type:'bar',data:{labels:"+labMeses+",datasets:[{data:mesesData,backgroundColor:mesesColors,borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return 'Total: '+c.parsed.y+' juegos';}}}},scales:{x:{ticks:{font:{size:9}}},y:{beginAtZero:true,ticks:{font:{size:8}}}}}});"
      +"}"
      +"initCharts();"
      +"})();"
      +"<\/script></html>";

    return { success:true, html:html };
  } catch(e) {
    Logger.log('generarReporteOPL error: '+e.toString());
    return { success:false, message:e.toString() };
  }
}