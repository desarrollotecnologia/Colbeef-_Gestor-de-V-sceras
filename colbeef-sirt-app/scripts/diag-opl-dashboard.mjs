/**
 * Simula getDashboardData OPL (consulta SIRT).
 */
import 'dotenv/config';
import {
  fetchDespachosCavasRows,
  fetchDespachosCavaRielRows,
  fetchEstadoCavasRows,
  fetchReporteDecomisosRows,
} from '../server/gestor/sirtSync.js';
import { aplicarEstadoEnCavaNeto, resolverTurnoOperacion } from '../server/gestor/engineUtils.js';
import {
  construirProgresoOplDesdeDespachos,
  construirResumenDespachosDesdeFilas,
} from '../server/gestor/engine.js';
import { OPL_DEFAULT, OPL_EXCEPCIONES_DEFAULT } from '../server/gestor/constants.js';

const fecha = process.argv[2] || '2026-06-11';
const filtro = { from: fecha, to: fecha };
const mapaOPL = {};
OPL_EXCEPCIONES_DEFAULT.forEach(([p, o]) => {
  mapaOPL[String(p).trim().toUpperCase()] = o;
});
function cargarMapaOPL() {
  return mapaOPL;
}

const [estadoBruto, reportePack, desp, salidasDia] = await Promise.all([
  fetchEstadoCavasRows({ stockActual: true }),
  fetchReporteDecomisosRows(filtro),
  fetchDespachosCavasRows(filtro),
  fetchDespachosCavaRielRows(filtro),
]);
const estado = aplicarEstadoEnCavaNeto(estadoBruto, desp);
const turnoOp = resolverTurnoOperacion(filtro, desp);
const rd = construirResumenDespachosDesdeFilas(
  desp,
  turnoOp,
  reportePack.rows,
  estado,
  cargarMapaOPL(),
  {}
);
const sWork = {
  lastSyncRange: filtro,
  despachosCavas: desp,
  salidasCavaDia: salidasDia,
  resumenDespachos: rd,
  oplConfig: [],
};
const pack = construirProgresoOplDesdeDespachos(sWork, turnoOp, 'diag');
console.log('build sim', 'turno', turnoOp, 'resumenJuegos', rd.totalJuegos);
pack.todosOPL.slice(0, 8).forEach((p) => {
  console.log(`  ${p.opl}: ${p.pendientes} pend | ${p.despachados} sal | ${p.total} tot (${p.progreso}%)`);
});
