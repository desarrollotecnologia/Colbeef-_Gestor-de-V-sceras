/**
 * Utilidades compartidas por la capa REST normalizada.
 * El motor compatible con Apps Script posee equivalentes en `engineUtils.js`.
 */

/** Normaliza un ID y elimina el último segmento: 2602-06503-60K → 2602-06503. */
export function codigoBase(id) {
  const s = String(id || '')
    .trim()
    .replace(/[^0-9\-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
}

/**
 * Detecta el turno predominante en las rutas de puesto.
 * Si ninguna ruta contiene turno, usa el correspondiente al día actual.
 */
export function detectarTurno(puestos = []) {
  const TURNOS = ['SxD', 'VxS', 'JxV', 'MxJ', 'MxM', 'LxM', 'DxL'];
  const DIA_TURNO = { 0: 'DxL', 1: 'LxM', 2: 'MxM', 3: 'MxJ', 4: 'JxV', 5: 'VxS', 6: 'SxD' };
  const conteo = Object.fromEntries(TURNOS.map((t) => [t, 0]));
  for (const p of puestos) TURNOS.forEach((t) => {
    if (String(p || '').includes(t)) conteo[t]++;
  });
  let ganador = DIA_TURNO[new Date().getDay()];
  let max = 0;
  TURNOS.forEach((t) => {
    if (conteo[t] > max) {
      max = conteo[t];
      ganador = t;
    }
  });
  return ganador;
}

/** Prefijos de turno que se retiran antes de extraer el código del puesto. */
const PREFIJOS = [
  '/LxM/',
  '/MxM/',
  '/MxJ/',
  '/JxV/',
  '/VxS/',
  '/SxD/',
  '/DxL/',
  '/LXM/',
  '/MXM/',
  '/MXJ/',
  '/JXV/',
  '/VXS/',
  '/SXD/',
  '/DXL/',
];

export function extraerPuesto(destinoRaw) {
  let d = String(destinoRaw || '').trim();
  for (const p of PREFIJOS) d = d.replace(new RegExp(p.replace(/\//g, '\\/'), 'gi'), '');
  const idx = d.indexOf('/');
  let puesto = idx !== -1 ? d.substring(0, idx).trim() : d.trim();
  if (/^\d+$/.test(puesto)) puesto = String(parseInt(puesto, 10));
  return puesto;
}

/** OPL usado cuando un propietario no tiene una excepción configurada. */
export const OPL_DEFAULT = 'TRANSCARNES';
