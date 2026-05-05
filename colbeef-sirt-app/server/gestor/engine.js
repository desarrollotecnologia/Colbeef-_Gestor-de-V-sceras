import {
  TIPOS_PRODUCTO,
  PUESTOS_EXCLUIDOS_DESP,
  OPL_DEFAULT,
  ESTADO_COMPLETO,
  ESTADO_PENDIENTE,
} from './constants.js';
import {
  codigoBase,
  esCruda,
  extraerPuesto,
  detectarTurnoDesdeDatos,
  detectarTurnoPorDia,
} from './engineUtils.js';
import { fetchEstadoCavasRows, fetchReporteDecomisosRows, fetchDespachosCavasRows } from './sirtSync.js';
import { loadState, saveState } from './store.js';

function cargarMapaOPL(state) {
  const mapa = {};
  (state.oplConfig || []).forEach((r) => {
    const p = String(r.propietario || '').trim().toUpperCase();
    if (p) mapa[p] = String(r.opl || '').trim() || OPL_DEFAULT;
  });
  return mapa;
}

export async function initializeSheets() {
  await loadState();
  return { success: true };
}

/** Sustituye importar Excel: rellena estado desde SIRT */
export async function importarExcel(_base64, sheetName) {
  const s = await loadState();
  try {
    if (sheetName === 'Estado_Cavas') {
      s.estadoFromRow12 = await fetchEstadoCavasRows();
    } else if (sheetName === 'Reporte_Decomisos') {
      s.reporteDecomisos = await fetchReporteDecomisosRows();
    } else if (sheetName === 'Despachos_Cavas') {
      s.despachosCavas = await fetchDespachosCavasRows();
    } else {
      return { success: false, message: 'Hoja no soportada: ' + sheetName };
    }
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
  if (!s.estadoFromRow12.length || !s.reporteDecomisos.length) {
    return { success: false, message: 'Sincronice Estado_Cavas y Reporte_Decomisos desde SIRT primero.' };
  }
  const mapa = {};
  s.reporteDecomisos.forEach((fila) => {
    const id = String(fila[0] ?? '').trim();
    if (id) mapa[id] = fila[2];
  });
  const resultado = [];
  s.estadoFromRow12.forEach((fila) => {
    const slice9 = fila.slice(0, 9);
    const id = String(slice9[0] ?? '').trim();
    if (id && mapa[id] !== undefined) resultado.push([id, slice9[8], mapa[id]]);
  });
  const ahora = new Date();
  s.resumenRows = [
    ['ID Producto', 'Destino', 'Producto/Subproducto', 'Fecha Procesamiento'],
    ...resultado.map((r) => [...r, ahora]),
  ];
  s.resumenFechaProc = ahora.toISOString();
  actualizarCantidadesInicialesOPLSync(s);
  await saveState(s);
  const destinos = new Set(resultado.map((r) => r[1]).filter(Boolean));
  return {
    success: true,
    totalProductos: resultado.length,
    totalDestinos: destinos.size,
    fechaProcesamiento: fmtNow(),
    resultados: resultado.map((r) => ({ id: r[0], destino: r[1], producto: r[2] })),
  };
}

function fmtNow() {
  return fmtNowFromDate(new Date());
}

function fmtNowFromDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function actualizarCantidadesInicialesOPLSync(s) {
  const conteo = {};
  const vistos = {};
  s.estadoFromRow12.forEach((fila) => {
    const slice9 = fila.slice(0, 9);
    const id = String(slice9[0] ?? '').trim();
    const tipo = String(slice9[1] ?? '').trim();
    const prop = String(slice9[3] ?? '').trim();
    if (!id || !prop) return;
    if (tipo !== 'Visceras Rojas') return;
    const base = codigoBase(id);
    if (!base || vistos[base]) return;
    vistos[base] = true;
    const k = prop.toUpperCase();
    conteo[k] = (conteo[k] || 0) + 1;
  });
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
  if (data.length <= 1) {
    return {
      success: true,
      totalProductos: 0,
      totalDestinos: 0,
      fechaProcesamiento: 'Sin datos',
      resultados: [],
    };
  }
  const filas = data.slice(1).filter((r) => r[0] && r[1] && r[2]);
  let fechaFormatted = 'Sin datos';
  if (filas.length && filas[0][3]) {
    const fObj = filas[0][3] instanceof Date ? filas[0][3] : new Date(filas[0][3]);
    if (!Number.isNaN(fObj.getTime())) fechaFormatted = fmtNowFromDate(fObj);
  }
  return {
    success: true,
    totalProductos: filas.length,
    totalDestinos: new Set(filas.map((r) => r[1])).size,
    fechaProcesamiento: fechaFormatted,
    resultados: filas.map((r) => ({ id: r[0], destino: r[1], producto: r[2] })),
  };
}

export function contarJuegosVisceralesSync(s) {
  if (!s.estadoFromRow12.length) return { success: true, total: 0 };
  const startIdx = Math.max(0, 13 - 12);
  const codigos = new Set();
  for (let i = startIdx; i < s.estadoFromRow12.length; i++) {
    const c = String(s.estadoFromRow12[i][0] ?? '').trim();
    if (!c) continue;
    const partes = c.split('-');
    if (partes.length >= 2) codigos.add(`${partes[0]}-${partes[1]}`);
  }
  return { success: true, total: codigos.size };
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

export async function getDashboardData() {
  const s = await loadState();
  const totalDecomisos = Math.max(0, (s.resumenRows?.length || 0) - 1);
  const resSalidas = contarJuegosVisceralesSync(s);
  const totalSalidas = resSalidas.total || 0;
  const desp = getDashboardDataDespachosSync(s);
  const totalJuegosDespachar = desp.totalJuegosDespachar || 0;
  const turnoDespacho = desp.turnoDespacho || '';
  const ultimaActDespachos = desp.ultimaActDespachos || '';
  const despachados = Math.max(0, totalSalidas - totalJuegosDespachar);
  const progreso =
    totalSalidas > 0 ? Math.min(100, Math.round((despachados / totalSalidas) * 100)) : 0;
  const cr = contarCrudasSync(s);
  return {
    success: true,
    totalSalidas,
    totalDecomisos,
    totalCrudas: cr.total,
    totalJuegosDespachar,
    turnoDespacho,
    ultimaActDespachos,
    progreso,
    meta: totalSalidas,
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
  if (!s.despachosCavas.length) {
    return { success: false, message: 'No hay datos de Despachos_Cavas. Sincronice desde SIRT.' };
  }
  const turno =
    turnoForzado && String(turnoForzado).length > 0
      ? String(turnoForzado)
      : detectarTurnoDesdeDatos(s.despachosCavas);
  const data = s.despachosCavas.map((fila) => {
    const p = String(fila[9] ?? '').trim();
    if (p.includes(turno)) return fila;
    const c = fila.slice();
    c[9] = (p ? `${p} ` : '') + `/${turno}/`;
    return c;
  });
  const mapaPuestos = {};
  data.forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const prop = String(fila[4] ?? '').trim();
    const tipo = String(fila[7] ?? '').trim();
    const puesto = String(fila[9] ?? '').trim();
    if (!id || !tipo || !puesto) return;
    if (!puesto.includes(turno)) return;
    if (PUESTOS_EXCLUIDOS_DESP.includes(puesto)) return;
    if (!mapaPuestos[puesto]) {
      mapaPuestos[puesto] = { Cabeza: 0, 'Patas y Manos': 0, 'Visceras Blancas': 0, 'Visceras Rojas': 0 };
    }
    if (TIPOS_PRODUCTO.includes(tipo)) mapaPuestos[puesto][tipo]++;
  });
  const resultado = [];
  Object.keys(mapaPuestos)
    .sort()
    .forEach((p) => {
      const r = { puesto: p };
      TIPOS_PRODUCTO.forEach((t) => {
        r[t] = mapaPuestos[p][t] || 0;
      });
      resultado.push(r);
    });
  const totalJuegos = resultado.reduce((sum, r) => sum + (r['Visceras Rojas'] || 0), 0);
  s.resumenDespachos = {
    turno,
    fechaStr: fmtNow(),
    totalJuegos,
    resultado,
    historicoGuardadoFlag: '',
  };
  if (!s.fechaInicioOperacion) s.fechaInicioOperacion = new Date().toISOString();
  await saveState(s);
  try {
    await calcularProgresoOPL(totalJuegos);
  } catch (_) {}
  return {
    success: true,
    turno,
    totalPuestos: resultado.length,
    totalJuegos,
    tipos: TIPOS_PRODUCTO,
    resultado,
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
  const filas = [];
  s.despachosCavas.forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const prop = String(fila[4] ?? '').trim();
    const tipo = String(fila[7] ?? '').trim();
    const pFila = String(fila[9] ?? '').trim();
    if (pFila === puesto && id) filas.push({ id, propietario: prop, tipo });
  });
  filas.sort((a, b) => a.tipo.localeCompare(b.tipo));
  return { success: true, puesto, filas };
}

export async function limpiarDespachos() {
  const s = await loadState();
  s.despachosCavas = [];
  s.resumenDespachos = { turno: '', fechaStr: '', totalJuegos: 0, resultado: [], historicoGuardadoFlag: '' };
  s.oplConfig.forEach((r) => {
    r.total = 0;
  });
  s.oplProgreso = [];
  s.fechaInicioOperacion = null;
  await saveState(s);
  return { success: true };
}

export async function limpiarResumen() {
  const s = await loadState();
  s.estadoFromRow12 = [];
  s.reporteDecomisos = [];
  s.resumenRows = [];
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
    await saveState(s);
    return { success: true, turno: '', progreso: [], operacionFinalizada: true, fecha, totalJuegos: 0 };
  }

  if (!turno) return { success: false, message: 'Sin turno activo.' };
  const hayTotales = s.oplConfig.some((r) => Number(r.total || 0) > 0);
  if (!hayTotales) return { success: false, message: 'Sin totales. Procesa primero el módulo de Decomisos.' };

  const pendProp = {};
  const vistosDC = {};
  s.despachosCavas.forEach((fila) => {
    const id = String(fila[3] ?? '').trim();
    const tipo = String(fila[7] ?? '').trim();
    const prop = String(fila[4] ?? '').trim();
    const puesto = String(fila[9] ?? '').trim();
    if (!id || !prop || tipo !== 'Visceras Rojas') return;
    if (turno && !puesto.includes(turno)) return;
    const base = codigoBase(id);
    if (!base || vistosDC[base]) return;
    vistosDC[base] = true;
    const key = prop.trim().toUpperCase();
    pendProp[key] = (pendProp[key] || 0) + 1;
  });

  const porOPL = {};
  s.oplConfig.forEach((r) => {
    const prop = String(r.propietario || '').trim().toUpperCase();
    const opl = String(r.opl || '').trim() || OPL_DEFAULT;
    const total = Number(r.total || 0);
    if (total <= 0) return;
    const pendientes = Math.min(pendProp[prop] || 0, total);
    const despachados = Math.max(0, total - pendientes);
    if (!porOPL[opl]) porOPL[opl] = { total: 0, despachados: 0, pendientes: 0 };
    porOPL[opl].total += total;
    porOPL[opl].despachados += despachados;
    porOPL[opl].pendientes += pendientes;
  });

  const todosOPL = [];
  const progreso = [];
  Object.keys(porOPL)
    .sort()
    .forEach((opl) => {
      const d = porOPL[opl];
      if (d.total <= 0) return;
      const pct = Math.round((d.despachados / d.total) * 100);
      const item = { opl, total: d.total, despachados: d.despachados, pendientes: d.pendientes, progreso: pct };
      todosOPL.push(item);
      if (pct < 100) progreso.push(item);
    });
  progreso.sort((a, b) => b.pendientes - a.pendientes || a.opl.localeCompare(b.opl));

  let operacionFinalizada = todosOPL.length > 0 && progreso.length === 0;
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
    operacionFinalizada,
    fecha,
    totalJuegos: progreso.reduce((sum, p) => sum + p.total, 0),
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
    return { success: true, progreso: [], fecha: '' };
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
  return { success: true, progreso, operacionFinalizada, fecha: ultimaFecha };
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
  const conteo = {};
  const vistos = {};
  datos.forEach((fila) => {
    const id = String(fila[cols.id] ?? '').trim();
    const tipo = String(fila[cols.tipo] ?? '').trim();
    const prop = String(fila[cols.prop] ?? '').trim();
    const puesto = String(fila[cols.puesto] ?? '').trim();
    if (!id || !prop || tipo !== 'Visceras Rojas') return;
    if (turno && puesto && !puesto.includes(turno)) return;
    const base = codigoBase(id);
    if (!base || vistos[base]) return;
    vistos[base] = true;
    const k = prop.toUpperCase();
    conteo[k] = (conteo[k] || 0) + 1;
  });
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
  const puestos = {};
  s.estadoFromRow12.forEach((fila) => {
    const codigo = String(fila[0] ?? '').trim();
    const desc = String(fila[1] ?? '').trim();
    const puesto = String(fila[8] ?? '').trim();
    const colO = fila[13];
    if (!codigo || desc !== 'Visceras Blancas' || !esCruda(colO)) return;
    if (puesto) puestos[puesto] = true;
  });
  return { success: true, puestos, total: Object.keys(puestos).length, codigos: [] };
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

export async function consolidarDatos() {
  let s = await loadState();
  if (!s.estadoFromRow12.length) {
    await importarExcel(null, 'Estado_Cavas');
    s = await loadState();
  }
  if (!Object.keys(s.plazasMap || {}).length) {
    PLAZAS_DEFAULT.forEach(([p, pl]) => {
      s.plazasMap[String(p).trim()] = String(pl).trim().toUpperCase();
    });
  }
  const mapaPlazas = s.plazasMap;
  const mapaOPL = cargarMapaOPL(s);
  const turno = String(s.resumenDespachos.turno || '').trim();
  const startIdx = Math.max(0, 16 - 12);
  const rows = s.estadoFromRow12.slice(startIdx);
  const consolidado = [];
  const noEncontrados = {};
  const tzOff = -new Date().getTimezoneOffset();
  const fechaHoy = fmtDateOnly();
  rows.forEach((fila) => {
    const slice9 = fila.slice(0, 9);
    const codigo = String(slice9[0] ?? '').trim();
    const descripcion = String(slice9[1] ?? '').trim();
    const propietario = String(slice9[3] ?? '').trim();
    const destinoRaw = String(slice9[8] ?? '').trim();
    if (!codigo || !descripcion) return;
    const puesto = extraerPuesto(destinoRaw);
    if (!puesto) return;
    let plaza = mapaPlazas[puesto];
    if (!plaza) {
      plaza = 'ENTRADA A CAVA';
      noEncontrados[puesto] = (noEncontrados[puesto] || 0) + 1;
    }
    const opl = mapaOPL[propietario.toUpperCase()] || OPL_DEFAULT;
    consolidado.push([codigo, descripcion, propietario, destinoRaw, puesto, plaza, opl, 0.25, fechaHoy, turno]);
  });
  s.consolidado = consolidado;
  await saveState(s);
  return { success: true, procesados: consolidado.length, turno, faltantes: Object.keys(noEncontrados) };
}

function fmtDateOnly() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export async function getListaOPLsParaPlanilla() {
  const s = await loadState();
  const set = {};
  s.consolidado.forEach((row) => {
    const opl = String(row[6] ?? '').trim();
    if (opl) set[opl] = true;
  });
  return Object.keys(set).sort();
}

export async function generarPlanillaPuntos(opl) {
  const s = await loadState();
  if (!s.consolidado.length) {
    return { success: false, message: "No hay datos. Ejecuta 'consolidarDatos' primero." };
  }
  const zonasMap = {};
  let totalOPL = 0;
  let totalGlobal = 0;
  let turno = '';
  s.consolidado.forEach((fila) => {
    const oplReg = String(fila[6] ?? '').trim();
    const zona = String(fila[5] ?? 'ENTRADA A CAVA').trim();
    const puesto = String(fila[4] ?? '').trim();
    let cantidad = Number(fila[7] ?? 0);
    if (Number.isNaN(cantidad)) cantidad = 0;
    if (!turno && fila[8]) turno = String(fila[8]);
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
  return {
    success: true,
    opl,
    zonas: zonasArray,
    totalOPL: Math.round(totalOPL * 100) / 100,
    totalGlobal: Math.round(totalGlobal * 100) / 100,
    porcentaje: pct,
    turno,
    fecha: fmtDateOnly(),
  };
}

export async function getResumenTodosOPLs() {
  const s = await loadState();
  if (!s.consolidado.length) return { success: true, resumen: [] };
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

export async function prepararModuloDecomisosDesdeSIRT() {
  await importarExcel(null, 'Estado_Cavas');
  await importarExcel(null, 'Reporte_Decomisos');
  return resumirDecomisos();
}

export async function prepararModuloDespachosDesdeSIRT(turno) {
  await importarExcel(null, 'Despachos_Cavas');
  return procesarDespachos(turno || detectarTurnoPorDia());
}

export async function importarExcelAdicionales(_bytes, _nombre) {
  return { success: true, rows: 0 };
}

export async function importarAdicionales() {
  return {
    success: true,
    tipo: 'ADICIONAL',
    procesados: 0,
    totalAdicional: 0,
    totalCancel: 0,
    totalCambio: 0,
    mensaje: 'Movimientos adicionales desde archivo deshabilitados; use SIRT.',
  };
}

/** Informe, analytics, PDF decomisos: stubs mínimos para no romper UI */
export async function getInformeDatos() {
  const s = await loadState();
  if (s.informe) return { success: true, ...s.informe };
  return {
    success: true,
    fecha: fmtDateOnly(),
    completos: 0,
    incompletos: 0,
    beneficioDia: 0,
    stockTotal: 100,
    danados: 2,
    novedades: [],
    cavas: [],
    percheros: [],
  };
}

export async function guardarInformeDatos(json) {
  const s = await loadState();
  try {
    s.informe = typeof json === 'string' ? JSON.parse(json) : json;
    await saveState(s);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function limpiarInformeDatos() {
  const s = await loadState();
  s.informe = null;
  await saveState(s);
  return { success: true };
}

export async function generarInformeHTML(_json) {
  return {
    success: true,
    html: '<html><body><p>Informe generado (versión SIRT). Complete datos en el módulo Informe.</p></body></html>',
  };
}

export async function generarPDFDecomisos() {
  const res = await getResumenDecomisos();
  if (!res.resultados?.length) return { success: false, message: 'No hay datos en Resumen.' };
  return {
    success: true,
    url: '#',
    message: 'Use el informe en pantalla; exportación a Drive no aplica en SIRT.',
  };
}

export async function getKPIs(opl, filtro) {
  return {
    success: true,
    kpis: {
      hoy: { despachados: 0, progreso: 0, completas: 0, total: 0, badge: '—' },
      semana: { despachados: 0, promDiario: 0, diaMayor: '', maxDia: 0 },
      mes: { despachados: 0, tendencia: '—' },
      periodo: { despachados: 0, vsMesAnt: 0 },
      anio: { despachados: 0, operaciones: 0, mesMayor: '', vsAnioAnt: 0 },
      vs: { particulares: 0, transcarnes: 0 },
      eficiencia: 0,
      eficienciaVsAnt: 0,
      productividad: { opsPorDia: 0, mejorDia: '', peorDia: '' },
      anomalias: 0,
    },
    graficos: {
      evolucion: [],
      ranking: [],
      porDiaSemana: [],
      eficiencia: { completas: 0, conPendientes: 0, pctCompletas: 0, pctPendientes: 0 },
      comparacionMeses: [],
      comparacionOPLs: [],
    },
    backlog: [],
    anomalias: [],
  };
}

export async function getAniosDisponibles() {
  return { success: true, anios: [new Date().getFullYear()] };
}

export async function getListaOPLsHistorico() {
  const s = await loadState();
  const set = {};
  s.historicoOpl.forEach((r) => {
    if (r.opl) set[r.opl] = true;
  });
  return { success: true, opls: ['Todos los OPLs'].concat(Object.keys(set).sort()) };
}

export async function generarReporteOPL(opl, filtro) {
  const res = await getKPIs(opl, filtro);
  const html = `<html><body><h1>Reporte OPL ${opl}</h1><pre>${JSON.stringify(res.kpis, null, 2)}</pre></body></html>`;
  return { success: true, html };
}

export async function getHistoricoResumen(limite) {
  const s = await loadState();
  const n = Math.min(Number(limite) || 50, 200);
  const slice = s.historicoOpl.slice(-n).reverse();
  return { success: true, datos: slice };
}
