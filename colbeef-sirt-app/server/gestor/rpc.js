import * as engine from './engine.js';

const handlers = {
  initializeSheets: engine.initializeSheets,
  importarExcel: engine.importarExcel,
  resumirDecomisos: engine.resumirDecomisos,
  getResumenDecomisos: engine.getResumenDecomisos,
  getDashboardData: engine.getDashboardData,
  getHistorialPDF: engine.getHistorialPDF,
  limpiarResumen: engine.limpiarResumen,
  generarPDFDecomisos: engine.generarPDFDecomisos,
  procesarDespachos: engine.procesarDespachos,
  getResumenDespachoActual: engine.getResumenDespachoActual,
  getDetallesPuesto: engine.getDetallesPuesto,
  limpiarDespachos: engine.limpiarDespachos,
  getPuestosCrudas: engine.getPuestosCrudas,
  getInformeDatos: engine.getInformeDatos,
  guardarInformeDatos: engine.guardarInformeDatos,
  limpiarInformeDatos: engine.limpiarInformeDatos,
  generarInformeHTML: engine.generarInformeHTML,
  getProgresoOPL: engine.getProgresoOPL,
  calcularProgresoOPL: engine.calcularProgresoOPL,
  getOplConfig: engine.getOplConfig,
  getOplPorPropietario: engine.getOplPorPropietario,
  upsertOpl: engine.upsertOpl,
  eliminarOpl: engine.eliminarOpl,
  importarExcelAdicionales: engine.importarExcelAdicionales,
  importarAdicionales: engine.importarAdicionales,
  getResumenAdicionales: engine.getResumenAdicionales,
  getCrudasDetalle: engine.getCrudasDetalle,
  consolidarDatos: engine.consolidarDatos,
  getListaOPLsParaPlanilla: engine.getListaOPLsParaPlanilla,
  generarPlanillaPuntos: engine.generarPlanillaPuntos,
  generarHTMLPlanillaPDF: engine.generarHTMLPlanillaPDF,
  cerrarOperacion: engine.cerrarOperacion,
  getKPIs: engine.getKPIs,
  getAniosDisponibles: engine.getAniosDisponibles,
  getListaOPLsHistorico: engine.getListaOPLsHistorico,
  generarReporteOPL: engine.generarReporteOPL,
  getResumenTodosOPLs: engine.getResumenTodosOPLs,
  getPlazas: engine.getPlazas,
  insertarPlazaPorZona: engine.insertarPlazaPorZona,
  insertarPlaza: engine.insertarPlaza,
  modificarPlaza: engine.modificarPlaza,
  eliminarPlaza: engine.eliminarPlaza,
  prepararModuloDecomisosDesdeSIRT: engine.prepararModuloDecomisosDesdeSIRT,
  prepararModuloDespachosDesdeSIRT: engine.prepararModuloDespachosDesdeSIRT,
};

export async function dispatchRpc(method, args) {
  const fn = handlers[method];
  if (!fn) {
    return { _error: 'Método RPC no implementado: ' + method };
  }
  try {
    const result = await fn.apply(null, args);
    return result;
  } catch (e) {
    return { _error: e.message || String(e) };
  }
}
