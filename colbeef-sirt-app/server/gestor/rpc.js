import * as engine from './engine.js';
import * as informe from './informe.js';

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
  getInformeDatos: informe.getInformeDatos,
  guardarInformeDatos: informe.guardarInformeDatos,
  limpiarInformeDatos: informe.limpiarInformeDatos,
  generarInformeHTML: informe.generarInformeHTML,
  guardarFechaInicioOperacion: engine.guardarFechaInicioOperacion,
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
  prepararPlanillaDesdeSIRT: engine.prepararPlanillaDesdeSIRT,
  getListaOPLsParaPlanilla: engine.getListaOPLsParaPlanilla,
  generarPlanillaPuntos: engine.generarPlanillaPuntos,
  generarHTMLPlanillaPDF: engine.generarHTMLPlanillaPDF,
  cerrarOperacion: engine.cerrarOperacion,
  getResumenTodosOPLs: engine.getResumenTodosOPLs,
  getPlazas: engine.getPlazas,
  insertarPlazaPorZona: engine.insertarPlazaPorZona,
  insertarPlaza: engine.insertarPlaza,
  modificarPlaza: engine.modificarPlaza,
  eliminarPlaza: engine.eliminarPlaza,
  prepararModuloDecomisosDesdeSIRT: engine.prepararModuloDecomisosDesdeSIRT,
  prepararModuloDespachosDesdeSIRT: engine.prepararModuloDespachosDesdeSIRT,
  sincronizarSesionDesdeSirtPorFecha: engine.sincronizarSesionDesdeSirtPorFecha,
  consultarEnCavaDesdeSIRT: engine.consultarEnCavaDesdeSIRT,
  consultarSalidasCavaDesdeSIRT: engine.consultarSalidasCavaDesdeSIRT,
  consultarDecomisosDesdeSIRT: engine.consultarDecomisosDesdeSIRT,
  consultarCruceDecomisosPreview: engine.consultarCruceDecomisosPreview,
  consultarDespachosPreview: engine.consultarDespachosPreview,
  getOperacionEnVivo: engine.getOperacionEnVivo,
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
