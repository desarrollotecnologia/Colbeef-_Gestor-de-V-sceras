/**
 * Cálculos OPL de la API REST basada en DTO.
 *
 * Nota: esta implementación conserva el modelo histórico basado en vísceras
 * rojas. El flujo operativo principal de `gestor/engine.js` calcula juegos
 * completos y valida salidas físicas mediante `fecha_salida`.
 */
import { codigoBase, OPL_DEFAULT } from './helpers.js';

/**
 * Cuenta un animal una sola vez por propietario usando su víscera roja en cava.
 *
 * @param {Array<object>} filasCava Productos normalizados en cava.
 * @returns {Record<string, number>} Conteo por propietario en mayúsculas.
 */
export function contarVRPorPropietario(filasCava) {
  const conteo = {};
  const vistos = new Set();
  for (const f of filasCava) {
    if (String(f.descripcion || '').trim() !== 'Visceras Rojas') continue;
    const base = codigoBase(f.codigo);
    if (!base || vistos.has(base)) continue;
    vistos.add(base);
    const key = String(f.cliente || '').trim().toUpperCase();
    conteo[key] = (conteo[key] || 0) + 1;
  }
  return conteo;
}

/**
 * Cuenta animales pendientes por propietario para un turno.
 *
 * La deduplicación se hace por código base para evitar contar varias piezas
 * pertenecientes al mismo animal.
 */
export function contarVRPendientesPorPropietario(filasDespachos, turno) {
  const pendientes = {};
  const vistos = new Set();
  for (const f of filasDespachos) {
    if (String(f.tipoProducto || '').trim() !== 'Visceras Rojas') continue;
    if (turno && !String(f.puesto || '').includes(turno)) continue;
    const base = codigoBase(f.codigo);
    if (!base || vistos.has(base)) continue;
    vistos.add(base);
    const key = String(f.propietario || '').trim().toUpperCase();
    pendientes[key] = (pendientes[key] || 0) + 1;
  }
  return pendientes;
}

/**
 * Consolida propietarios bajo su OPL y calcula total, pendiente y porcentaje.
 *
 * @param {Record<string, number>} conteoInicial Meta inicial por propietario.
 * @param {Record<string, number>} pendientes Pendientes actuales por propietario.
 * @param {Record<string, string>} mapaOpl Relación propietario → OPL.
 */
export function calcularProgreso(conteoInicial, pendientes, mapaOpl) {
  const porOpl = {};
  for (const [prop, total] of Object.entries(conteoInicial)) {
    const opl = mapaOpl[prop] || OPL_DEFAULT;
    if (!porOpl[opl]) porOpl[opl] = { total: 0, pendientes: 0 };
    porOpl[opl].total += total;
    porOpl[opl].pendientes += Math.min(pendientes[prop] || 0, total);
  }
  return Object.entries(porOpl)
    .map(([opl, d]) => ({
      opl,
      total: d.total,
      despachados: Math.max(0, d.total - d.pendientes),
      pendientes: d.pendientes,
      progreso: d.total > 0 ? Math.round(((d.total - d.pendientes) / d.total) * 100) : 100,
    }))
    .sort((a, b) => b.pendientes - a.pendientes);
}
