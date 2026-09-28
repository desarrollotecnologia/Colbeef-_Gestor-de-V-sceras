/**
 * Corre el motor local con las salidas reales de un día (vía API del gestor), día ya cerrado.
 * node scripts/verificar-dia-motor.mjs 2026-09-26 SxD [http://192.168.20.205:3001]
 */
import { construirProgresoOplDesdeDespachos } from '../server/gestor/engine.js';

const fecha = process.argv[2] || '2026-09-26';
const turno = process.argv[3] || 'SxD';
const host = process.argv[4] || 'http://192.168.20.205:3001';

const res = await fetch(`${host}/api/rpc`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ method: 'consultarSalidasFisicasDesdeSIRT', args: [{ from: fecha, to: fecha }] }),
});
const json = await res.json();
const filas = (json.result || json).filas || [];
const salidas = filas.map((f) => [
  f.fechaSalida, f.fechaIngreso, f.riel, f.codigo, f.propietario, f.pesoPie,
  f.cava, f.tipoProducto, f.destino, f.puesto, f.codigoNuevaSucursal, '', f.observaciones,
]);

const s = {
  lastSyncRange: { from: fecha, to: fecha },
  despachosCavas: [],
  salidasCavaDia: salidas,
  estadoFromRow12: [],
  oplConfig: [],
  oplTotalsJuego: {},
  oplTotalsJuegoCompleto: {},
};
const pack = construirProgresoOplDesdeDespachos(s, turno, fecha);
console.log({
  filasSalida: salidas.length,
  meta: pack.totalJuegos,
  antes: pack.juegosSalidaAntes,
  adicionales: pack.juegosSalidaAdicionales,
  incompletos: pack.totalIncompletos,
  pendientes: pack.totalPendientes,
});
