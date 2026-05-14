import { PREFIJOS_TURNO, TURNO_POR_DIA } from './constants.js';

export function codigoBase(id) {
  const s = String(id ?? '')
    .trim()
    .replace(/[^0-9\-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
}

/**
 * Cruce Estado_Cavas ↔ Reporte_Decomisos (Apps Script comparaba strings del Excel;
 * en SIRT suele variar mayúsculas o sufijo de lote).
 */
export function normalizeProductIdForDecomisoCruce(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/** Mapa id → producto/subproducto del reporte (varias claves por fila para tolerar formato). */
export function construirMapaReporteDecomisos(reporteFilas) {
  const mapa = {};
  (reporteFilas || []).forEach((fila) => {
    const id = String(fila[0] ?? '').trim();
    if (!id) return;
    const prod = fila[2];
    const k = normalizeProductIdForDecomisoCruce(id);
    if (k) mapa[k] = prod;
    const base = codigoBase(id);
    if (base) {
      const kb = normalizeProductIdForDecomisoCruce(base);
      if (kb && kb !== k) mapa[kb] = prod;
    }
  });
  return mapa;
}

export function productoDecomisoDesdeMapa(mapa, idEstadoRaw) {
  const id = String(idEstadoRaw ?? '').trim();
  if (!id) return undefined;
  const k = normalizeProductIdForDecomisoCruce(id);
  if (mapa[k] !== undefined) return mapa[k];
  const base = codigoBase(id);
  if (!base) return undefined;
  const kb = normalizeProductIdForDecomisoCruce(base);
  return mapa[kb];
}

export function mapTipoProductoNombre(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('cabeza')) return 'Cabeza';
  if (n.includes('pata') || n.includes('mano')) return 'Patas y Manos';
  if (n.includes('blanc')) return 'Visceras Blancas';
  if (n.includes('roj')) return 'Visceras Rojas';
  if (n.includes('visc')) return 'Visceras Rojas';
  return 'Visceras Rojas';
}

export function esCruda(valor) {
  const v = String(valor ?? '')
    .trim()
    .toUpperCase();
  if (!v) return false;
  if (v === 'CRUDAS') return true;
  if (v.indexOf('CRUDAS') === 0) return true;
  return false;
}

export function extraerPuesto(destinoRaw) {
  if (!destinoRaw) return '';
  let d = String(destinoRaw).trim();
  PREFIJOS_TURNO.forEach((p) => {
    const regex = new RegExp(p.replace(/\//g, '\\/'), 'gi');
    d = d.replace(regex, '');
  });
  const index = d.indexOf('/');
  let puesto = index !== -1 ? d.substring(0, index).trim() : d.trim();
  if (/^\d+$/.test(puesto)) puesto = String(parseInt(puesto, 10));
  return puesto;
}

export function detectarTurnoPorDia() {
  return TURNO_POR_DIA[new Date().getDay()] || 'SxD';
}

/** Turno sugerido según el día de la semana de una fecha ISO (AAAA-MM-DD), p. ej. histórico SIRT. */
export function detectarTurnoPorFechaISO(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return detectarTurnoPorDia();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return detectarTurnoPorDia();
  return TURNO_POR_DIA[d.getDay()] || 'SxD';
}

export function detectarTurnoDesdeDatos(rows) {
  const turnos = ['SxD', 'VxS', 'JxV', 'MxJ', 'MxM', 'LxM', 'DxL'];
  const conteo = {};
  turnos.forEach((t) => {
    conteo[t] = 0;
  });
  const muestra = rows.slice(0, 500);
  muestra.forEach((fila) => {
    const puesto = String(fila[9] ?? '').trim();
    turnos.forEach((t) => {
      if (puesto.includes(t)) conteo[t]++;
    });
  });
  let ganador = detectarTurnoPorDia();
  let max = 0;
  turnos.forEach((t) => {
    if (conteo[t] > max) {
      max = conteo[t];
      ganador = t;
    }
  });
  return ganador;
}
