/**
 * Lista blanca de métodos disponibles para la interfaz heredada.
 *
 * `google-script-shim.js` envía `{ method, args }` a `/api/rpc`; únicamente los
 * nombres registrados aquí pueden ejecutarse en el servidor.
 */
import * as engine from './engine.js';
import * as informe from './informe.js';
import { recordAuditoria } from './mysqlSchema.js';

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
  calcularTotalesInformeCavas: informe.calcularTotalesInformeCavas,
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

/** Métodos que modifican estado o generan documentos — se auditan en MySQL. */
const AUDIT_METHODS = new Set([
  'cerrarOperacion',
  'limpiarResumen',
  'limpiarDespachos',
  'limpiarInformeDatos',
  'generarPDFDecomisos',
  'procesarDespachos',
  'prepararModuloDespachosDesdeSIRT',
  'prepararModuloDecomisosDesdeSIRT',
  'sincronizarSesionDesdeSirtPorFecha',
  'calcularProgresoOPL',
  'upsertOpl',
  'eliminarOpl',
  'importarExcelAdicionales',
  'importarAdicionales',
  'guardarInformeDatos',
  'guardarFechaInicioOperacion',
  'insertarPlaza',
  'insertarPlazaPorZona',
  'modificarPlaza',
  'eliminarPlaza',
  'consolidarDatos',
  'prepararPlanillaDesdeSIRT',
]);

function moduleForMethod(method) {
  const m = String(method || '');
  if (/decomiso/i.test(m)) return 'decomisos';
  if (/despacho/i.test(m)) return 'despachos';
  if (/opl/i.test(m)) return 'opl';
  if (/plaza|planilla|consolidar/i.test(m)) return 'planilla';
  if (/informe/i.test(m)) return 'informe';
  if (/adicional/i.test(m)) return 'adicionales';
  if (/sirt|sincronizar/i.test(m)) return 'sirt';
  if (/limpiar|cerrar/i.test(m)) return 'operacion';
  return 'gestor';
}

/**
 * Ejecuta un método RPC permitido y convierte excepciones al contrato `_error`
 * esperado por los manejadores `withFailureHandler` del cliente.
 * @param {string} method
 * @param {any[]} args
 * @param {{ usuario?: string, ip?: string, userAgent?: string }} [auditCtx]
 */
export async function dispatchRpc(method, args, auditCtx = {}) {
  const fn = handlers[method];
  if (!fn) {
    return { _error: 'Método RPC no implementado: ' + method };
  }
  try {
    let callArgs = Array.isArray(args) ? args : [];
    if (String(method) === 'generarPDFDecomisos') {
      callArgs = [{ usuario: auditCtx.usuario || 'anonimo' }];
    }
    const result = await fn.apply(null, callArgs);
    if (AUDIT_METHODS.has(String(method)) && !(result && result._error)) {
      const ok = result && typeof result === 'object' && 'success' in result ? !!result.success : true;
      void recordAuditoria(
        {
          usuario: auditCtx.usuario || 'anonimo',
          accion: String(method),
          modulo: moduleForMethod(method),
          detalle: ok ? 'ok' : 'success=false',
          meta: { ok },
        },
        { ip: auditCtx.ip, userAgent: auditCtx.userAgent }
      );
    }
    return result;
  } catch (e) {
    if (AUDIT_METHODS.has(String(method))) {
      void recordAuditoria(
        {
          usuario: auditCtx.usuario || 'anonimo',
          accion: String(method),
          modulo: moduleForMethod(method),
          detalle: `error: ${e.message || e}`,
          meta: { ok: false },
        },
        { ip: auditCtx.ip, userAgent: auditCtx.userAgent }
      );
    }
    return { _error: e.message || String(e) };
  }
}
