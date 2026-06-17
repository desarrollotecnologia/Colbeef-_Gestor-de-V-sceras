/** Configuración por defecto de cavas (misma estructura que Excel / App Script). */
export const CAVAS_DEFAULT = [
  { grupo: 'V. Rojas & Blancas (V.Rojas)', carros: 40, capPorCarro: 20, inventario: 0 },
  { grupo: 'V. Rojas & Blancas (V.Blancas)', carros: 22, capPorCarro: 25, inventario: 0 },
  { grupo: 'V. Acondicionamiento', carros: 22, capPorCarro: 25, inventario: 0 },
  { grupo: 'Patas & Manos', carros: 80, capPorCarro: 9, inventario: 0 },
  { grupo: 'Cabezas', carros: 80, capPorCarro: 9, inventario: 0 },
];

const GRUPO_VR = 'V. Rojas & Blancas (V.Rojas)';
const GRUPO_VB = 'V. Rojas & Blancas (V.Blancas)';
const GRUPO_ACOND = 'V. Acondicionamiento';
const GRUPO_PM = 'Patas & Manos';
const GRUPO_CAB = 'Cabezas';

export function inventarioGrupo(cavas, grupo) {
  const row = (cavas || []).find((c) => String(c.grupo || '').trim() === grupo);
  return Number(row?.inventario || 0);
}

/**
 * Juegos equivalentes (planta / Excel):
 * 4 familias → VR, (VB + Acondicionamiento), Patas, Cabezas;
 * mínimo = juegos completos; exceso de cada familia aporta 25 %.
 */
export function calcularJuegosEquivalentes(cavas) {
  const vRojas = inventarioGrupo(cavas, GRUPO_VR);
  const totalBlancas = inventarioGrupo(cavas, GRUPO_VB) + inventarioGrupo(cavas, GRUPO_ACOND);
  const patasManos = inventarioGrupo(cavas, GRUPO_PM);
  const cabezas = inventarioGrupo(cavas, GRUPO_CAB);
  const partes = [vRojas, totalBlancas, patasManos, cabezas];
  const minJ = Math.min(...partes);
  let totalJ = minJ;
  partes.forEach((p) => {
    if (p > minJ) totalJ += (p - minJ) * 0.25;
  });
  const juegosEquivalentes = Math.round(totalJ * 4) / 4;
  return {
    vRojas,
    totalBlancas,
    patasManos,
    cabezas,
    partes,
    minJ,
    juegosEquivalentes,
  };
}

export function calcularTotalesCavas(cavas) {
  let capacidadTotal = 0;
  let inventarioPiezas = 0;
  (cavas || []).forEach((c) => {
    const carros = Number(c.carros || 0);
    const capPor = Number(c.capPorCarro || 0);
    capacidadTotal += carros * capPor;
    inventarioPiezas += Number(c.inventario || 0);
  });
  const ocupacionPct =
    capacidadTotal > 0 ? Math.round((inventarioPiezas / capacidadTotal) * 100) : 0;
  const eq = calcularJuegosEquivalentes(cavas);
  return {
    capacidadTotal,
    inventarioPiezas,
    ocupacionPct,
    juegosEquivalentes: eq.juegosEquivalentes,
    partes: eq.partes,
    minJuegos: eq.minJ,
  };
}

export function participacionFila(c) {
  const cap = Number(c.carros || 0) * Number(c.capPorCarro || 0);
  const inv = Number(c.inventario || 0);
  return cap > 0 ? Math.round((inv / cap) * 100) : 0;
}

/** Piezas en cava por subproducto (estado SIRT fila [1]=tipo). */
export function inventarioCavasDesdeEstado(filasEstado) {
  const counts = {
    [GRUPO_VR]: 0,
    [GRUPO_VB]: 0,
    [GRUPO_ACOND]: 0,
    [GRUPO_PM]: 0,
    [GRUPO_CAB]: 0,
  };
  (filasEstado || []).forEach((fila) => {
    const tipo = String(fila[1] ?? '').trim();
    if (tipo === 'Visceras Rojas') counts[GRUPO_VR]++;
    else if (tipo === 'Visceras Blancas') counts[GRUPO_VB]++;
    else if (tipo === 'Patas y Manos') counts[GRUPO_PM]++;
    else if (tipo === 'Cabeza') counts[GRUPO_CAB]++;
  });
  return counts;
}

export function fusionarInventarioSirtEnCavas(cavas, filasEstado, opts = {}) {
  const base = (cavas || []).map((c) => ({ ...c }));
  const counts = inventarioCavasDesdeEstado(filasEstado);
  const manual = base.some((c) => Number(c.inventario || 0) > 0);
  if (manual && !opts.forzar) return { cavas: base, desdeSirt: false };

  base.forEach((c) => {
    const g = String(c.grupo || '').trim();
    if (g === GRUPO_ACOND && opts.beneficioDia != null) {
      c.inventario = Number(opts.beneficioDia) || 0;
    } else if (counts[g] != null) {
      c.inventario = counts[g];
    }
  });
  return { cavas: base, desdeSirt: true };
}
