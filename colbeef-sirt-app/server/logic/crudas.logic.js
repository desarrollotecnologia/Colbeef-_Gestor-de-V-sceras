/** Detección de vísceras blancas crudas para las respuestas REST normalizadas. */
import { codigoBase, extraerPuesto } from './helpers.js';

/** Acepta `CRUDAS` y observaciones cuyo texto comienza por esa palabra. */
function esCruda(val) {
  const v = String(val || '').trim().toUpperCase();
  return v === 'CRUDAS' || v.startsWith('CRUDAS');
}

/**
 * Detecta animales únicos con víscera blanca cruda y los agrupa por puesto.
 *
 * @param {Array<object>} filasCava Productos en cava normalizados.
 * @returns {{total:number,codigos:string[],porPuesto:Array<object>}}
 */
export function detectarCrudas(filasCava) {
  const codigosUnicos = new Set();
  const porPuesto = {};
  for (const f of filasCava) {
    if (String(f.descripcion || '').trim() !== 'Visceras Blancas') continue;
    if (!esCruda(f.observacion)) continue;
    const base = codigoBase(f.codigo);
    if (!base || codigosUnicos.has(base)) continue;
    codigosUnicos.add(base);
    const puesto = extraerPuesto(f.destino);
    if (!porPuesto[puesto]) porPuesto[puesto] = { cantidad: 0, codigos: [] };
    porPuesto[puesto].cantidad++;
    porPuesto[puesto].codigos.push(base);
  }
  return {
    total: codigosUnicos.size,
    codigos: [...codigosUnicos],
    porPuesto: Object.entries(porPuesto).map(([puesto, d]) => ({ puesto, ...d })),
  };
}

/**
 * Cruza los animales crudos en cava con sus rutas de despacho del turno.
 *
 * @returns {Set<string>} Rutas de puestos que contienen al menos una VB cruda.
 */
export function setPuestosCrudas(filasCava, filasDespachos, turno) {
  const { codigos } = detectarCrudas(filasCava);
  const setCodigos = new Set(codigos);
  const puestos = new Set();
  for (const f of filasDespachos) {
    if (String(f.tipoProducto || '').trim() !== 'Visceras Blancas') continue;
    if (turno && !String(f.puesto || '').includes(turno)) continue;
    if (setCodigos.has(codigoBase(f.codigo))) puestos.add(String(f.puesto || ''));
  }
  return puestos;
}
