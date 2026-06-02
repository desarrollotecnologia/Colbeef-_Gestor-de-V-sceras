import {
  TIPOS_PRODUCTO,
  PUESTOS_EXCLUIDOS_DESP,
  OPL_DEFAULT,
  ESTADO_COMPLETO,
  ESTADO_PENDIENTE,
} from './constants.js';
import {
  codigoBase,
  construirMapaReporteDecomisos,
  esCruda,
  extraerPuesto,
  detectarTurnoDesdeDatos,
  detectarTurnoPorDia,
  detectarTurnoPorFechaISO,
  productoDecomisoDesdeMapa,
  construirMapaDecomisosPorAnimal,
  decomisoInfoDesdeMapa,
  decomisoInfoUnificado,
  construirIndiceDecomisosVw,
  claveAgrupacionPuesto,
  parsePuestoOperacion,
  aplicarEstadoEnCavaNeto,
  resolverTurnoOperacion,
} from './engineUtils.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  fetchEstadoCavasRows,
  fetchReporteDecomisosRows,
  fetchDecomisosAnimalesVw,
  fetchDespachosCavasRows,
  estadoCavaRowToDto,
  despachoCavaRowToDto,
  consultarDecomisosDesdeSirt,
} from './sirtSync.js';
import { loadState, saveState, defaultState } from './store.js';

function cargarMapaOPL(state) {
  const mapa = {};
  (state.oplConfig || []).forEach((r) => {
    const p = String(r.propietario || '').trim().toUpperCase();
    if (p) mapa[p] = String(r.opl || '').trim() || OPL_DEFAULT;
  });
  return mapa;
}

function tieneJuegoCompleto(tipos) {
  return TIPOS_PRODUCTO.every((tipo) => tipos.has(tipo));
}

/** Filas de salida del turno con puesto normalizado (sufijo /turno/). */
function filasDespachoTurno(despachosCavas, turno) {
  return (despachosCavas || []).map((fila) => {
    const p = String(fila[9] ?? '').trim();
    if (p.includes(turno)) return fila;
    const c = fila.slice();
    c[9] = (p ? `${p} ` : '') + `/${turno}/`;
    return c;
  });
}

/**
 * Resumen por puesto: productos en cava con salida del día → totales por destino,
 * decomiso y cruda.
 */
function construirResumenDespachosDesdeFilas(
  despachosCavas,
  turnoForzado,
  reporteDecomisos = [],
  estadoFromRow12 = [],
  mapaOPL = {},
  opts = {}
) {
  const indiceVw = opts.indiceVw || null;
  const salidasBase = despachosCavas || [];
  const estadoNeto = aplicarEstadoEnCavaNeto(estadoFromRow12, despachosCavas);
  const { basesEnCava, crudaBases } = construirIndiceEnCava(estadoNeto);

  if (!salidasBase.length) {
    const turnoVac =
      turnoForzado && String(turnoForzado).length > 0
        ? String(turnoForzado)
        : resolverTurnoOperacion({}, despachosCavas || []);
    return {
      turno: turnoVac,
      fechaStr: '',
      totalJuegos: 0,
      resultado: [],
      historicoGuardadoFlag: '',
      totalConDecomiso: 0,
      filasEnCava: basesEnCava.size,
      filasSalidasTotales: (despachosCavas || []).length,
      filasSalidasUsadas: 0,
      salidasOmitidasSinCava: 0,
      filtroEnCavaActivo: false,
    };
  }
  const turno =
    turnoForzado && String(turnoForzado).length > 0
      ? String(turnoForzado)
      : resolverTurnoOperacion({}, salidasBase);
  const data = filasDespachoTurno(salidasBase, turno);
  const mapaDec = construirMapaDecomisosPorAnimal(reporteDecomisos);
  const basesDecomisoVw = new Set();
  const basesDecomisoSai = new Set();

  const puestoMeta = {};
  const basesDecomisoProgramados = new Set();
  data.forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const tipo = String(fila[7] ?? '').trim();
    const puestoTexto = String(fila[9] ?? '').trim() || String(fila[8] ?? '').trim();
    if (!id || !tipo || !puestoTexto) return;
    if (!puestoTexto.includes(turno)) return;
    if (PUESTOS_EXCLUIDOS_DESP.includes(puestoTexto)) return;
    const clave = claveAgrupacionPuesto(puestoTexto);
    if (!clave) return;
    if (!puestoMeta[clave]) {
      puestoMeta[clave] = {
        puesto: puestoTexto,
        Cabeza: 0,
        'Patas y Manos': 0,
        'Visceras Blancas': 0,
        'Visceras Rojas': 0,
        animales: {},
        basesConDecomiso: new Set(),
        basesDecContados: new Set(),
        decomisoPorTipo: {},
        tieneCruda: false,
        props: {},
      };
    } else if (puestoTexto.length > puestoMeta[clave].puesto.length) {
      puestoMeta[clave].puesto = puestoTexto;
    }
    const prop = String(fila[4] ?? '').trim().toUpperCase();
    if (prop) puestoMeta[clave].props[prop] = (puestoMeta[clave].props[prop] || 0) + 1;
    if (TIPOS_PRODUCTO.includes(tipo)) puestoMeta[clave][tipo]++;
    const base = codigoBase(id);
    if (!base) return;
    if (tipo === 'Visceras Blancas' && crudaBases.has(base)) puestoMeta[clave].tieneCruda = true;
    if (!puestoMeta[clave].animales[base]) puestoMeta[clave].animales[base] = new Set();
    puestoMeta[clave].animales[base].add(tipo);
    const dec = decomisoInfoUnificado(mapaDec, indiceVw, id);
    if (dec && !puestoMeta[clave].basesDecContados.has(base)) {
      puestoMeta[clave].basesDecContados.add(base);
      puestoMeta[clave].basesConDecomiso.add(base);
      basesDecomisoProgramados.add(base);
      const fuentes = dec.fuentes || [];
      if (fuentes.includes('vw_decomisos')) basesDecomisoVw.add(base);
      if (fuentes.includes('sai')) basesDecomisoSai.add(base);
      if (!fuentes.length) basesDecomisoSai.add(base);
      dec.tipos.forEach((tDec) => {
        puestoMeta[clave].decomisoPorTipo[tDec] = (puestoMeta[clave].decomisoPorTipo[tDec] || 0) + 1;
      });
    }
  });

  const resultado = [];
  let totalJuegos = 0;
  Object.keys(puestoMeta)
    .sort((a, b) => puestoMeta[a].puesto.localeCompare(puestoMeta[b].puesto))
    .forEach((clave) => {
      const meta = puestoMeta[clave];
      const r = { puesto: meta.puesto };
      TIPOS_PRODUCTO.forEach((t) => {
        r[t] = meta[t] || 0;
      });
      const vals = TIPOS_PRODUCTO.map((t) => r[t]);
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      let juegos = 0;
      Object.keys(meta.animales).forEach((base) => {
        const tipos = meta.animales[base];
        if (tieneJuegoCompleto(tipos)) juegos++;
      });
      r.Juegos = juegos;
      totalJuegos += juegos;
      r.animalesDecomiso = meta.basesConDecomiso.size;
      r.decomisoPorTipo = meta.decomisoPorTipo || {};
      r.incompletoPorDecomiso = meta.basesConDecomiso.size > 0;
      r.incompletoCantidades = minVal !== maxVal;
      r.incompleto = r.incompletoCantidades || r.incompletoPorDecomiso;
      r.tieneCruda = Boolean(meta.tieneCruda);
      const props = meta.props || {};
      const propTop = Object.keys(props).sort((a, b) => props[b] - props[a])[0] || '';
      r.opl = propTop ? mapaOPL[propTop] || OPL_DEFAULT : OPL_DEFAULT;
      const po = parsePuestoOperacion(meta.puesto);
      r.etiquetaPuesto = po.etiqueta;
      r.zonaPuesto = po.zona;
      r.rutaPuesto = po.ruta;
      r.codigoPuesto =
        po.codigo || extraerPuesto(meta.puesto) || codigoPuestoPlanilla(meta.puesto);
      resultado.push(r);
    });

  return {
    turno,
    fechaStr: '',
    totalJuegos,
    resultado,
    historicoGuardadoFlag: '',
    totalConDecomiso: basesDecomisoProgramados.size,
    totalConDecomisoVw: basesDecomisoVw.size,
    totalConDecomisoSai: basesDecomisoSai.size,
    filasEnCava: basesEnCava.size,
    filasSalidasTotales: (despachosCavas || []).length,
    filasSalidasUsadas: salidasBase.length,
    salidasOmitidasSinCava: 0,
    filtroEnCavaActivo: false,
  };
}

function contarJuegosCompletosPorClave(rows, cols, getClave, turno = '') {
  const grupos = {};
  (rows || []).forEach((fila) => {
    const id = String(fila[cols.id] ?? '').trim();
    const tipo = String(fila[cols.tipo] ?? '').trim();
    const puesto = cols.puesto !== undefined ? String(fila[cols.puesto] ?? '').trim() : '';
    if (!id || !TIPOS_PRODUCTO.includes(tipo)) return;
    if (turno && puesto && !puesto.includes(turno)) return;
    const base = codigoBase(id);
    if (!base) return;
    const clave = String(getClave(fila) || '').trim();
    if (!clave) return;
    if (!grupos[clave]) grupos[clave] = {};
    if (!grupos[clave][base]) grupos[clave][base] = new Set();
    grupos[clave][base].add(tipo);
  });

  const conteo = {};
  Object.keys(grupos).forEach((clave) => {
    conteo[clave] = Object.values(grupos[clave]).filter(tieneJuegoCompleto).length;
  });
  return conteo;
}

function totalJuegosCompletos(rows, cols, turno = '') {
  const conteo = contarJuegosCompletosPorClave(rows, cols, () => '__TOTAL__', turno);
  return conteo.__TOTAL__ || 0;
}

export async function initializeSheets() {
  await loadState();
  return { success: true };
}

function normalizarRangoFechas(range) {
  const date = String(range?.date || '').trim();
  const from = String(range?.from || '').trim();
  const to = String(range?.to || '').trim();
  const ok = /^\d{4}-\d{2}-\d{2}$/;
  if (ok.test(date)) return { from: date, to: date };
  return {
    from: ok.test(from) ? from : null,
    to: ok.test(to) ? to : null,
  };
}

function filtroSirtValido(filtro) {
  return Boolean(filtro?.from && filtro?.to);
}

function despachosFuenteProgramadoTurno() {
  const fuente = String(process.env.SIRT_DESPACHOS_FUENTE || 'programado').toLowerCase();
  return fuente === 'programado';
}

function despachosUsaSoloFechaConsulta() {
  const fuente = String(process.env.SIRT_DESPACHOS_FUENTE || 'programado').toLowerCase();
  return fuente === 'programado' || fuente === 'erp';
}

/** Despachos: programado = turno ISODOW + en cava; otras fuentes = fecha / lookback. */
async function fetchDespachosParaConsulta(filtro) {
  const useRange = filtroSirtValido(filtro) ? filtro : {};
  const desp = await fetchDespachosCavasRows(useRange);
  const turno = resolverTurnoOperacion(useRange, desp);
  if (despachosFuenteProgramadoTurno()) {
    if (filtroSirtValido(filtro) && !desp.length) {
      return {
        desp,
        usoLookback: false,
        turnoOperacion: turno,
        modoDespachos: 'turno-isodow',
        avisoRango: `Sin piezas en cava programadas para el turno ${turno} (día ${useRange.from}).`,
      };
    }
    return {
      desp,
      usoLookback: false,
      turnoOperacion: turno,
      modoDespachos: 'turno-isodow',
      avisoRango: '',
    };
  }
  if (filtroSirtValido(filtro) && !desp.length && despachosUsaSoloFechaConsulta()) {
    return {
      desp,
      usoLookback: false,
      avisoRango: `Sin despachos programados para ${useRange.from}.`,
    };
  }
  if (filtroSirtValido(filtro) && !desp.length) {
    const despLb = await fetchDespachosCavasRows({});
    return {
      desp: despLb,
      usoLookback: true,
      avisoRango: 'Sin registros en la fecha exacta; se usó ventana lookback de SIRT.',
    };
  }
  return { desp, usoLookback: false, avisoRango: '' };
}

function filaSalidaCavaIdDestino(fila) {
  return {
    id: String(fila[3] ?? '').trim(),
    destino: String(fila[8] ?? fila[9] ?? '').trim(),
  };
}

/** Índice de animales en cava (código base) y cuáles tienen VB cruda. */
function construirIndiceEnCava(estadoFromRow12) {
  const basesEnCava = new Set();
  const crudaBases = new Set();
  (estadoFromRow12 || []).forEach((fila) => {
    const id = String(fila[0] ?? '').trim();
    const desc = String(fila[1] ?? '').trim();
    const base = codigoBase(id);
    if (!base) return;
    basesEnCava.add(base);
    if (desc === 'Visceras Blancas' && esCruda(fila[13])) crudaBases.add(base);
  });
  return { basesEnCava, crudaBases };
}

/** Animales únicos (código base) con decomiso en salida programada del turno (mismo criterio que tablero). */
function contarAnimalesDecomisoEnSalidasProgramadas(
  salidasFilas,
  reporteDecomisos,
  turno,
  indiceVw = null
) {
  const salidas = salidasFilas || [];
  if (!salidas.length || !turno) return 0;
  const mapaDec = construirMapaDecomisosPorAnimal(reporteDecomisos);
  const bases = new Set();
  filasDespachoTurno(salidas, turno).forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const puestoTexto = String(fila[9] ?? '').trim() || String(fila[8] ?? '').trim();
    if (!id || !puestoTexto.includes(turno)) return;
    if (PUESTOS_EXCLUIDOS_DESP.includes(puestoTexto)) return;
    const base = codigoBase(id);
    if (!base) return;
    if (decomisoInfoUnificado(mapaDec, indiceVw, id)) bases.add(base);
  });
  return bases.size;
}

/** Cruce pieza programada ↔ decomiso SAI (una fila por id_producto con match). */
function cruzarDecomisosConSalidas(salidasFilas, reporteDecomisos) {
  const salidas = salidasFilas || [];
  if (!salidas.length || !reporteDecomisos?.length) return [];
  const mapa = construirMapaReporteDecomisos(reporteDecomisos);
  const resultado = [];
  salidas.forEach((fila) => {
    const puestoTexto = String(fila[9] ?? '').trim() || String(fila[8] ?? '').trim();
    if (puestoTexto && PUESTOS_EXCLUIDOS_DESP.includes(puestoTexto)) return;
    const { id, destino } = filaSalidaCavaIdDestino(fila);
    const prod = productoDecomisoDesdeMapa(mapa, id);
    if (id && prod !== undefined) resultado.push([id, destino, prod]);
  });
  resultado.sort((a, b) => {
    const d = String(a[1] || '').localeCompare(String(b[1] || ''), 'es');
    return d !== 0 ? d : String(a[0] || '').localeCompare(String(b[0] || ''), 'es');
  });
  return resultado;
}

function contarCruceDecomisosSync(_estadoFromRow12, reporteDecomisos, salidasFilas) {
  return cruzarDecomisosConSalidas(salidasFilas, reporteDecomisos).length;
}

const COLS_DESPACHO_CAVA = { id: 3, tipo: 7, prop: 4, puesto: 9 };

/** Reinicia totales OPL al cambiar el día de operación (baseline del turno). */
function asegurarBaselineOplDelDia(s, fechaIso) {
  const dia = String(fechaIso || s.lastSyncRange?.from || '').trim();
  if (!dia) return;
  if (String(s.oplBaselineFecha || '') !== dia) {
    (s.oplConfig || []).forEach((r) => {
      r.total = 0;
    });
    s.oplBaselineFecha = dia;
  }
}

/** Congela el máximo de juegos vistos por propietario (no baja si salen de cava). */
function actualizarBaselineOplDesdeDespachosSync(s, turno) {
  asegurarBaselineOplDelDia(s, s.lastSyncRange?.from);
  const mapaOPL = cargarMapaOPL(s);
  const porProp = contarJuegosCompletosPorClave(
    s.despachosCavas || [],
    COLS_DESPACHO_CAVA,
    (fila) => String(fila[4] ?? '').trim().toUpperCase(),
    turno
  );
  const propToIdx = {};
  (s.oplConfig || []).forEach((r, i) => {
    propToIdx[String(r.propietario).trim().toUpperCase()] = i;
  });
  Object.keys(porProp).forEach((propUpper) => {
    const n = porProp[propUpper];
    if (!n) return;
    const idx = propToIdx[propUpper];
    if (idx !== undefined) {
      s.oplConfig[idx].total = Math.max(Number(s.oplConfig[idx].total || 0), n);
    } else {
      s.oplConfig.push({
        propietario: propUpper,
        opl: mapaOPL[propUpper] || OPL_DEFAULT,
        total: n,
      });
      propToIdx[propUpper] = s.oplConfig.length - 1;
    }
  });
}

/**
 * Progreso OPL en tiempo real: total del turno (baseline) − lo que sigue en cava (pendiente).
 * Cuando SIRT registra salida (fecha_salida), la pieza deja de estar en despachosCavas → sube despachado.
 */
function construirProgresoOplDesdeDespachos(s, turno, fecha) {
  const mapaOPL = cargarMapaOPL(s);
  const pendProp = contarJuegosCompletosPorClave(
    s.despachosCavas || [],
    COLS_DESPACHO_CAVA,
    (fila) => String(fila[4] ?? '').trim().toUpperCase(),
    turno
  );

  const porOPL = {};
  const ensureOpl = (opl) => {
    if (!porOPL[opl]) porOPL[opl] = { total: 0, despachados: 0, pendientes: 0 };
  };

  (s.oplConfig || []).forEach((r) => {
    const prop = String(r.propietario || '').trim().toUpperCase();
    const totalCfg = Number(r.total || 0);
    if (totalCfg <= 0) return;
    const opl = String(r.opl || '').trim() || mapaOPL[prop] || OPL_DEFAULT;
    ensureOpl(opl);
    porOPL[opl].total += totalCfg;
  });

  Object.keys(pendProp).forEach((prop) => {
    const pend = pendProp[prop];
    if (!pend) return;
    const opl = mapaOPL[prop] || OPL_DEFAULT;
    ensureOpl(opl);
    porOPL[opl].pendientes += pend;
  });

  const sinBaseline = !Object.values(porOPL).some((d) => d.total > 0);

  const todosOPL = [];
  const progreso = [];
  Object.keys(porOPL)
    .sort()
    .forEach((opl) => {
      const d = porOPL[opl];
      if (sinBaseline && d.pendientes > 0) {
        d.total = d.pendientes;
      } else if (d.total < d.pendientes) {
        d.total = d.pendientes;
      }
      d.despachados = Math.max(0, d.total - d.pendientes);
      const pct = d.total > 0 ? Math.round((d.despachados / d.total) * 100) : 0;
      if (d.total <= 0 && d.pendientes <= 0) return;
      const item = {
        opl,
        total: d.total,
        despachados: d.despachados,
        pendientes: d.pendientes,
        progreso: pct,
        fecha,
      };
      todosOPL.push(item);
      if (pct < 100) progreso.push(item);
    });
  progreso.sort((a, b) => b.pendientes - a.pendientes || a.opl.localeCompare(b.opl));
  return {
    todosOPL,
    progreso,
    operacionFinalizada: todosOPL.length > 0 && progreso.length === 0,
    totalJuegos: todosOPL.reduce((sum, p) => sum + p.total, 0),
    totalDespachados: todosOPL.reduce((sum, p) => sum + p.despachados, 0),
    totalPendientes: todosOPL.reduce((sum, p) => sum + p.pendientes, 0),
  };
}

/**
 * Igual que calcularProgresoOPL pero sin guardar ni historizar (vista previa / consulta por fecha).
 */
function computeProgresoOPLPreview(s, totalJuegosParam, opts = {}) {
  const consultaSirt = Boolean(opts.consultaSirt);
  const fecha = fmtNow();
  const rd = s.resumenDespachos;
  const turno = String(rd.turno || '').trim();

  if (totalJuegosParam !== undefined && Number(totalJuegosParam) === 0) {
    if (consultaSirt) {
      const hayTotales = s.oplConfig?.some((r) => Number(r.total || 0) > 0);
      return {
        success: true,
        turno: turno || detectarTurnoPorDia(),
        progreso: [],
        operacionFinalizada: false,
        fecha,
        totalJuegos: 0,
        message: hayTotales
          ? 'Sin despachos del turno aún para esta fecha (consulta en vivo).'
          : 'Sin despachos del turno. Procese Decomisos y Despachos para activar OPL.',
      };
    }
    const porOPL0 = {};
    s.oplConfig.forEach((r) => {
      const opl = String(r.opl || '').trim() || OPL_DEFAULT;
      const total = Number(r.total || 0);
      if (total > 0) porOPL0[opl] = (porOPL0[opl] || 0) + total;
    });
    const todosOPL = Object.keys(porOPL0).map((opl) => ({
      opl,
      total: porOPL0[opl],
      despachados: porOPL0[opl],
      pendientes: 0,
      progreso: 100,
      fecha,
    }));
    return {
      success: true,
      turno: '',
      progreso: [],
      operacionFinalizada: true,
      fecha,
      totalJuegos: 0,
      todosOPL,
    };
  }

  if (!turno) return { success: false, message: 'Sin turno en despachos para esta fecha.', progreso: [] };

  const desdeDesp = construirProgresoOplDesdeDespachos(s, turno, fecha);
  if (desdeDesp.todosOPL.length > 0) {
    let operacionFinalizada = desdeDesp.operacionFinalizada;
    const totalJuegosRD = Number(rd.totalJuegos || 0);
    if (!consultaSirt && totalJuegosRD === 0 && desdeDesp.todosOPL.length > 0) {
      desdeDesp.todosOPL.forEach((p) => {
        p.despachados = p.total;
        p.pendientes = 0;
        p.progreso = 100;
      });
      operacionFinalizada = true;
    }
    return {
      success: true,
      turno,
      progreso: operacionFinalizada ? [] : desdeDesp.progreso,
      operacionFinalizada,
      fecha,
      totalJuegos: desdeDesp.totalJuegos,
      todosOPL: desdeDesp.todosOPL,
    };
  }

  const hayTotales = s.oplConfig.some((r) => Number(r.total || 0) > 0);
  if (!hayTotales) {
    return { success: false, message: 'Sin juegos programados para OPL en esta fecha.', progreso: [] };
  }

  return { success: false, message: 'Sin despachos del turno para calcular OPL.', progreso: [] };
}

/** Carga vw_decomisos (animales) para cruce LIKE en piezas en cava programadas. */
async function sincronizarDecomisosVwEnSesion(s, filtro) {
  const pack = await fetchDecomisosAnimalesVw(filtro);
  s.decomisosVwFilas = pack.rows;
  s.decomisoVwStats = {
    fuente: 'vw_decomisos',
    animalesUnicos: pack.animalesUnicos,
    desde: pack.desde,
    hasta: pack.hasta,
    lookbackDias: pack.lookbackDias,
  };
  return construirIndiceDecomisosVw(pack.rows);
}

/** Sustituye importar Excel: rellena estado desde SIRT */
export async function importarExcel(_base64, sheetName, range) {
  const s = await loadState();
  const filtro = normalizarRangoFechas(range);
  try {
    if (sheetName === 'Estado_Cavas') {
      s.estadoFromRow12 = await fetchEstadoCavasRows({ stockActual: true });
    } else if (sheetName === 'Reporte_Decomisos') {
      const pack = await fetchReporteDecomisosRows(filtro);
      s.reporteDecomisos = pack.rows;
      s.decomisoVinculoStats = pack.vinculo;
      await sincronizarDecomisosVwEnSesion(s, filtro);
    } else if (sheetName === 'Despachos_Cavas') {
      const despPack = await fetchDespachosParaConsulta(filtro);
      s.despachosCavas = despPack.desp;
      s.despachosAvisoFecha = despPack.avisoRango || '';
      if (s.estadoFromRow12?.length) {
        s.estadoFromRow12 = aplicarEstadoEnCavaNeto(s.estadoFromRow12, s.despachosCavas);
      }
      if (filtroSirtValido(filtro)) {
        const turnoDesp = resolverTurnoOperacion(filtro, s.despachosCavas);
        actualizarBaselineOplDesdeDespachosSync(s, turnoDesp);
      }
    } else {
      return { success: false, message: 'Hoja no soportada: ' + sheetName };
    }
    s.lastSyncRange = filtro;
    await saveState(s);
    const n =
      sheetName === 'Estado_Cavas'
        ? s.estadoFromRow12.length
        : sheetName === 'Reporte_Decomisos'
          ? s.reporteDecomisos.length
          : s.despachosCavas.length;
    return { success: true, rows: n };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function resumirDecomisos() {
  const s = await loadState();
  const nCava = s.estadoFromRow12?.length || 0;
  const nSal = s.despachosCavas?.length || 0;
  const nRep = s.reporteDecomisos?.length || 0;
  if (!nSal || !nRep) {
    return {
      success: false,
      message:
        'No hay datos para cruzar: Salidas programadas ' +
        nSal +
        ', Decomisos SAI ' +
        nRep +
        ' filas. Sincronice la fecha en SIRT.',
    };
  }
  const turno = resolverTurnoOperacion(s.lastSyncRange || {}, s.despachosCavas || []);
  const resultado = cruzarDecomisosConSalidas(s.despachosCavas, s.reporteDecomisos);
  const totalAnimalesConDecomiso = contarAnimalesDecomisoEnSalidasProgramadas(
    s.despachosCavas,
    s.reporteDecomisos,
    turno
  );
  const totalPiezasVinculadas = resultado.length;
  const ahora = new Date();
  s.resumenRows = [
    ['ID Producto', 'Destino', 'Producto/Subproducto', 'Fecha Procesamiento'],
    ...resultado.map((r) => [...r, ahora]),
  ];
  s.resumenFechaProc = ahora.toISOString();
  s.resumenDecomisoMeta = {
    totalAnimalesConDecomiso,
    totalPiezasVinculadas,
    turno,
  };
  if (s.estadoFromRow12?.length) actualizarCantidadesInicialesOPLSync(s);
  await saveState(s);
  const destinos = new Set(resultado.map((r) => r[1]).filter(Boolean));
  const sinCruce = resultado.length === 0 && nSal > 0 && nRep > 0;
  let muestraIdsSalidas = [];
  let muestraIdsReporte = [];
  if (sinCruce) {
    const seenE = new Set();
    for (let i = 0; i < s.despachosCavas.length && muestraIdsSalidas.length < 10; i++) {
      const id = filaSalidaCavaIdDestino(s.despachosCavas[i]).id;
      if (!id || seenE.has(id)) continue;
      seenE.add(id);
      muestraIdsSalidas.push(id);
    }
    const seenR = new Set();
    for (let i = 0; i < s.reporteDecomisos.length && muestraIdsReporte.length < 10; i++) {
      const id = String(s.reporteDecomisos[i][0] ?? '').trim();
      if (!id || seenR.has(id)) continue;
      seenR.add(id);
      muestraIdsReporte.push(id);
    }
  }
  const idxCava = construirIndiceEnCava(s.estadoFromRow12 || []);
  return {
    success: true,
    totalProductos: totalPiezasVinculadas,
    totalPiezasVinculadas,
    totalAnimalesConDecomiso,
    totalDestinos: destinos.size,
    turnoOperacion: turno,
    fechaProcesamiento: fmtNow(),
    resultados: resultado.map((r) => ({ id: r[0], destino: r[1], producto: r[2] })),
    filasEnCava: idxCava.basesEnCava.size,
    filasSalidasCruce: nSal,
    filasSalidasEnCava: nSal,
    filasReporteCruce: nRep,
    filasEstadoCruce: nCava,
    sinCoincidenciasCruce: sinCruce,
    muestraIdsSalidas: sinCruce ? muestraIdsSalidas : undefined,
    muestraIdsEstado: sinCruce ? muestraIdsSalidas : undefined,
    muestraIdsReporte: sinCruce ? muestraIdsReporte : undefined,
    decomisoVinculoStats: s.decomisoVinculoStats || undefined,
  };
}

function fmtNow() {
  return fmtNowFromDate(new Date());
}

function fmtNowFromDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function actualizarCantidadesInicialesOPLSync(s) {
  const conteo = contarJuegosCompletosPorClave(
    s.estadoFromRow12,
    { id: 0, tipo: 1 },
    (fila) => String(fila[3] ?? '').trim().toUpperCase()
  );
  s.oplConfig.forEach((r) => {
    r.total = 0;
  });
  const propToRow = {};
  s.oplConfig.forEach((r, i) => {
    propToRow[String(r.propietario).trim().toUpperCase()] = i;
  });
  Object.keys(conteo).forEach((propUpper) => {
    const total = conteo[propUpper];
    const idx = propToRow[propUpper];
    if (idx !== undefined) s.oplConfig[idx].total = total;
    else {
      const mapa = cargarMapaOPL(s);
      s.oplConfig.push({
        propietario: propUpper,
        opl: mapa[propUpper] || OPL_DEFAULT,
        total,
      });
    }
  });
}

export async function getResumenDecomisos() {
  const s = await loadState();
  const data = s.resumenRows || [];
  const meta = s.resumenDecomisoMeta || {};
  if (data.length <= 1) {
    return {
      success: true,
      totalProductos: 0,
      totalPiezasVinculadas: 0,
      totalAnimalesConDecomiso: Number(meta.totalAnimalesConDecomiso || 0),
      totalDestinos: 0,
      fechaProcesamiento: 'Sin datos',
      turnoOperacion: meta.turno || '',
      resultados: [],
    };
  }
  const filas = data.slice(1).filter((r) => r[0] && r[1] && r[2]);
  let fechaFormatted = 'Sin datos';
  if (filas.length && filas[0][3]) {
    const fObj = filas[0][3] instanceof Date ? filas[0][3] : new Date(filas[0][3]);
    if (!Number.isNaN(fObj.getTime())) fechaFormatted = fmtNowFromDate(fObj);
  }
  const totalPiezasVinculadas =
    Number(meta.totalPiezasVinculadas) > 0 ? Number(meta.totalPiezasVinculadas) : filas.length;
  const totalAnimalesConDecomiso =
    Number(meta.totalAnimalesConDecomiso) > 0
      ? Number(meta.totalAnimalesConDecomiso)
      : new Set(filas.map((r) => codigoBase(r[0])).filter(Boolean)).size;
  return {
    success: true,
    totalProductos: totalPiezasVinculadas,
    totalPiezasVinculadas,
    totalAnimalesConDecomiso,
    totalDestinos: new Set(filas.map((r) => r[1])).size,
    fechaProcesamiento: fechaFormatted,
    turnoOperacion: meta.turno || '',
    resultados: filas.map((r) => ({ id: r[0], destino: r[1], producto: r[2] })),
  };
}

export function contarJuegosVisceralesSync(s) {
  if (!s.estadoFromRow12.length) return { success: true, total: 0 };
  return { success: true, total: totalJuegosCompletos(s.estadoFromRow12, { id: 0, tipo: 1 }) };
}

export function contarCrudasSync(s) {
  let total = 0;
  const codigosUnicos = {};
  s.estadoFromRow12.forEach((fila) => {
    const codigo = String(fila[0] ?? '').trim();
    const desc = String(fila[1] ?? '').trim();
    const colO = fila[13];
    if (!codigo) return;
    if (desc !== 'Visceras Blancas') return;
    if (!esCruda(colO)) return;
    const base = codigoBase(codigo);
    if (!base || codigosUnicos[base]) return;
    codigosUnicos[base] = true;
    total++;
  });
  return { success: true, total };
}

/** VB crudas en animales programados a despachar hoy (turno LxM, etc.). */
export function contarCrudasProgramadasSync(s, turno = '') {
  const estadoNeto = s.estadoFromRow12 || [];
  const { crudaBases } = construirIndiceEnCava(estadoNeto);
  const codigosUnicos = {};
  (s.despachosCavas || []).forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const tipo = String(fila[7] ?? '').trim();
    const puesto = String(fila[9] ?? '').trim() || String(fila[8] ?? '').trim();
    if (tipo !== 'Visceras Blancas' || !id || !puesto) return;
    if (turno && !puesto.includes(turno)) return;
    const base = codigoBase(id);
    if (!base || !crudaBases.has(base) || codigosUnicos[base]) return;
    codigosUnicos[base] = true;
  });
  return { success: true, total: Object.keys(codigosUnicos).length };
}

/** Identificador de versión del motor (comprobar en /api/dashboard que el servidor desplegó el build nuevo). */
export const GESTOR_BUILD = 'opl-progreso-cava-v1';

function isoToDdMmYyyy(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || '');
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Filas de puesto para tablero / operación en vivo (sin agrupar por zona comercial). */
function mapearOperacionPuestos(resultado) {
  return (resultado || [])
    .filter((r) => Number(r.Juegos || 0) > 0)
    .map((r) => {
      const po = parsePuestoOperacion(r.puesto);
      return {
        puesto: String(r.puesto || ''),
        etiqueta: String(r.etiquetaPuesto || po.etiqueta),
        zona: String(r.zonaPuesto || po.zona),
        ruta: String(r.rutaPuesto || po.ruta),
        juegos: Number(r.Juegos || 0),
        opl: String(r.opl || ''),
        incompleto: Boolean(r.incompleto),
        animalesDecomiso: Number(r.animalesDecomiso || 0),
      };
    })
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}

export async function getDashboardData(range) {
  const filtro = normalizarRangoFechas(range || {});
  if (filtroSirtValido(filtro)) {
    try {
      const persisted = await loadState();
      const [estadoBruto, reportePack, despPack, vwPack] = await Promise.all([
        fetchEstadoCavasRows({ stockActual: true }),
        fetchReporteDecomisosRows(filtro),
        fetchDespachosParaConsulta(filtro),
        fetchDecomisosAnimalesVw(filtro),
      ]);
      const indiceVw = construirIndiceDecomisosVw(vwPack.rows);
      const desp = despPack.desp;
      const estado = aplicarEstadoEnCavaNeto(estadoBruto, desp);
      const reporte = reportePack.rows;
      const decomisoVinculoStats = reportePack.vinculo;
      const baseOpl =
        persisted.oplConfig && persisted.oplConfig.length
          ? JSON.parse(JSON.stringify(persisted.oplConfig))
          : defaultState().oplConfig;
      const sWork = {
        estadoFromRow12: estado,
        reporteDecomisos: reporte,
        decomisoVinculoStats,
        decomisosVwFilas: vwPack.rows,
        decomisoVwStats: {
          fuente: 'vw_decomisos',
          animalesUnicos: vwPack.animalesUnicos,
          desde: vwPack.desde,
          hasta: vwPack.hasta,
        },
        despachosCavas: desp,
        oplConfig: baseOpl,
        resumenDespachos: {
          turno: '',
          fechaStr: '',
          totalJuegos: 0,
          resultado: [],
          historicoGuardadoFlag: '',
        },
        resumenRows: [],
        oplProgreso: [],
      };
      actualizarCantidadesInicialesOPLSync(sWork);
      const fechaIso = filtro.from;
      const turnoOp = resolverTurnoOperacion(filtro, desp);
      const rd = construirResumenDespachosDesdeFilas(desp, turnoOp, reporte, estado, cargarMapaOPL(sWork), {
        indiceVw,
      });
      rd.fechaStr = `${isoToDdMmYyyy(fechaIso)} · turno ${turnoOp} (consulta SIRT)`;
      sWork.resumenDespachos = rd;
      sWork.lastSyncRange = filtro;
      actualizarBaselineOplDesdeDespachosSync(sWork, turnoOp);
      const preview = computeProgresoOPLPreview(sWork, rd.totalJuegos, { consultaSirt: true });

      const resSalidas = contarJuegosVisceralesSync(sWork);
      const juegosStockCava = resSalidas.total || 0;
      const filasEnCava = estado.length;
      const totalJuegosDespachar = Number(rd.totalJuegos || 0);
      const juegosEnCava = totalJuegosDespachar > 0 ? totalJuegosDespachar : juegosStockCava;
      const filasSalidasDia = desp.length;
      const turnoDespacho = String(rd.turno || '');
      const ultimaActDespachos = rd.fechaStr || '';
      let juegosTotalesOperacion = 0;
      let despachados = 0;
      let progreso = 0;
      let progresoMensaje = '';
      const rezagoDias = Number(process.env.SIRT_PROGRAMACION_REZAGO_DAYS || 21);
      const modoProg = despachosFuenteProgramadoTurno();
      if (filasSalidasDia > 0 && totalJuegosDespachar > 0) {
        juegosTotalesOperacion = totalJuegosDespachar;
        const oplLive = construirProgresoOplDesdeDespachos(sWork, turnoOp, fmtNow());
        despachados = oplLive.totalDespachados || 0;
        progreso =
          juegosTotalesOperacion > 0
            ? Math.min(100, Math.round((despachados / juegosTotalesOperacion) * 100))
            : 0;
        progresoMensaje =
          despachados +
          ' despachados · ' +
          (oplLive.totalPendientes || 0) +
          ' pendientes · ' +
          totalJuegosDespachar +
          ' juegos turno · ' +
          turnoOp +
          (modoProg
            ? ' (ISODOW del ' +
              isoToDdMmYyyy(fechaIso) +
              ', rezago ' +
              rezagoDias +
              ' d)'
            : ' el ' + isoToDdMmYyyy(fechaIso)) +
          ' · ' +
          filasSalidasDia +
          ' piezas · ' +
          juegosStockCava +
          ' juegos stock cava';
      } else if (filasSalidasDia > 0 && totalJuegosDespachar === 0) {
        progresoMensaje =
          filasSalidasDia +
          ' piezas programadas el ' +
          isoToDdMmYyyy(fechaIso) +
          ' · turno ' +
          turnoOp +
          ' · 0 juegos completos (revise filtro turno/puesto)' +
          ' · ' +
          juegosStockCava +
          ' en stock cava';
      } else {
        progresoMensaje =
          'Sin programación a despachar el ' +
          isoToDdMmYyyy(fechaIso) +
          ' · turno ' +
          turnoOp +
          (despPack.avisoRango ? ' · ' + despPack.avisoRango : '') +
          ' · ' +
          juegosStockCava +
          ' juegos en stock cava';
      }
      const cr = contarCrudasProgramadasSync(sWork, turnoOp);
      const totalDecomisos = Number(rd.totalConDecomiso || 0);
      const totalDecomisosEnRango =
        Number(decomisoVinculoStats?.decomisosUnicos) ||
        Number(decomisoVinculoStats?.filasEnRango) ||
        reporte.length;

      const progresoOPL = preview.success
        ? preview.operacionFinalizada
          ? preview.todosOPL || []
          : preview.progreso || []
        : [];

      return {
        success: true,
        juegosEnCava,
        juegosStockCava,
        totalSalidas: juegosEnCava,
        totalDecomisos,
        totalDecomisosEnRango,
        filasEnCava,
        totalSubproductosEnCava: filasEnCava,
        totalDecomisosVinculadosCava: totalDecomisos,
        totalDecomisosPiezas: contarCruceDecomisosSync(estado, reporte, desp),
        totalDecomisosSinVinculo: Math.max(0, totalDecomisosEnRango - totalDecomisos),
        totalCrudas: cr.total,
        totalJuegosDespachar,
        despachados,
        juegosTotalesOperacion,
        progresoMensaje,
        turnoDespacho,
        ultimaActDespachos,
        progreso,
        meta: juegosEnCava,
        consultaSIRT: true,
        fechaConsulta: fechaIso,
        turnoOperacion: turnoOp,
        avisoDespachosFecha: despPack.avisoRango || '',
        filasEstadoCavas: estado.length,
        filasReporteDecomisos: totalDecomisosEnRango,
        filasReporteDecomisosRaw: reporte.length,
        filasDespachosCavas: desp.length,
        gestorBuild: GESTOR_BUILD,
        despachosFuente: String(process.env.SIRT_DESPACHOS_FUENTE || 'programado'),
        decomisoVinculoStats,
        progresoOPL,
        todosOPL: preview.todosOPL || [],
        operacionOPLFinalizada: Boolean(preview.operacionFinalizada),
        oplPreviewMessage: String(preview.message || ''),
        oplPreviewFecha: preview.fecha || '',
        operacionPuestos: mapearOperacionPuestos(rd.resultado),
        totalPuestosOperacion: (rd.resultado || []).length,
        operacionActualizada: fmtNow(),
      };
    } catch (e) {
      return {
        success: false,
        message: e.message || String(e),
      };
    }
  }

  const s = await loadState();
  const resSalidas = contarJuegosVisceralesSync(s);
  const totalSalidas = resSalidas.total || 0;
  const desp = getDashboardDataDespachosSync(s);
  const rd = s.resumenDespachos || {};
  const turnoDespacho = String(rd.turno || desp.turnoDespacho || '').trim();
  const totalJuegosDespachar = Number(rd.totalJuegos || desp.totalJuegosDespachar || 0);
  const metaDec = s.resumenDecomisoMeta || {};
  const totalDecomisos =
    rd.totalConDecomiso != null && rd.totalConDecomiso !== ''
      ? Number(rd.totalConDecomiso)
      : Number(metaDec.totalAnimalesConDecomiso) > 0
        ? Number(metaDec.totalAnimalesConDecomiso)
        : 0;
  const totalDecomisosPiezas =
    Number(metaDec.totalPiezasVinculadas) > 0
      ? Number(metaDec.totalPiezasVinculadas)
      : Math.max(0, (s.resumenRows?.length || 0) - 1);
  const ultimaActDespachos = desp.ultimaActDespachos || rd.fechaStr || '';
  const juegosTotalesOperacion = Math.max(totalSalidas, totalJuegosDespachar);
  const despachados = Math.max(0, juegosTotalesOperacion - totalJuegosDespachar);
  const progreso =
    juegosTotalesOperacion > 0
      ? Math.min(100, Math.round((despachados / juegosTotalesOperacion) * 100))
      : 0;
  const cr =
    turnoDespacho && s.despachosCavas?.length
      ? contarCrudasProgramadasSync(s, turnoDespacho)
      : contarCrudasSync(s);
  const juegosEnCava = totalJuegosDespachar > 0 ? totalJuegosDespachar : totalSalidas;
  return {
    success: true,
    juegosEnCava,
    totalSalidas: juegosEnCava,
    totalDecomisos,
    totalDecomisosVinculadosCava: totalDecomisos,
    totalDecomisosPiezas,
    totalCrudas: cr.total,
    totalJuegosDespachar,
    despachados,
    juegosTotalesOperacion,
    turnoDespacho,
    ultimaActDespachos,
    progreso,
    meta: totalSalidas,
    consultaSIRT: false,
    operacionPuestos: mapearOperacionPuestos(rd.resultado || []),
    totalPuestosOperacion: (rd.resultado || []).length,
    operacionActualizada: rd.fechaStr || fmtNow(),
  };
}

function getDashboardDataDespachosSync(s) {
  const rd = s.resumenDespachos;
  if (!rd || !rd.fechaStr) {
    return { totalJuegosDespachar: 0, turnoDespacho: '', ultimaActDespachos: '' };
  }
  return {
    totalJuegosDespachar: Number(rd.totalJuegos || 0),
    turnoDespacho: String(rd.turno || ''),
    ultimaActDespachos: String(rd.fechaStr || ''),
  };
}

export async function procesarDespachos(turnoForzado) {
  const s = await loadState();
  if (!s.estadoFromRow12?.length) {
    return { success: false, message: 'No hay Estado_Cavas (en cava). Sincronice desde SIRT.' };
  }
  if (!s.despachosCavas.length) {
    return { success: false, message: 'No hay salidas de cava para la fecha. Sincronice desde SIRT.' };
  }
  const turno =
    turnoForzado && String(turnoForzado).length > 0
      ? String(turnoForzado)
      : resolverTurnoOperacion(s.lastSyncRange || {}, s.despachosCavas);
  const indiceVw =
    s.decomisosVwFilas?.length > 0
      ? construirIndiceDecomisosVw(s.decomisosVwFilas)
      : await sincronizarDecomisosVwEnSesion(s, s.lastSyncRange || {});
  const rd = construirResumenDespachosDesdeFilas(
    s.despachosCavas,
    turno,
    s.reporteDecomisos || [],
    s.estadoFromRow12 || [],
    cargarMapaOPL(s),
    { indiceVw }
  );
  if (!rd.resultado?.length) {
    return {
      success: false,
      message:
        'No hay salidas del turno que coincidan con productos en cava (' +
        (rd.filasSalidasUsadas || 0) +
        ' de ' +
        (rd.filasSalidasTotales || 0) +
        ' salidas; ' +
        (rd.filasEnCava || 0) +
        ' en cava).',
      ...rd,
    };
  }
  s.resumenDespachos = {
    ...rd,
    fechaStr: fmtNow(),
  };
  if (!s.fechaInicioOperacion) s.fechaInicioOperacion = new Date().toISOString();
  actualizarBaselineOplDesdeDespachosSync(s, turno);
  await saveState(s);
  try {
    await calcularProgresoOPL(rd.totalJuegos);
  } catch (_) {}
  return {
    success: true,
    turno: rd.turno,
    totalPuestos: rd.resultado.length,
    totalJuegos: rd.totalJuegos,
    totalConDecomiso: rd.totalConDecomiso || 0,
    totalConDecomisoVw: rd.totalConDecomisoVw || 0,
    totalConDecomisoSai: rd.totalConDecomisoSai || 0,
    filasEnCava: rd.filasEnCava,
    filasSalidasUsadas: rd.filasSalidasUsadas,
    salidasOmitidasSinCava: rd.salidasOmitidasSinCava,
    tipos: TIPOS_PRODUCTO,
    resultado: rd.resultado,
  };
}

export async function getResumenDespachoActual() {
  const s = await loadState();
  const rd = s.resumenDespachos;
  if (!rd || !rd.turno || !rd.resultado?.length) {
    return { success: true, hayDatos: false };
  }
  return {
    success: true,
    hayDatos: true,
    turno: rd.turno,
    fechaUltima: rd.fechaStr,
    totalJuegos: rd.totalJuegos,
    totalPuestos: rd.resultado.length,
    tipos: TIPOS_PRODUCTO,
    resultado: rd.resultado,
  };
}

export async function getDetallesPuesto(puesto) {
  const s = await loadState();
  const turno = String(s.resumenDespachos?.turno || '').trim();
  const mapaDec = construirMapaDecomisosPorAnimal(s.reporteDecomisos || []);
  const indiceVw = construirIndiceDecomisosVw(s.decomisosVwFilas || []);
  const estadoNeto = aplicarEstadoEnCavaNeto(s.estadoFromRow12 || [], s.despachosCavas || []);
  const { basesEnCava, crudaBases } = construirIndiceEnCava(estadoNeto);
  const clavePuesto = claveAgrupacionPuesto(puesto);
  const filas = [];
  s.despachosCavas.forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const prop = String(fila[4] ?? '').trim();
    const tipo = String(fila[7] ?? '').trim();
    const pFila = String(fila[9] ?? '').trim() || String(fila[8] ?? '').trim();
    if (!id || claveAgrupacionPuesto(pFila) !== clavePuesto) return;
    if (turno && pFila && !pFila.includes(turno)) return;
    const base = codigoBase(id);
    const dec = decomisoInfoUnificado(mapaDec, indiceVw, id);
    filas.push({
      id,
      codigoBase: base,
      propietario: prop,
      tipo,
      enCava: Boolean(base && basesEnCava.has(base)),
      cruda: tipo === 'Visceras Blancas' && Boolean(base && crudaBases.has(base)),
      decomiso: Boolean(dec),
      productoDecomiso: dec?.productos?.join(', ') || '',
      fuenteDecomiso: (dec?.fuentes || []).join(' + ') || '',
    });
  });
  filas.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id));
  return { success: true, puesto, turno, filas };
}

export async function guardarFechaInicioOperacion() {
  const s = await loadState();
  if (!s.fechaInicioOperacion) {
    s.fechaInicioOperacion = new Date().toISOString();
    await saveState(s);
  }
  return { success: true, fechaInicioOperacion: s.fechaInicioOperacion };
}

export async function limpiarDespachos() {
  const s = await loadState();
  s.despachosCavas = [];
  s.resumenDespachos = { turno: '', fechaStr: '', totalJuegos: 0, resultado: [], historicoGuardadoFlag: '' };
  s.oplConfig.forEach((r) => {
    r.total = 0;
  });
  s.oplBaselineFecha = '';
  s.oplProgreso = [];
  s.fechaInicioOperacion = null;
  await saveState(s);
  return { success: true };
}

export async function limpiarResumen() {
  const s = await loadState();
  s.estadoFromRow12 = [];
  s.reporteDecomisos = [];
  s.decomisoVinculoStats = null;
  s.resumenRows = [];
  s.resumenDecomisoMeta = null;
  s.resumenFechaProc = null;
  s.oplConfig.forEach((r) => {
    r.total = 0;
  });
  s.oplProgreso = [];
  await saveState(s);
  return { success: true };
}

export async function calcularProgresoOPL(totalJuegosParam) {
  const s = await loadState();
  const fecha = fmtNow();
  const rd = s.resumenDespachos;
  const turno = String(rd.turno || '').trim();

  if (totalJuegosParam !== undefined && Number(totalJuegosParam) === 0) {
    const porOPL0 = {};
    s.oplConfig.forEach((r) => {
      const opl = String(r.opl || '').trim() || OPL_DEFAULT;
      const total = Number(r.total || 0);
      if (total > 0) porOPL0[opl] = (porOPL0[opl] || 0) + total;
    });
    s.oplProgreso = Object.keys(porOPL0).map((opl) => ({
      opl,
      total: porOPL0[opl],
      despachados: porOPL0[opl],
      pendientes: 0,
      progreso: 100,
      fecha,
    }));
    if (turno && rd.historicoGuardadoFlag !== '1') {
      await guardarHistoricoOPLInternal(s, ESTADO_COMPLETO);
      rd.historicoGuardadoFlag = '1';
    }
    await saveState(s);
    return { success: true, turno: turno || '', progreso: [], operacionFinalizada: true, fecha, totalJuegos: 0 };
  }

  if (!turno) return { success: false, message: 'Sin turno activo.' };

  actualizarBaselineOplDesdeDespachosSync(s, turno);
  const desdeDesp = construirProgresoOplDesdeDespachos(s, turno, fecha);
  let todosOPL = desdeDesp.todosOPL;
  let progreso = desdeDesp.progreso;
  let operacionFinalizada = desdeDesp.operacionFinalizada;

  if (!todosOPL.length) {
    return { success: false, message: 'Sin juegos en cava para este turno. Sincronice despachos desde SIRT.' };
  }

  if (operacionFinalizada && rd.historicoGuardadoFlag !== '1') {
    await guardarHistoricoOPLInternal(s, ESTADO_COMPLETO);
    rd.historicoGuardadoFlag = '1';
  }

  s.oplProgreso = todosOPL.map((p) => ({ ...p, fecha }));
  const totalJuegosRD = Number(rd.totalJuegos || 0);
  if (totalJuegosRD === 0 && todosOPL.length > 0) {
    todosOPL.forEach((p) => {
      p.despachados = p.total;
      p.pendientes = 0;
      p.progreso = 100;
    });
    s.oplProgreso = todosOPL.map((p) => ({ ...p, fecha }));
    operacionFinalizada = true;
  }
  await saveState(s);
  return {
    success: true,
    turno,
    progreso: operacionFinalizada ? [] : progreso,
    todosOPL,
    operacionFinalizada,
    fecha,
    totalJuegos: todosOPL.reduce((sum, p) => sum + p.total, 0),
    totalDespachados: todosOPL.reduce((sum, p) => sum + p.despachados, 0),
  };
}

async function guardarHistoricoOPLInternal(s, estado) {
  const turno = String(s.resumenDespachos.turno || '').trim();
  if (!turno) return { success: false, message: 'Sin turno activo.' };
  const fechaInicio = s.fechaInicioOperacion ? new Date(s.fechaInicioOperacion) : new Date();
  const fechaInicioStr = `${String(fechaInicio.getDate()).padStart(2, '0')}/${String(fechaInicio.getMonth() + 1).padStart(2, '0')}/${fechaInicio.getFullYear()}`;
  const fechaHoraStr = fmtNow();
  if (!s.oplProgreso.length) return { success: true, insertados: 0, turno, estado };
  const nuevas = [];
  s.oplProgreso.forEach((r) => {
    const opl = String(r.opl || '').trim();
    const total = Number(r.total || 0);
    const despachados = Number(r.despachados ?? 0);
    const pendientes = Number(r.pendientes ?? 0);
    const progreso = Number(r.progreso ?? 0);
    if (!opl || total <= 0) return;
    const dup = s.historicoOpl.some(
      (h) => h.fechaInicioStr === fechaInicioStr && h.turno === turno && h.opl === opl
    );
    if (dup) return;
    const estadoFila = progreso >= 100 || pendientes === 0 ? ESTADO_COMPLETO : estado;
    nuevas.push({
      fechaInicioStr,
      turno,
      opl,
      total,
      despachados,
      pendientes,
      progreso,
      estado: estadoFila,
      fechaHoraStr,
    });
  });
  s.historicoOpl.push(...nuevas);
  return { success: true, insertados: nuevas.length, turno, estado };
}

export async function getProgresoOPL() {
  const s = await loadState();
  if (!s.oplProgreso.length) {
    return { success: true, progreso: [], todosOPL: [], fecha: '' };
  }
  const progreso = [];
  const todosOPL = [];
  let ultimaFecha = '';
  s.oplProgreso.forEach((r) => {
    const opl = String(r.opl || '').trim();
    const total = Number(r.total || 0);
    const pct = Number(r.progreso || 0);
    if (!opl || total <= 0) return;
    const fStr = String(r.fecha || '');
    if (!ultimaFecha && fStr) ultimaFecha = fStr;
    const item = {
      opl,
      total,
      despachados: Number(r.despachados || 0),
      pendientes: Number(r.pendientes || 0),
      progreso: pct,
      fecha: fStr,
    };
    todosOPL.push(item);
    if (pct < 100) progreso.push(item);
  });
  const operacionFinalizada = todosOPL.length > 0 && progreso.length === 0;
  return { success: true, progreso, todosOPL, operacionFinalizada, fecha: ultimaFecha };
}

export async function getOplConfig() {
  const s = await loadState();
  const rows = s.oplConfig.map((r, i) => ({
    idx: i + 2,
    propietario: r.propietario,
    opl: r.opl,
    total: Number(r.total || 0),
  }));
  return { success: true, rows, oplDefault: OPL_DEFAULT };
}

export async function upsertOpl(propietario, opl) {
  const s = await loadState();
  const p = String(propietario ?? '').trim();
  const o = String(opl ?? '').trim();
  if (!p) return { success: false, message: 'Propietario vacío.' };
  const idx = s.oplConfig.findIndex((r) => String(r.propietario).trim().toUpperCase() === p.toUpperCase());
  if (idx >= 0) {
    s.oplConfig[idx].opl = o;
    await saveState(s);
    return { success: true, action: 'updated' };
  }
  s.oplConfig.push({ propietario: p.toUpperCase(), opl: o, total: 0 });
  await saveState(s);
  return { success: true, action: 'inserted' };
}

export async function eliminarOpl(rowIdx) {
  const s = await loadState();
  const i = Number(rowIdx) - 2;
  if (i < 0 || i >= s.oplConfig.length) return { success: false, message: 'Fila inválida.' };
  s.oplConfig.splice(i, 1);
  await saveState(s);
  return { success: true };
}

export async function getOplPorPropietario() {
  const s = await loadState();
  const turno = String(s.resumenDespachos.turno || '').trim();
  const mapa = cargarMapaOPL(s);
  let datos = [];
  const cols = { id: 0, tipo: 6, prop: 3, puesto: 8 };
  if (s.estadoFromRow12.length >= 1) {
    datos = s.estadoFromRow12.map((row) => row.slice(0, 9));
  } else {
    datos = s.despachosCavas.map((f) => [f[3], '', '', f[4], '', '', f[7], '', f[9]]);
  }
  const conteo = contarJuegosCompletosPorClave(
    datos,
    cols,
    (fila) => String(fila[cols.prop] ?? '').trim().toUpperCase(),
    turno
  );
  const opls = [...new Set(s.oplConfig.map((r) => r.opl).filter(Boolean))].sort();
  if (!opls.includes(OPL_DEFAULT)) opls.unshift(OPL_DEFAULT);
  const resultado = Object.keys(conteo)
    .sort()
    .map((prop) => ({
      propietario: prop,
      juegos: conteo[prop],
      opl: mapa[prop] || OPL_DEFAULT,
    }));
  return { success: true, resultado, opls };
}

export async function resetearTotalesOPL() {
  const s = await loadState();
  s.oplConfig.forEach((r) => {
    r.total = 0;
  });
  s.oplProgreso = [];
  await saveState(s);
  return { success: true };
}

export async function cerrarOperacion() {
  const s = await loadState();
  const hist = await guardarHistoricoOPLInternal(s, ESTADO_PENDIENTE);
  if (!hist.success) return { success: false, message: 'Error guardando histórico: ' + hist.message };
  s.despachosCavas = [];
  s.resumenDespachos = { turno: '', fechaStr: '', totalJuegos: 0, resultado: [], historicoGuardadoFlag: '' };
  s.oplConfig.forEach((r) => {
    r.total = 0;
  });
  s.oplProgreso = [];
  s.fechaInicioOperacion = null;
  await saveState(s);
  return { success: true, insertados: hist.insertados || 0, turno: hist.turno, estado: ESTADO_PENDIENTE };
}

export async function getPuestosCrudas() {
  const s = await loadState();
  const rd = s.resumenDespachos;
  const puestos = {};
  (rd?.resultado || []).forEach((r) => {
    if (r.tieneCruda && r.puesto) puestos[r.puesto] = true;
  });
  if (Object.keys(puestos).length) {
    return { success: true, puestos, total: Object.keys(puestos).length };
  }
  const { crudaBases } = construirIndiceEnCava(s.estadoFromRow12 || []);
  const turno = String(rd?.turno || '').trim();
  (s.despachosCavas || []).forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const tipo = String(fila[7] ?? '').trim();
    const puesto = String(fila[9] ?? '').trim() || String(fila[8] ?? '').trim();
    if (tipo !== 'Visceras Blancas' || !id || !puesto) return;
    if (turno && !puesto.includes(turno)) return;
    const base = codigoBase(id);
    if (base && crudaBases.has(base)) puestos[puesto] = true;
  });
  return { success: true, puestos, total: Object.keys(puestos).length };
}

export async function getCrudasDetalle() {
  const s = await loadState();
  const mapaOPL = cargarMapaOPL(s);
  const crudas = {};
  s.estadoFromRow12.forEach((fila) => {
    const codigo = String(fila[0] ?? '').trim();
    const desc = String(fila[1] ?? '').trim();
    const cliente = String(fila[3] ?? '').trim();
    const puesto = String(fila[8] ?? '').trim();
    const colO = fila[13];
    if (!codigo || desc !== 'Visceras Blancas') return;
    if (!esCruda(colO)) return;
    const base = codigoBase(codigo);
    const key = `${base}||${puesto}`;
    if (!crudas[key]) {
      crudas[key] = {
        codigo,
        base,
        puesto,
        cliente,
        opl: mapaOPL[cliente.toUpperCase()] || OPL_DEFAULT,
        cantidad: 0,
        observacion: String(colO ?? '')
          .split('\n')[0]
          .trim(),
      };
    }
    crudas[key].cantidad++;
  });
  const filas = Object.values(crudas).sort((a, b) => a.puesto.localeCompare(b.puesto));
  return { success: true, filas };
}

const PLAZAS_DEFAULT = [
  ['01028', 'CENTRO'],
  ['01803', 'ENTRADA A CAVA'],
  ['1203', 'CAMPO HERMOSO'],
  ['SP.', 'LAGOS'],
  ['A\\', 'VILLABEL'],
  ['1003', 'CENTRO'],
  ['E14', 'GIRON'],
  ['A9', 'GIRON'],
  ['E5', 'GIRON'],
  ['10150', 'PIEDECUESTA'],
  ['10308', 'PIEDECUESTA'],
  ['10320', 'PIEDECUESTA'],
  ['379P', 'PIEDECUESTA'],
  ['ANAP', 'PIEDECUESTA'],
  ['CRAX', 'PIEDECUESTA'],
  ['MRP3', 'PIEDECUESTA'],
  ['NESP', 'PIEDECUESTA'],
  ['PAME', 'PIEDECUESTA'],
  ['TOP', 'PIEDECUESTA'],
  ['YP', 'PIEDECUESTA'],
];

function asegurarPlazasMap(s) {
  if (!s.plazasMap || !Object.keys(s.plazasMap).length) {
    s.plazasMap = s.plazasMap || {};
    PLAZAS_DEFAULT.forEach(([p, pl]) => {
      s.plazasMap[String(p).trim()] = String(pl).trim().toUpperCase();
    });
  }
}

export async function getPlazas() {
  const s = await loadState();
  asegurarPlazasMap(s);
  const rows = Object.keys(s.plazasMap)
    .sort((a, b) => a.localeCompare(b))
    .map((puesto, i) => ({ idx: i + 2, puesto, plaza: String(s.plazasMap[puesto] || '').trim() }));
  return { success: true, rows };
}

export async function insertarPlazaPorZona(puesto, plaza) {
  const s = await loadState();
  asegurarPlazasMap(s);
  const p = String(puesto || '').trim();
  const z = String(plaza || '').trim().toUpperCase();
  if (!p || !z) return { success: false, message: 'Puesto y Plaza son requeridos' };
  const keyExistente = Object.keys(s.plazasMap).find((k) => k.toUpperCase() === p.toUpperCase());
  if (keyExistente) return { success: false, message: 'El puesto ya existe. Use modificar.' };
  s.plazasMap[p] = z;
  await saveState(s);
  return { success: true, message: `Plaza agregada correctamente a la zona: ${z}` };
}

export async function insertarPlaza(puesto, plaza) {
  return insertarPlazaPorZona(puesto, plaza);
}

export async function modificarPlaza(filaIdx, nuevoPuesto, nuevaPlaza) {
  const s = await loadState();
  asegurarPlazasMap(s);
  const entries = Object.keys(s.plazasMap).sort((a, b) => a.localeCompare(b));
  const i = Number(filaIdx) - 2;
  if (i < 0 || i >= entries.length) return { success: false, message: 'Indice invalido' };
  const antiguo = entries[i];
  const p = String(nuevoPuesto || '').trim();
  const z = String(nuevaPlaza || '').trim().toUpperCase();
  if (!p || !z) return { success: false, message: 'Puesto y Plaza son requeridos' };
  const colision = entries.find((k, idx) => idx !== i && k.toUpperCase() === p.toUpperCase());
  if (colision) return { success: false, message: 'Ya existe otro registro con ese puesto' };
  delete s.plazasMap[antiguo];
  s.plazasMap[p] = z;
  await saveState(s);
  return { success: true, message: 'Plaza modificada correctamente' };
}

export async function eliminarPlaza(filaIdx) {
  const s = await loadState();
  asegurarPlazasMap(s);
  const entries = Object.keys(s.plazasMap).sort((a, b) => a.localeCompare(b));
  const i = Number(filaIdx) - 2;
  if (i < 0 || i >= entries.length) return { success: false, message: 'Indice invalido' };
  delete s.plazasMap[entries[i]];
  await saveState(s);
  return { success: true, message: 'Plaza eliminada correctamente' };
}

/** Código de puesto (primer segmento de ruta SIRT), p. ej. 01028 → 1028 si es numérico. */
function codigoPuestoPlanilla(puestoFull) {
  const first = String(puestoFull || '').split('/')[0].trim();
  if (!first) return '';
  if (/^\d+$/.test(first)) {
    const n = parseInt(first, 10);
    return Number.isFinite(n) ? String(n) : first;
  }
  return first;
}

const ZONA_POR_SEGMENTO_RUTA = [
  ['SAN FRANCISCO', 'SAN FRANCISCO'],
  ['PROVENZA', 'PROVENZA'],
  ['CUMBRE', 'CUMBRE'],
  ['GIRON', 'GIRON'],
  ['GIRÓN', 'GIRON'],
  ['LAGOS', 'LAGOS'],
  ['FLORIDA', 'FLORIDA'],
  ['PIEDECUESTA', 'PIEDECUESTA'],
  ['BUCARAMANGA', 'CENTRO'],
  ['NORTE', 'NORTE'],
  ['CPA', 'CPA'],
  ['REAL DE MINAS', 'REAL DE MINAS'],
  ['LEBRIJA', 'LEBRIJA'],
  ['GIRON', 'GIRON'],
];

function inferirZonaDesdeRuta(puestoFull) {
  const u = String(puestoFull || '').toUpperCase();
  for (const [needle, zona] of ZONA_POR_SEGMENTO_RUTA) {
    if (u.includes(needle)) return zona;
  }
  const parts = String(puestoFull || '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const seg = parts[1].toUpperCase();
    for (const [needle, zona] of ZONA_POR_SEGMENTO_RUTA) {
      if (seg.includes(needle)) return zona;
    }
  }
  return '';
}

function resolverZonaPlanilla(puestoFull, mapaPlazas) {
  const codigo = codigoPuestoPlanilla(puestoFull);
  const claves = [codigo, String(puestoFull || '').split('/')[0].trim()].filter(Boolean);
  for (const k of claves) {
    if (mapaPlazas[k]) return mapaPlazas[k];
    const sinCeros = k.replace(/^0+/, '') || k;
    if (sinCeros !== k && mapaPlazas[sinCeros]) return mapaPlazas[sinCeros];
  }
  for (const k of Object.keys(mapaPlazas)) {
    const ku = k.toUpperCase();
    if (puestoFull.toUpperCase().startsWith(`${ku}/`) || puestoFull.toUpperCase().includes(`/${ku}/`)) {
      return mapaPlazas[k];
    }
  }
  return inferirZonaDesdeRuta(puestoFull) || 'ENTRADA A CAVA';
}

function construirMapaPuestoOpl(despachosCavas, turno, mapaOPL) {
  const mapa = {};
  (despachosCavas || []).forEach((fila) => {
    const puesto = String(fila[9] ?? '').trim() || String(fila[8] ?? '').trim();
    if (!puesto) return;
    if (turno && !puesto.includes(turno)) return;
    const prop = String(fila[4] ?? '').trim().toUpperCase();
    const opl = mapaOPL[prop] || OPL_DEFAULT;
    const clave = claveAgrupacionPuesto(puesto);
    if (clave) mapa[clave] = opl;
    const cod = codigoPuestoPlanilla(puesto);
    if (cod) mapa[cod] = opl;
  });
  return mapa;
}

/** Planilla desde resumen de despachos programados (misma base que módulo Despachos). */
function consolidarDesdeResumenDespachos(s) {
  const rd = s.resumenDespachos;
  const resultado = rd?.resultado || [];
  if (!resultado.length) return null;

  asegurarPlazasMap(s);
  const turno = String(rd.turno || '').trim();
  const fechaHoy = fmtDateOnly();
  const consolidado = [];
  let totalJuegos = 0;

  resultado.forEach((r) => {
    const puestoFull = String(r.puesto || '').trim();
    const juegos = Number(r.Juegos || 0);
    if (!puestoFull || juegos <= 0) return;
    const codigo =
      String(r.codigoPuesto || '').trim() || extraerPuesto(puestoFull) || codigoPuestoPlanilla(puestoFull);
    const opl = String(r.opl || '').trim() || OPL_DEFAULT;
    const plaza = resolverZonaPlanilla(puestoFull, s.plazasMap);
    totalJuegos += juegos;
    consolidado.push([
      codigo,
      'Visceras Rojas',
      '',
      puestoFull,
      codigo,
      plaza,
      opl,
      juegos,
      fechaHoy,
      turno,
    ]);
  });

  return { consolidado, totalJuegos, turno, fechaHoy };
}

export async function consolidarDatos() {
  const s = await loadState();
  const pack = consolidarDesdeResumenDespachos(s);
  if (pack) {
    s.consolidado = pack.consolidado;
    await saveState(s);
    return {
      success: true,
      procesados: pack.totalJuegos,
      totalJuegos: pack.totalJuegos,
      turno: pack.turno,
      faltantes: [],
      origen: 'despachos-programados',
    };
  }

  if (!s.estadoFromRow12.length) {
    await importarExcel(null, 'Estado_Cavas');
  }
  const s2 = await loadState();
  const pack2 = consolidarDesdeResumenDespachos(s2);
  if (pack2) {
    s2.consolidado = pack2.consolidado;
    await saveState(s2);
    return {
      success: true,
      procesados: pack2.totalJuegos,
      totalJuegos: pack2.totalJuegos,
      turno: pack2.turno,
      faltantes: [],
      origen: 'despachos-programados',
    };
  }

  return {
    success: false,
    message:
      'No hay despachos procesados para esta fecha. Use «Procesar Planilla» o procese el módulo Despachos primero.',
  };
}

/** Sincroniza SIRT + despachos + consolidación de planilla para la fecha operación. */
export async function prepararPlanillaDesdeSIRT(range = {}) {
  const filtro = normalizarRangoFechas(range || {});
  if (!filtroSirtValido(filtro)) {
    return { success: false, message: 'Indique una fecha válida (AAAA-MM-DD).' };
  }
  const s0 = await loadState();
  s0.lastSyncRange = filtro;
  await saveState(s0);
  const dec = await prepararModuloDecomisosDesdeSIRT(filtro);
  if (!dec.success) {
    return { success: false, message: dec.message || 'Error al cargar decomisos.' };
  }
  const desp = await prepararModuloDespachosDesdeSIRT(null, filtro);
  if (!desp?.success) {
    return { success: false, message: desp?.message || 'Error al procesar despachos.' };
  }
  const cons = await consolidarDatos();
  if (!cons.success) return cons;
  return {
    ...cons,
    fechaConsulta: filtro.from,
    turnoOperacion: desp.turno || cons.turno,
    totalPuestos: desp.totalPuestos,
  };
}

function fmtDateOnly() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function getListaOPLsParaPlanilla() {
  const s = await loadState();
  const set = {};
  if (s.consolidado?.length) {
    s.consolidado.forEach((row) => {
      const opl = String(row[6] ?? '').trim();
      if (opl) set[opl] = true;
    });
  }
  if (!Object.keys(set).length && s.despachosCavas?.length) {
    const turno = String(s.resumenDespachos?.turno || '').trim();
    const pack = construirProgresoOplDesdeDespachos(s, turno, fmtNow());
    pack.todosOPL.forEach((p) => {
      if (p.opl) set[p.opl] = true;
    });
  }
  return Object.keys(set).sort();
}

export async function generarPlanillaPuntos(opl) {
  const s = await loadState();
  if (!s.consolidado?.length) {
    const pack = consolidarDesdeResumenDespachos(s);
    if (pack) {
      s.consolidado = pack.consolidado;
      await saveState(s);
    }
  }
  if (!s.consolidado?.length) {
    return { success: false, message: "No hay datos. Ejecuta 'Procesar Planilla' para la fecha operación." };
  }
  const zonasMap = {};
  let totalOPL = 0;
  let totalGlobal = 0;
  let turno = '';
  let fechaPlanilla = fmtDateOnly();
  s.consolidado.forEach((fila) => {
    const oplReg = String(fila[6] ?? '').trim();
    const zona = String(fila[5] ?? 'ENTRADA A CAVA').trim();
    const puesto = String(fila[4] ?? '').trim();
    let cantidad = Number(fila[7] ?? 0);
    if (Number.isNaN(cantidad)) cantidad = 0;
    if (!turno && fila[9]) turno = String(fila[9]);
    if (fila[8]) fechaPlanilla = String(fila[8]);
    totalGlobal += cantidad;
    if (opl !== 'TODOS' && oplReg !== opl) return;
    totalOPL += cantidad;
    if (!zonasMap[zona]) zonasMap[zona] = { total: 0, puestos: {} };
    zonasMap[zona].total += cantidad;
    zonasMap[zona].puestos[puesto] = (zonasMap[zona].puestos[puesto] || 0) + cantidad;
  });
  const zonasArray = Object.keys(zonasMap)
    .map((zona) => {
      const puestosArray = Object.keys(zonasMap[zona].puestos)
        .map((p) => ({ puesto: p, cantidad: Math.round(zonasMap[zona].puestos[p] * 100) / 100 }))
        .sort((a, b) => a.puesto.localeCompare(b.puesto));
      return {
        nombre: zona,
        total: Math.round(zonasMap[zona].total * 100) / 100,
        puestos: puestosArray,
      };
    })
    .sort((a, b) => b.total - a.total);
  const pct = totalGlobal > 0 ? ((totalOPL / totalGlobal) * 100).toFixed(1) : '0.0';
  const puestosFlat = [];
  s.consolidado.forEach((fila) => {
    const oplReg = String(fila[6] ?? '').trim();
    if (opl !== 'TODOS' && oplReg !== opl) return;
    const puestoFull = String(fila[3] ?? fila[4] ?? '').trim();
    const cantidad = Number(fila[7] ?? 0);
    if (!puestoFull || cantidad <= 0) return;
    const po = parsePuestoOperacion(puestoFull);
    const zona = String(fila[5] ?? '').trim();
    puestosFlat.push({
      puesto: puestoFull,
      etiqueta: po.etiqueta,
      zona: po.zona || zona,
      cantidad: Math.round(cantidad * 100) / 100,
      opl: oplReg,
    });
  });
  puestosFlat.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
  return {
    success: true,
    opl,
    zonas: zonasArray,
    puestos: puestosFlat,
    totalOPL: Math.round(totalOPL * 100) / 100,
    totalGlobal: Math.round(totalGlobal * 100) / 100,
    porcentaje: pct,
    turno,
    fecha: fechaPlanilla,
    fechaConsulta: s.lastSyncRange?.from || null,
  };
}

/** Vista en vivo de puestos programados (sin persistir sesión). */
export async function getOperacionEnVivo(range) {
  const out = await consultarDespachosPreview(null, range);
  if (!out.success) return out;
  return {
    success: true,
    turno: out.turno,
    fechaConsulta: out.fechaConsulta,
    actualizado: fmtNow(),
    totalJuegos: out.totalJuegos,
    totalPuestos: out.totalPuestos,
    puestos: mapearOperacionPuestos(out.resultado),
    avisoRango: out.avisoRango || '',
  };
}

export async function getResumenTodosOPLs() {
  const s = await loadState();
  if (!s.consolidado?.length) {
    const pack = consolidarDesdeResumenDespachos(s);
    if (pack) {
      s.consolidado = pack.consolidado;
      await saveState(s);
    }
  }
  if (!s.consolidado?.length) {
    const turno = String(s.resumenDespachos?.turno || '').trim();
    if (s.despachosCavas?.length && turno) {
      const oplPack = construirProgresoOplDesdeDespachos(s, turno, fmtNow());
      const totalGeneral = oplPack.totalJuegos;
      const resumen = oplPack.todosOPL.map((p) => ({
        opl: p.opl,
        totalJuegos: p.total,
        porcentaje: totalGeneral > 0 ? ((p.total / totalGeneral) * 100).toFixed(1) : '0.0',
      }));
      return { success: true, resumen, totalGeneral };
    }
    return { success: true, resumen: [] };
  }
  const totalPorOPL = {};
  let totalGeneral = 0;
  s.consolidado.forEach((fila) => {
    const o = String(fila[6] ?? '').trim();
    const cantidad = Number(fila[7] || 0);
    if (o && cantidad > 0) {
      totalPorOPL[o] = (totalPorOPL[o] || 0) + cantidad;
      totalGeneral += cantidad;
    }
  });
  const resumen = Object.keys(totalPorOPL)
    .map((op) => ({
      opl: op,
      totalJuegos: Math.round(totalPorOPL[op] * 100) / 100,
      porcentaje: totalGeneral > 0 ? ((totalPorOPL[op] / totalGeneral) * 100).toFixed(1) : '0.0',
    }))
    .sort((a, b) => b.totalJuegos - a.totalJuegos);
  return { success: true, resumen, totalGeneral: Math.round(totalGeneral * 100) / 100 };
}

export async function generarHTMLPlanillaPDF(opl) {
  const datos = await generarPlanillaPuntos(opl);
  if (!datos.success) return { success: false, message: datos.message };
  let zonasHtml = '';
  datos.zonas.forEach((z) => {
    const filas = z.puestos
      .map((p) => {
        const cantStr = p.cantidad % 1 === 0 ? String(p.cantidad) : p.cantidad.toFixed(2);
        return `<tr><td style='text-align:left;padding:5px 8px;border-bottom:1px solid #d1fae5;font-weight:500;font-size:0.75rem;'>${p.puesto}</td><td style='text-align:center;padding:5px 8px;border-bottom:1px solid #d1fae5;font-weight:700;color:#259c39;font-size:0.75rem;'>${cantStr}</td></tr>`;
      })
      .join('');
    zonasHtml += `<div style='background:white;border-radius:8px;border:1px solid #b7e4c7;overflow:hidden;min-width:160px;max-width:200px;flex:0 0 auto;page-break-inside:avoid;'><div style='background:#259c39;color:white;font-weight:700;padding:6px 8px;text-align:center;font-size:0.8rem;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact;'>${z.nombre} <span style='background:rgba(255,255,255,0.2);padding:2px 6px;border-radius:20px;font-size:0.7rem;'>${z.total}</span></div><table style='width:100%;border-collapse:collapse;font-size:0.7rem;'><thead><tr><th style='background:#e8f5e9;padding:5px 6px;font-weight:700;text-align:left;font-size:0.7rem;'>Puesto</th><th style='background:#e8f5e9;padding:5px 6px;font-weight:700;text-align:center;font-size:0.7rem;'>Cant</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  });
  const html = `<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'><title>Planilla ${opl}</title></head><body style='font-family:Segoe UI,Arial,sans-serif;'><h2 style='color:#259c39;text-align:center;'>LISTA DE PUESTOS: VISCERAS DE SALIDA DE CAVA</h2><p style='text-align:center;color:#6b7280;'>OPL: <strong>${datos.opl}</strong> | Total: ${datos.totalOPL} | ${datos.porcentaje}%</p><div style='display:flex;flex-wrap:wrap;gap:0.5rem;'>${zonasHtml}</div></body></html>`;
  return { success: true, html };
}

export async function getHistorialPDF() {
  const s = await loadState();
  return { success: true, historial: (s.historialPdf || []).slice().reverse() };
}

/** Consulta SIRT: subproductos en cava (consulta 2 del usuario). */
export async function consultarEnCavaDesdeSIRT(range) {
  const filtro = normalizarRangoFechas(range || {});
  const useRange = filtroSirtValido(filtro) ? filtro : {};
  const porRango = Boolean(useRange.from && useRange.to);
  const filas = await fetchEstadoCavasRows({ stockActual: true });
  const resSalidas = contarJuegosVisceralesSync({ estadoFromRow12: filas });
  return {
    success: true,
    modo: porRango ? 'rango' : 'lookback',
    desde: useRange.from || null,
    hasta: useRange.to || null,
    lookbackDias: porRango ? null : Number(process.env.SIRT_CAVA_LOOKBACK_DAYS || 30),
    totalFilas: filas.length,
    totalJuegos: resSalidas.total || 0,
    filas: filas.map(estadoCavaRowToDto),
  };
}

/** Consulta SIRT: salidas de cava (consulta 1 del usuario). */
export async function consultarSalidasCavaDesdeSIRT(range) {
  const filtro = normalizarRangoFechas(range || {});
  const useRange = filtroSirtValido(filtro) ? filtro : {};
  const porRango = Boolean(useRange.from && useRange.to);
  const filas = await fetchDespachosCavasRows(useRange);
  return {
    success: true,
    modo: porRango ? 'rango' : 'lookback',
    desde: useRange.from || null,
    hasta: useRange.to || null,
    lookbackDias: porRango ? null : Number(process.env.SIRT_SALIDAS_CAVA_LOOKBACK_DAYS || 30),
    turno: detectarTurnoDesdeDatos(filas),
    totalFilas: filas.length,
    filas: filas.map(despachoCavaRowToDto),
  };
}

/** Vista previa de decomisos SAI (ventana automática de N días). */
export async function consultarDecomisosDesdeSIRT(range) {
  return consultarDecomisosDesdeSirt(range);
}

/** Cruce decomisos ↔ cava en vivo, sin guardar sesión (solo lectura para UI v2). */
/** Despachos del turno en vivo, sin guardar sesión. */
export async function consultarDespachosPreview(turno, range) {
  const filtro = normalizarRangoFechas(range || {});
  const useRange = filtroSirtValido(filtro) ? filtro : {};
  const despPack = await fetchDespachosParaConsulta(filtro);
  const desp = despPack.desp;
  const t = resolverTurnoOperacion(filtro, desp, turno);
  const [packDec, vwPack] = await Promise.all([
    fetchReporteDecomisosRows(useRange),
    fetchDecomisosAnimalesVw(useRange),
  ]);
  const indiceVw = construirIndiceDecomisosVw(vwPack.rows);
  const estadoBruto = await fetchEstadoCavasRows({ stockActual: true });
  const estado = aplicarEstadoEnCavaNeto(estadoBruto, desp);
  const sPrev = await loadState();
  const rd = construirResumenDespachosDesdeFilas(desp, t, packDec.rows, estado, cargarMapaOPL(sPrev), {
    indiceVw,
  });
  return {
    success: true,
    turno: rd.turno,
    fechaConsulta: filtro.from || null,
    totalPuestos: rd.resultado.length,
    totalJuegos: rd.totalJuegos,
    totalConDecomiso: rd.totalConDecomiso || 0,
    totalConDecomisoVw: rd.totalConDecomisoVw || 0,
    totalConDecomisoSai: rd.totalConDecomisoSai || 0,
    decomisosVwAnimales: vwPack.animalesUnicos,
    filasDespachosCavas: desp.length,
    tipos: TIPOS_PRODUCTO,
    resultado: rd.resultado,
    avisoRango: despPack.avisoRango || '',
  };
}

export async function consultarCruceDecomisosPreview(range) {
  const filtro = normalizarRangoFechas(range || {});
  const useRange = filtroSirtValido(filtro) ? filtro : {};
  const salidas = (await fetchDespachosParaConsulta(filtro)).desp;
  const pack = await fetchReporteDecomisosRows(useRange);
  const estadoBruto = await fetchEstadoCavasRows({ stockActual: true });
  const estado = aplicarEstadoEnCavaNeto(estadoBruto, salidas);
  const turno = resolverTurnoOperacion(filtro, salidas);
  const resultado = cruzarDecomisosConSalidas(salidas, pack.rows);
  const idx = construirIndiceEnCava(estado);
  const totalAnimalesConDecomiso = contarAnimalesDecomisoEnSalidasProgramadas(
    salidas,
    pack.rows,
    turno
  );
  return {
    success: true,
    totalProductos: resultado.length,
    totalPiezasVinculadas: resultado.length,
    totalAnimalesConDecomiso,
    totalDestinos: new Set(resultado.map((r) => r[1]).filter(Boolean)).size,
    turnoOperacion: turno,
    resultados: resultado.map((r) => ({ id: r[0], destino: r[1], producto: r[2] })),
    filasSalidas: salidas.length,
    filasSalidasEnCava: salidas.length,
    filasDecomisosPeriodo:
      Number(pack.vinculo?.decomisosUnicos) || Number(pack.vinculo?.filasEnRango) || pack.rows.length,
    filasEnCava: idx.basesEnCava.size,
  };
}

export async function prepararModuloDecomisosDesdeSIRT(range) {
  const filtro = normalizarRangoFechas(range || {});
  await importarExcel(null, 'Despachos_Cavas', range);
  await importarExcel(null, 'Reporte_Decomisos', range);
  await importarExcel(null, 'Estado_Cavas', range);
  const res = await resumirDecomisos();
  const s = await loadState();
  if (res && s.despachosAvisoFecha) {
    res.avisoRango = s.despachosAvisoFecha;
  }
  if (res && filtro.from) {
    res.fechaConsulta = filtro.from;
    res.turnoOperacion = resolverTurnoOperacion(filtro, s.despachosCavas || []);
  }
  return res;
}

export async function prepararModuloDespachosDesdeSIRT(turno, range) {
  const filtro = normalizarRangoFechas(range || {});
  await importarExcel(null, 'Reporte_Decomisos', range);
  await importarExcel(null, 'Estado_Cavas', range);
  await importarExcel(null, 'Despachos_Cavas', range);
  const s = await loadState();
  const t = resolverTurnoOperacion(filtro, s.despachosCavas || [], turno);
  const out = await procesarDespachos(t);
  if (out) {
    if (s.despachosAvisoFecha) out.avisoRango = s.despachosAvisoFecha;
    if (filtro.from) {
      out.fechaConsulta = filtro.from;
      out.turnoOperacion = t;
    }
  }
  return out;
}

/**
 * Importa Estado_Cavas, Reporte_Decomisos y Despachos_Cavas para la fecha,
 * cruza decomisos y procesa despachos (turno desde datos SIRT o día de la fecha).
 * Persiste en la sesión del servidor (gestor-state).
 */
export async function sincronizarSesionDesdeSirtPorFecha(range) {
  const filtro = normalizarRangoFechas(range || {});
  if (!filtroSirtValido(filtro)) {
    return { success: false, message: 'Indique una fecha válida (AAAA-MM-DD).' };
  }
  try {
    const dec = await prepararModuloDecomisosDesdeSIRT(filtro);
    if (!dec.success) {
      const s = await loadState();
      return {
        success: false,
        message: dec.message,
        filasEstado: s.estadoFromRow12?.length || 0,
        filasReporte: s.reporteDecomisos?.length || 0,
        filasDespachos: s.despachosCavas?.length || 0,
      };
    }
    const desp = await prepararModuloDespachosDesdeSIRT(null, filtro);
    const turnoSesion = resolverTurnoOperacion(filtro, [], null);
    return {
      success: true,
      turno: desp && desp.success ? desp.turno : turnoSesion,
      fechaConsulta: filtro.from,
      turnoOperacion: turnoSesion,
      decomisos: dec,
      despachos: desp,
      avisoDespachos: desp && desp.success ? '' : String(desp?.message || 'Despachos no procesados.'),
    };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

function detectarTipoAdicionalPorFila(fila) {
  const colJ = String(fila[9] || '').trim().toUpperCase();
  const colO = String(fila[14] || '').trim().toUpperCase();
  if (colJ.includes('QUEDA EN CAVA')) return 'CANCELACION';
  if (colO.includes('CAMBIO DE DESTINO')) return 'CAMBIO';
  return 'ADICIONAL';
}

function parseDateDdMmYyyy(value) {
  const s = String(value || '').trim();
  const p = s.split('/');
  if (p.length !== 3) return null;
  const d = Number(p[0]);
  const m = Number(p[1]) - 1;
  const y = Number(p[2]);
  const dt = new Date(y, m, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function readHistorico(state) {
  return (state.historicoOpl || [])
    .map((r) => {
      const fechaStr = String(r.fechaInicioStr || r.fechaStr || '').trim();
      let fecha = parseDateDdMmYyyy(fechaStr);
      if (!fecha && r.fechaHoraStr) {
        const raw = new Date(String(r.fechaHoraStr).replace(' ', 'T'));
        if (!Number.isNaN(raw.getTime())) fecha = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
      }
      return {
        fecha,
        fechaStr,
        turno: String(r.turno || '').trim(),
        opl: String(r.opl || '').trim(),
        total: Number(r.total || 0),
        despachados: Number(r.despachados || 0),
        pendientes: Number(r.pendientes || 0),
        progreso: Number(r.progreso || 0),
        estado: String(r.estado || '').trim(),
        fechaHora: String(r.fechaHoraStr || ''),
      };
    })
    .filter((r) => r.fecha && r.opl);
}

function filtrarHistoricoAvanzado(datos, filtro = {}) {
  const meses = Array.isArray(filtro.meses) ? filtro.meses.map(Number) : null;
  return datos.filter((r) => {
    if (filtro.opl && filtro.opl !== 'Todos' && filtro.opl !== 'Todos los OPLs' && r.opl !== filtro.opl) return false;
    if (filtro.turno && r.turno !== filtro.turno) return false;
    if (filtro.estado && r.estado !== filtro.estado) return false;
    if (filtro.minDespachados && r.despachados < Number(filtro.minDespachados)) return false;
    if (filtro.maxPendientes && r.pendientes > Number(filtro.maxPendientes)) return false;
    if (filtro.anio && r.fecha.getFullYear() !== Number(filtro.anio)) return false;
    if (meses && meses.length > 0 && !meses.includes(r.fecha.getMonth())) return false;
    return true;
  });
}

function sumarDespachados(datos) {
  return datos.reduce((s, r) => s + Number(r.despachados || 0), 0);
}

function eficienciaOps(datos) {
  const ops = {};
  datos.forEach((r) => {
    const key = `${r.fechaStr}_${r.turno}`;
    if (!ops[key]) ops[key] = r.estado;
  });
  const vals = Object.values(ops);
  const completas = vals.filter((v) => v === ESTADO_COMPLETO).length;
  const conPendientes = Math.max(0, vals.length - completas);
  const total = completas + conPendientes;
  return {
    completas,
    conPendientes,
    pctCompletas: total > 0 ? Math.round((completas / total) * 100) : 0,
    pctPendientes: total > 0 ? Math.round((conPendientes / total) * 100) : 0,
  };
}

function porDiaSemana(datos) {
  const dias = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicioSem = new Date(hoy);
  inicioSem.setDate(hoy.getDate() - 6);
  const inicioAnt = new Date(hoy);
  inicioAnt.setDate(hoy.getDate() - 13);
  const sumAct = [0, 0, 0, 0, 0, 0, 0];
  const sumAnt = [0, 0, 0, 0, 0, 0, 0];
  const sumHis = [0, 0, 0, 0, 0, 0, 0];
  const cntHis = [0, 0, 0, 0, 0, 0, 0];
  datos.forEach((r) => {
    const d = r.fecha.getDay();
    const fd = new Date(r.fecha.getFullYear(), r.fecha.getMonth(), r.fecha.getDate());
    if (fd >= inicioSem && fd <= hoy) sumAct[d] += r.despachados;
    if (fd >= inicioAnt && fd < inicioSem) sumAnt[d] += r.despachados;
    sumHis[d] += r.despachados;
    cntHis[d] += 1;
  });
  const totalAct = sumAct.reduce((s, v) => s + v, 0);
  const diaHoy = hoy.getDay();
  return dias.map((nombre, i) => {
    const actual = sumAct[i];
    const anterior = sumAnt[i];
    const variacion = anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null;
    return {
      dia: nombre,
      actual,
      anterior,
      variacion,
      pctActual: totalAct > 0 ? Math.round((actual / totalAct) * 100) : 0,
      total: sumHis[i],
      promedio: cntHis[i] > 0 ? Math.round(sumHis[i] / cntHis[i]) : 0,
      esHoy: i === diaHoy,
      ops: cntHis[i],
    };
  });
}

export async function importarExcelAdicionales(bytes, nombre) {
  const s = await loadState();
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes || []));
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 16) {
      return { success: false, message: 'El archivo no tiene datos desde la fila 16.' };
    }
    const filas = [];
    for (let rowNum = 16; rowNum <= ws.rowCount; rowNum++) {
      const row = ws.getRow(rowNum);
      const fila = [];
      for (let c = 1; c <= 15; c++) fila.push(String(row.getCell(c).text || '').trim());
      if (fila[1]) filas.push(fila);
    }
    s.adicionalesTemp = { nombre: String(nombre || ''), filas };
    await saveState(s);
    return { success: true, nombre: nombre || '', rows: filas.length };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function importarAdicionales(_fileData, _nombreArchivo, _tipoManual) {
  const s = await loadState();
  const temp = s.adicionalesTemp?.filas || [];
  if (!temp.length) return { success: false, message: 'No hay archivo temporal de adicionales cargado.' };
  const filasAdicional = temp.filter((r) => detectarTipoAdicionalPorFila(r) === 'ADICIONAL');
  const filasCancel = temp.filter((r) => detectarTipoAdicionalPorFila(r) === 'CANCELACION');
  const filasCambio = temp.filter((r) => detectarTipoAdicionalPorFila(r) === 'CAMBIO');
  const codigos = {};
  s.estadoFromRow12.forEach((r) => {
    const code = String(r[0] || '').trim();
    if (code) codigos[code] = true;
  });
  const nuevas = [];
  let ignorados = 0;
  let cancelados = 0;
  let cambios = 0;
  filasAdicional.forEach((fila) => {
    const codigo = String(fila[1] || '').trim();
    if (!codigo) return;
    if (codigos[codigo]) {
      ignorados++;
      return;
    }
    codigos[codigo] = true;
    nuevas.push(fila.slice(1, 15));
  });
  if (filasCancel.length) {
    const cancelar = new Set(filasCancel.map((fila) => String(fila[1] || '').trim()).filter(Boolean));
    const antes = s.estadoFromRow12.length;
    s.estadoFromRow12 = s.estadoFromRow12.filter((fila) => !cancelar.has(String(fila[0] || '').trim()));
    cancelados = antes - s.estadoFromRow12.length;
  }
  filasCambio.forEach((fila) => {
    const codigo = String(fila[1] || '').trim();
    const destino = String(fila[9] || '').trim();
    if (!codigo || !destino) return;
    s.estadoFromRow12.forEach((row) => {
      if (String(row[0] || '').trim() === codigo) {
        row[8] = destino;
        cambios++;
      }
    });
  });
  if (nuevas.length) {
    s.estadoFromRow12.push(...nuevas);
  }
  if (nuevas.length || cancelados || cambios) actualizarCantidadesInicialesOPLSync(s);
  s.adicionalesTemp = null;
  await saveState(s);
  if ((nuevas.length > 0 || cancelados > 0 || cambios > 0) && s.reporteDecomisos.length > 0) {
    await resumirDecomisos();
  }
  return {
    success: true,
    tipo: 'MIXTO',
    procesados: nuevas.length + cancelados + cambios,
    ignorados,
    totalAdicional: filasAdicional.length,
    totalCancel: filasCancel.length,
    totalCambio: filasCambio.length,
    adicionales: nuevas.length,
    cancelaciones: cancelados,
    cambios,
    mensaje: `Adicionales: ${nuevas.length}. Cancelaciones: ${cancelados}. Cambios de destino: ${cambios}.`,
  };
}

export async function generarPDFDecomisos() {
  const res = await getResumenDecomisos();
  if (!res.resultados?.length) return { success: false, message: 'No hay datos en Resumen.' };
  const fecha = fmtNow();
  const rows = res.resultados.map((r, i) => ({
    n: i + 1,
    id: r.id || '',
    destino: r.destino || '',
    producto: r.producto || '',
  }));
  const porProducto = {};
  rows.forEach((r) => {
    porProducto[r.producto] = (porProducto[r.producto] || 0) + 1;
  });

  const cr = await getCrudasDetalle();
  const resumenCrudas = [];
  if (cr?.success && Array.isArray(cr.filas) && cr.filas.length > 0) {
    const map = {};
    cr.filas.forEach((f) => {
      const key = `${f.puesto || ''}||${f.opl || ''}`;
      if (!map[key]) map[key] = { puesto: f.puesto || '', opl: f.opl || '', cantidad: 0, codigos: [] };
      map[key].cantidad += Number(f.cantidad || 0);
      if (f.codigo) map[key].codigos.push(String(f.codigo));
    });
    Object.values(map)
      .sort((a, b) => String(a.puesto).localeCompare(String(b.puesto)))
      .forEach((f) => {
        resumenCrudas.push({
          puesto: f.puesto,
          cantidad: f.cantidad,
          opl: f.opl || '—',
          codigos: f.codigos.slice(0, 8).join(', '),
        });
      });
  }
  const pdfBuffer = await generarPdfDecomisosBuffer(rows, porProducto, resumenCrudas, fecha);
  const url = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
  const s = await loadState();
  s.historialPdf = s.historialPdf || [];
  const nombre = `Listado_Decomisos_${fmtDateOnly().replace(/\//g, '-')}.pdf`;
  s.historialPdf.push({
    nombre,
    fecha,
    url,
    tipo: 'DECOMISOS',
    registros: res.resultados.length,
    usuario: 'SISTEMA',
  });
  await saveState(s);
  return {
    success: true,
    nombre,
    url,
    message: 'PDF generado correctamente.',
  };
}

async function generarPdfDecomisosBuffer(rows, porProducto, resumenCrudas, fecha) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#166534').text('LISTADO DE DECOMISOS VÍSCERAS CON SALIDA', { align: 'center' });
    doc.moveDown(0.35);
    doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(`Fecha de generación: ${fecha}`, { align: 'center' });
    doc.moveDown(0.9);
    doc.fillColor('#111827').fontSize(10).text(`Total registros: ${rows.length}    Productos distintos: ${Object.keys(porProducto).length}`);
    doc.moveDown(0.75);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#14532d').text('DETALLE DE DECOMISOS');
    doc.moveDown(0.35);
    drawThemedPdfTable(doc, ['#', 'Código', 'Destino', 'Decomisos'], rows.map((r) => [r.n, r.id, r.destino, r.producto]), [32, 128, 248, 122], {
      theme: 'decomisos',
    });

    doc.moveDown(0.85);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#14532d').text('RESUMEN POR PRODUCTO');
    doc.moveDown(0.35);
    drawThemedPdfTable(
      doc,
      ['Producto', 'Cantidad'],
      Object.keys(porProducto)
        .sort()
        .map((p) => [p, porProducto[p]]),
      [420, 80],
      { theme: 'producto' }
    );

    if (resumenCrudas.length) {
      doc.moveDown(0.85);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#9a3412').text('RESUMEN DE CRUDAS - VÍSCERAS BLANCAS');
      doc.moveDown(0.35);
      drawThemedPdfTable(
        doc,
        ['Puesto', 'Cantidad', 'OPL', 'Códigos'],
        resumenCrudas.map((x) => [x.puesto, x.cantidad, x.opl, x.codigos]),
        [118, 62, 88, 222],
        { theme: 'crudas' }
      );
    }

    doc.moveDown(0.85);
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(`Documento generado automáticamente · Gestor de Vísceras Colbeef · ${fecha}`, { align: 'center' });
    doc.end();
  });
}

const PDF_TABLE_THEMES = {
  decomisos: {
    headerBg: '#166534',
    headerFg: '#ffffff',
    stripeA: '#dcfce7',
    stripeB: '#ffffff',
    border: '#14532d',
    bodyFg: '#111827',
  },
  producto: {
    headerBg: '#15803d',
    headerFg: '#ffffff',
    stripeA: '#ecfdf5',
    stripeB: '#ffffff',
    border: '#166534',
    bodyFg: '#111827',
  },
  crudas: {
    headerBg: '#ea580c',
    headerFg: '#ffffff',
    stripeA: '#ffedd5',
    stripeB: '#ffffff',
    border: '#c2410c',
    bodyFg: '#1c1917',
  },
};

/** Tablas estilo planilla Apps Script: cabecera sólida, filas alternadas, salto de página con cabecera repetida. */
function drawThemedPdfTable(doc, headers, rows, widths, opts = {}) {
  const themeKey = opts.theme === 'crudas' ? 'crudas' : opts.theme === 'producto' ? 'producto' : 'decomisos';
  const t = PDF_TABLE_THEMES[themeKey];
  const startX = doc.x;
  const rowH = 18;
  const pageBottom = doc.page.height - (doc.page.margins?.bottom ?? 50);
  const leftPad = 5;

  const paintHeader = (y0) => {
    doc.font('Helvetica-Bold').fontSize(9);
    headers.forEach((h, i) => {
      const x = startX + widths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.save();
      doc.fillColor(t.headerBg).rect(x, y0, widths[i], rowH).fill();
      doc.strokeColor(t.border).lineWidth(0.35).rect(x, y0, widths[i], rowH).stroke();
      doc.restore();
      doc.fillColor(t.headerFg).text(String(h), x + leftPad, y0 + 5, { width: widths[i] - leftPad * 2, ellipsis: true });
    });
  };

  let y = doc.y;
  paintHeader(y);
  y += rowH;

  rows.forEach((r, rowIdx) => {
    if (y + rowH > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
      paintHeader(y);
      y += rowH;
    }
    const fill = rowIdx % 2 === 0 ? t.stripeA : t.stripeB;
    doc.font('Helvetica').fontSize(9);
    r.forEach((v, i) => {
      const x = startX + widths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.save();
      doc.fillColor(fill).rect(x, y, widths[i], rowH).fill();
      doc.strokeColor(t.border).lineWidth(0.25).rect(x, y, widths[i], rowH).stroke();
      doc.restore();
      doc.fillColor(t.bodyFg).text(String(v ?? ''), x + leftPad, y + 5, { width: widths[i] - leftPad * 2, ellipsis: true });
    });
    y += rowH;
  });
  doc.x = startX;
  doc.y = y + 4;
}

export async function getKPIs(opl, filtro) {
  const s = await loadState();
  const todos = readHistorico(s);
  const anioFiltro = Number(filtro?.anio || new Date().getFullYear());
  const mesesFiltro = Array.isArray(filtro?.meses) && filtro.meses.length ? filtro.meses : null;
  const periodo = filtrarHistoricoAvanzado(todos, { opl, anio: anioFiltro, meses: mesesFiltro });
  const todosOpl = filtrarHistoricoAvanzado(todos, { opl });
  const hoyBase = new Date();
  hoyBase.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(hoyBase);
  inicioSemana.setDate(hoyBase.getDate() - 6);
  const hoy = todosOpl.filter((r) => r.fecha.getTime() === hoyBase.getTime());
  const semana = todosOpl.filter((r) => r.fecha >= inicioSemana);
  const anio = filtrarHistoricoAvanzado(todos, { opl, anio: anioFiltro });
  const anioAnt = filtrarHistoricoAvanzado(todos, { opl, anio: anioFiltro - 1 });
  const periodoAnt = filtrarHistoricoAvanzado(todos, { opl, anio: anioFiltro - 1, meses: mesesFiltro });
  const despSem = sumarDespachados(semana);
  const diasConData = [...new Set(semana.map((r) => r.fechaStr))].length || 1;
  const promSem = Math.round(despSem / diasConData);
  const sumDia = [0, 0, 0, 0, 0, 0, 0];
  semana.forEach((r) => (sumDia[r.fecha.getDay()] += r.despachados));
  const diasNombres = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  let maxDia = 0;
  let diaMayor = '';
  sumDia.forEach((v, i) => {
    if (v > maxDia) {
      maxDia = v;
      diaMayor = diasNombres[i];
    }
  });
  const despMes = sumarDespachados(periodo);
  const mitad = Math.floor((new Date().getDate() || 1) / 2);
  const primera = periodo.filter((r) => r.fecha.getDate() <= mitad);
  const segunda = periodo.filter((r) => r.fecha.getDate() > mitad);
  const tendencia = sumarDespachados(segunda) >= sumarDespachados(primera) ? 'subiendo' : 'bajando';
  const efPeriodo = eficienciaOps(periodo);
  const efPeriodoAnt = eficienciaOps(periodoAnt);
  const comparacionOPLsMap = {};
  (periodo.length ? periodo : anio).forEach((r) => {
    if (!comparacionOPLsMap[r.opl]) comparacionOPLsMap[r.opl] = { desp: 0, ops: 0, pend: 0, comp: 0 };
    const x = comparacionOPLsMap[r.opl];
    x.desp += r.despachados;
    x.ops += 1;
    x.pend += r.pendientes;
    if (r.estado === ESTADO_COMPLETO) x.comp += 1;
  });
  const comparacionOPLs = Object.keys(comparacionOPLsMap)
    .map((k) => ({
      opl: k,
      despachados: comparacionOPLsMap[k].desp,
      operaciones: comparacionOPLsMap[k].ops,
      pendientes: comparacionOPLsMap[k].pend,
      promedio: comparacionOPLsMap[k].ops > 0 ? Math.round(comparacionOPLsMap[k].desp / comparacionOPLsMap[k].ops) : 0,
      eficiencia: comparacionOPLsMap[k].ops > 0 ? Math.round((comparacionOPLsMap[k].comp / comparacionOPLsMap[k].ops) * 100) : 0,
    }))
    .sort((a, b) => b.despachados - a.despachados);
  const anomalias = filtrarHistoricoAvanzado(todos, { anio: anioFiltro })
    .filter((r) => r.pendientes > 50 || r.progreso < 50)
    .map((r) => ({ fecha: r.fechaStr, turno: r.turno, opl: r.opl, pendientes: r.pendientes, progreso: r.progreso }))
    .sort((a, b) => b.pendientes - a.pendientes);
  const mesVals = new Array(12).fill(0);
  anio.forEach((r) => (mesVals[r.fecha.getMonth()] += r.despachados));
  const comparacionMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((n, i) => {
    const anterior = i > 0 ? mesVals[i - 1] : 0;
    const variacion = anterior > 0 ? Math.round(((mesVals[i] - anterior) / anterior) * 100) : null;
    return { mes: i, nombre: n, valor: mesVals[i], anterior, variacion, tendencia: variacion === null ? '—' : variacion >= 0 ? '↑' : '↓' };
  });
  const hoyDesp = sumarDespachados(hoy);
  const hoyProg = hoy.length ? Math.round(hoy.reduce((s2, r) => s2 + r.progreso, 0) / hoy.length) : 0;
  return {
    success: true,
    kpis: {
      hoy: { despachados: hoyDesp, progreso: hoyProg, completas: hoy.filter((r) => r.estado === ESTADO_COMPLETO).length, total: hoy.length, badge: `${hoyProg}% promedio` },
      semana: { despachados: despSem, promDiario: promSem, diaMayor, maxDia },
      mes: { despachados: despMes, tendencia },
      periodo: { despachados: sumarDespachados(periodo), vsMesAnt: sumarDespachados(periodoAnt) },
      anio: { despachados: sumarDespachados(anio), operaciones: [...new Set(anio.map((r) => `${r.fechaStr}_${r.turno}`))].length, mesMayor: comparacionMeses.reduce((a, b) => (b.valor > a.valor ? b : a), { nombre: '' }).nombre, vsAnioAnt: sumarDespachados(anioAnt) },
      vs: {
        particulares: (periodo.length ? periodo : anio).filter((r) => r.opl !== 'TRANSCARNES').reduce((s2, r) => s2 + r.despachados, 0),
        transcarnes: (periodo.length ? periodo : anio).filter((r) => r.opl === 'TRANSCARNES').reduce((s2, r) => s2 + r.despachados, 0),
      },
      eficiencia: efPeriodo.pctCompletas,
      eficienciaVsAnt: efPeriodoAnt.pctCompletas,
      productividad: {
        promedioPorOp: comparacionOPLs.length ? Math.round(comparacionOPLs.reduce((s2, r) => s2 + r.promedio, 0) / comparacionOPLs.length) : 0,
        totalOps: (periodo.length ? periodo : anio).length,
        pctCompletadas: efPeriodo.pctCompletas,
      },
      anomalias: anomalias.length,
    },
    graficos: {
      evolucion: (() => {
        const mapa = {};
        todosOpl.forEach((r) => {
          mapa[r.fechaStr] = mapa[r.fechaStr] || { despachados: 0, pendientes: 0 };
          mapa[r.fechaStr].despachados += r.despachados;
          mapa[r.fechaStr].pendientes += r.pendientes;
        });
        const out = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date(hoyBase);
          d.setDate(hoyBase.getDate() - i);
          const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
          out.push({ label: key.slice(0, 5), despachados: mapa[key]?.despachados || 0, pendientes: mapa[key]?.pendientes || 0 });
        }
        return out;
      })(),
      ranking: comparacionOPLs.map((x) => ({ opl: x.opl, despachados: x.despachados, promedio: x.promedio })),
      porDiaSemana: porDiaSemana(periodo.length ? periodo : anio.length ? anio : todos),
      eficiencia: efPeriodo,
      comparacionMeses,
      comparacionOPLs,
    },
    backlog: comparacionOPLs
      .map((x) => ({ opl: x.opl, opsPendientes: x.operaciones - Math.round((x.eficiencia / 100) * x.operaciones), totalPendientes: x.pendientes, eficiencia: x.eficiencia, estado: x.eficiencia >= 95 ? 'ok' : x.eficiencia >= 80 ? 'revisar' : 'critico' }))
      .filter((x) => x.totalPendientes > 0)
      .sort((a, b) => b.totalPendientes - a.totalPendientes),
    anomalias: anomalias.slice(0, 10),
  };
}

export async function getAniosDisponibles() {
  const s = await loadState();
  const set = {};
  readHistorico(s).forEach((r) => {
    set[r.fecha.getFullYear()] = true;
  });
  const anios = Object.keys(set)
    .map(Number)
    .sort((a, b) => b - a);
  return { success: true, anios: anios.length ? anios : [new Date().getFullYear()] };
}

export async function getListaOPLsHistorico() {
  const s = await loadState();
  const set = {};
  s.historicoOpl.forEach((r) => {
    if (r.opl) set[r.opl] = true;
  });
  return { success: true, opls: ['Todos los OPLs'].concat(Object.keys(set).sort()) };
}

export async function getResumenAdicionales() {
  const s = await loadState();
  const resSalidas = contarJuegosVisceralesSync(s);
  const totalSalidas = resSalidas.total || 0;
  const metaDec = s.resumenDecomisoMeta || {};
  const totalDecomisos =
    Number(metaDec.totalAnimalesConDecomiso) > 0
      ? Number(metaDec.totalAnimalesConDecomiso)
      : Number(s.resumenDespachos?.totalConDecomiso) || 0;
  return { success: true, totalSalidas, totalDecomisos };
}

export async function generarReporteOPL(opl, filtro) {
  const res = await getKPIs(opl, filtro);
  if (!res.success) return res;
  const k = res.kpis;
  const g = res.graficos || {};
  const backlog = res.backlog || [];
  const anomalias = res.anomalias || [];
  const compRows = (g.comparacionOPLs || [])
    .map(
      (r) =>
        `<tr><td>${r.opl}</td><td>${r.despachados}</td><td>${r.operaciones}</td><td>${r.pendientes}</td><td>${r.eficiencia}%</td></tr>`
    )
    .join('');
  const backlogRows =
    backlog.length > 0
      ? backlog
          .map(
            (b) =>
              `<tr><td>${b.opl}</td><td>${b.opsPendientes}</td><td>${b.totalPendientes}</td><td>${b.eficiencia}%</td><td>${b.estado}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:#6b7280;">Sin backlog registrado</td></tr>';
  const anomRows =
    anomalias.length > 0
      ? anomalias
          .map(
            (a) =>
              `<tr><td>${a.fecha}</td><td>${a.turno}</td><td>${a.opl}</td><td>${a.pendientes}</td><td>${a.progreso}%</td></tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:#6b7280;">Sin anomalias</td></tr>';
  const ev = g.evolucion || [];
  const sem = g.porDiaSemana || [];
  const cm = g.comparacionMeses || [];
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Reporte OPL</title>
  <script src="/vendor/chart.umd.min.js"></script>
  <style>
    body{font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:20px;color:#1f2937}
    .wrap{max-width:1100px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden}
    .head{background:#259c39;color:#fff;padding:18px 22px}
    .head h1{margin:0;font-size:22px}
    .head p{margin:6px 0 0;font-size:12px;opacity:.9}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:14px}
    .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px;background:#fafafa}
    .kpi .l{font-size:11px;color:#6b7280;text-transform:uppercase}
    .kpi .v{font-size:23px;font-weight:700;color:#259c39}
    .sec{padding:0 14px 14px}
    .sec h2{font-size:14px;color:#259c39;margin:12px 0 8px}
    .charts{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .card{border:1px solid #e5e7eb;border-radius:8px;padding:10px;background:#fff}
    .chart{height:220px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #e5e7eb;padding:7px;font-size:12px;text-align:center}
    th{background:#f9fafb}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <h1>Reporte Operativo OPL: ${opl || 'Todos los OPLs'}</h1>
      <p>Generado: ${fmtNow()} | Año: ${Number(filtro?.anio || new Date().getFullYear())}</p>
    </div>
    <div class="grid">
      <div class="kpi"><div class="l">Hoy</div><div class="v">${k.hoy.despachados}</div><div>${k.hoy.progreso}%</div></div>
      <div class="kpi"><div class="l">Semana</div><div class="v">${k.semana.despachados}</div><div>Prom: ${k.semana.promDiario}</div></div>
      <div class="kpi"><div class="l">Mes</div><div class="v">${k.mes.despachados}</div><div>${k.mes.tendencia}</div></div>
      <div class="kpi"><div class="l">Año</div><div class="v">${k.anio.despachados}</div><div>Ops: ${k.anio.operaciones}</div></div>
      <div class="kpi"><div class="l">Eficiencia</div><div class="v">${k.eficiencia}%</div><div>Anomalias: ${k.anomalias}</div></div>
    </div>
    <div class="sec">
      <h2>Graficos</h2>
      <div class="charts">
        <div class="card"><canvas id="c1" class="chart"></canvas></div>
        <div class="card"><canvas id="c2" class="chart"></canvas></div>
        <div class="card"><canvas id="c3" class="chart"></canvas></div>
        <div class="card"><canvas id="c4" class="chart"></canvas></div>
      </div>
    </div>
    <div class="sec">
      <h2>Comparacion entre OPLs</h2>
      <table><tr><th>OPL</th><th>Despachados</th><th>Operaciones</th><th>Pendientes</th><th>Eficiencia</th></tr>${compRows}</table>
    </div>
    <div class="sec">
      <h2>Backlog por OPL</h2>
      <table><tr><th>OPL</th><th>Ops c/pend</th><th>Total pendientes</th><th>Eficiencia</th><th>Estado</th></tr>${backlogRows}</table>
    </div>
    <div class="sec">
      <h2>Anomalias</h2>
      <table><tr><th>Fecha</th><th>Turno</th><th>OPL</th><th>Pendientes</th><th>Progreso</th></tr>${anomRows}</table>
    </div>
  </div>
  <script>
    new Chart(document.getElementById('c1'),{
      type:'line',
      data:{labels:${JSON.stringify(ev.map((x) => x.label))},datasets:[
        {label:'Despachados',data:${JSON.stringify(ev.map((x) => x.despachados))},borderColor:'#259c39',backgroundColor:'rgba(37,156,57,.08)',fill:true,tension:.3},
        {label:'Pendientes',data:${JSON.stringify(ev.map((x) => x.pendientes))},borderColor:'#dc2626',backgroundColor:'rgba(220,38,38,.06)',fill:true,tension:.3}
      ]},
      options:{responsive:true,maintainAspectRatio:false}
    });
    new Chart(document.getElementById('c2'),{
      type:'bar',
      data:{labels:${JSON.stringify((g.ranking || []).map((x) => x.opl))},datasets:[{data:${JSON.stringify((g.ranking || []).map((x) => x.despachados))},backgroundColor:'#378ADD'}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
    });
    new Chart(document.getElementById('c3'),{
      type:'bar',
      data:{labels:${JSON.stringify(sem.map((x) => x.dia))},datasets:[
        {label:'Esta semana',data:${JSON.stringify(sem.map((x) => x.actual))},backgroundColor:'#259c39'},
        {label:'Semana anterior',data:${JSON.stringify(sem.map((x) => x.anterior))},backgroundColor:'rgba(37,156,57,.25)'}
      ]},
      options:{responsive:true,maintainAspectRatio:false}
    });
    new Chart(document.getElementById('c4'),{
      type:'bar',
      data:{labels:${JSON.stringify(cm.map((x) => x.nombre))},datasets:[{label:'Mes',data:${JSON.stringify(cm.map((x) => x.valor))},backgroundColor:'#7F77DD'}]},
      options:{responsive:true,maintainAspectRatio:false}
    });
  </script>
</body></html>`;
  return { success: true, html };
}

export async function getHistoricoResumen(limite) {
  const s = await loadState();
  const n = Math.min(Number(limite) || 50, 200);
  const slice = s.historicoOpl.slice(-n).reverse();
  return { success: true, datos: slice };
}
