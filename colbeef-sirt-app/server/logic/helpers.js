// "2602-06503-60K" -> "2602-06503" (elimina el ultimo segmento)
export function codigoBase(id) {
  const s = String(id || '')
    .trim()
    .replace(/[^0-9\-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
}

// Detecta turno leyendo los puestos: gana el turno con mas apariciones.
// Fallback: dia de la semana actual.
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

// "5423/MercaPublico/LxM//Cra 5 #23" -> "5423"
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

export const OPL_DEFAULT = 'TRANSCARNES';
