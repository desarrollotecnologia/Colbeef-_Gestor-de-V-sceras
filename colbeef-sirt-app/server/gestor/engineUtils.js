import { PREFIJOS_TURNO, TURNO_POR_DIA } from './constants.js';

export function codigoBase(id) {
  const s = String(id ?? '')
    .trim()
    .replace(/[^0-9\-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
}

/** Clave animal+tipo para fila Estado_Cavas (cols 0=id, 1=tipo). */
export function claveSubproductoEstado(fila) {
  const id = String(fila[0] ?? '').trim();
  const tipo = String(fila[1] ?? '').trim();
  const base = codigoBase(id);
  if (!base || !tipo) return '';
  return `${base}|${tipo}`;
}

/** Clave animal+tipo para fila Despachos_Cavas (cols 3=id, 7=tipo). */
export function claveSubproductoSalida(fila) {
  const id = String(fila[3] ?? '').trim();
  const tipo = String(fila[7] ?? '').trim();
  const base = codigoBase(id);
  if (!base || !tipo) return '';
  return `${base}|${tipo}`;
}

/** Subproductos que ya registraron salida de cava (mismo día consultado). */
export function construirSetSalidasDelDia(despachosCavas) {
  const salidas = new Set();
  (despachosCavas || []).forEach((fila) => {
    const k = claveSubproductoSalida(fila);
    if (k) salidas.add(k);
  });
  return salidas;
}

/** Programación en cava sin piezas que ya tienen fecha_salida (evita doble conteo OPL). */
export function despachosProgramadosSinSalidasDelDia(programados, salidasDelDia) {
  const salidas = construirSetSalidasDelDia(salidasDelDia);
  if (!salidas.size) return programados || [];
  return (programados || []).filter((fila) => {
    const k = claveSubproductoSalida(fila);
    return !k || !salidas.has(k);
  });
}

/**
 * Quita del stock en cava los subproductos que ya aparecen en salidas del día
 * (evita doble conteo cuando SIRT aún no actualizó fecha_salida).
 */
export function estadoEnCavaSinSalidasDelDia(estadoFromRow12, despachosCavas) {
  const salidas = construirSetSalidasDelDia(despachosCavas);
  if (!salidas.size) return estadoFromRow12 || [];
  return (estadoFromRow12 || []).filter((fila) => {
    const k = claveSubproductoEstado(fila);
    return !k || !salidas.has(k);
  });
}

/** Solo restar del stock en cava cuando despachos = salida física (fecha_salida), no programación. */
export function despachosRestanDeStockEnCava() {
  const fuente = String(process.env.SIRT_DESPACHOS_FUENTE || 'programado').toLowerCase();
  return fuente === 'riel' || fuente === 'cava_riel';
}

export function aplicarEstadoEnCavaNeto(estadoBruto, despachosCavas) {
  if (despachosRestanDeStockEnCava()) {
    return estadoEnCavaSinSalidasDelDia(estadoBruto, despachosCavas);
  }
  return estadoBruto || [];
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

function mergeUniqueList(a, b) {
  const out = [...(a || [])];
  (b || []).forEach((x) => {
    const s = String(x || '').trim();
    if (s && !out.includes(s)) out.push(s);
  });
  return out;
}

/**
 * Mapa animal (id normalizado / base) → tipos decomisados, subproducto y parte (puesto SAI).
 */
export function construirMapaDecomisosPorAnimal(reporteFilas) {
  const mapa = {};
  (reporteFilas || []).forEach((fila) => {
    const id = String(fila[0] ?? '').trim();
    const subproducto = String(fila[2] ?? '').trim();
    const parte = String(fila[6] ?? '').trim();
    const causa = String(fila[4] ?? '').trim();
    if (!id) return;
    const tipoDec = mapTipoProductoNombre(subproducto || parte);
    const claves = [normalizeProductIdForDecomisoCruce(id)];
    const base = codigoBase(id);
    const kb = base ? normalizeProductIdForDecomisoCruce(base) : '';
    if (kb && kb !== claves[0]) claves.push(kb);
    claves.forEach((k) => {
      if (!k) return;
      if (!mapa[k]) {
        mapa[k] = { tipos: new Set(), subproductos: [], partes: [], productos: [], causas: [] };
      }
      mapa[k].tipos.add(tipoDec);
      if (subproducto && !mapa[k].subproductos.includes(subproducto)) mapa[k].subproductos.push(subproducto);
      if (parte && !mapa[k].partes.includes(parte)) mapa[k].partes.push(parte);
      if (subproducto && !mapa[k].productos.includes(subproducto)) mapa[k].productos.push(subproducto);
      if (parte && parte !== subproducto && !mapa[k].productos.includes(parte)) mapa[k].productos.push(parte);
      if (causa && !mapa[k].causas.includes(causa)) mapa[k].causas.push(causa);
    });
  });
  return mapa;
}

/** Info de decomiso para un ID de salida/cava, o null si no hay. */
export function decomisoInfoDesdeMapa(mapaPorAnimal, idRaw) {
  const id = String(idRaw ?? '').trim();
  if (!id || !mapaPorAnimal) return null;
  const k = normalizeProductIdForDecomisoCruce(id);
  if (mapaPorAnimal[k]) return mapaPorAnimal[k];
  const base = codigoBase(id);
  if (!base) return null;
  return mapaPorAnimal[normalizeProductIdForDecomisoCruce(base)] || null;
}

/** Índice codigo_animal (vw_decomisos) → partes decomisadas del inspector. */
export function construirIndiceDecomisosVw(vwFilas) {
  const porAnimal = new Map();
  (vwFilas || []).forEach((r) => {
    const animal = String(r.codigo_animal ?? '')
      .trim()
      .toLowerCase();
    if (!animal) return;
    if (!porAnimal.has(animal)) {
      porAnimal.set(animal, {
        codigoAnimal: animal,
        tipos: new Set(),
        subproductos: [],
        partes: [],
        productos: [],
        causas: [],
        fuente: 'vw_decomisos',
      });
    }
    const e = porAnimal.get(animal);
    const parte = String(r.tipo_parte ?? r.parte_decomisada ?? '').trim();
    if (parte) {
      const sub = mapTipoProductoNombre(parte);
      e.tipos.add(sub);
      if (!e.partes.includes(parte)) e.partes.push(parte);
      if (sub && !e.subproductos.includes(sub)) e.subproductos.push(sub);
      if (!e.productos.includes(parte)) e.productos.push(parte);
    }
  });
  return porAnimal;
}

/** Cruce pieza en cava: identificacion LIKE codigo_animal% (misma lógica que SQL del usuario). */
export function decomisoInfoDesdeVw(indiceVw, idRaw) {
  if (!indiceVw || indiceVw.size === 0) return null;
  const id = String(idRaw ?? '')
    .trim()
    .toLowerCase();
  if (!id) return null;
  const base = codigoBase(idRaw);
  const baseL = base ? base.toLowerCase() : '';
  if (baseL && indiceVw.has(baseL)) return indiceVw.get(baseL);
  for (const [animal, info] of indiceVw) {
    if (id === animal || id.startsWith(`${animal}-`)) return info;
  }
  return null;
}

/** SAI (reporte) + vw_decomisos: cualquiera que coincida marca decomiso en despacho. */
export function decomisoInfoUnificado(mapaSai, indiceVw, idRaw) {
  const sai = decomisoInfoDesdeMapa(mapaSai, idRaw);
  const vw = decomisoInfoDesdeVw(indiceVw, idRaw);
  if (!sai && !vw) return null;
  if (!sai) return { ...vw, fuentes: ['vw_decomisos'] };
  if (!vw) return { ...sai, fuentes: ['sai'] };
  const tipos = new Set([...sai.tipos, ...vw.tipos]);
  return {
    tipos,
    subproductos: mergeUniqueList(sai.subproductos, vw.subproductos),
    partes: mergeUniqueList(sai.partes, vw.partes),
    productos: mergeUniqueList(sai.productos, vw.productos),
    causas: mergeUniqueList(sai.causas, vw.causas),
    codigoAnimal: vw.codigoAnimal || codigoBase(idRaw),
    fuentes: ['sai', 'vw_decomisos'],
  };
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

const TURNOS_EN_RUTA = ['DxL', 'LxM', 'MxM', 'MxJ', 'JxV', 'VxS', 'SxD'];

/** Descompone ruta SIRT: 01028/CIUDAD/DIRECCION/LxM → código, zona, ruta legible. */
export function parsePuestoOperacion(puestoFull) {
  const raw = String(puestoFull || '').trim();
  const parts = raw.split('/').map((p) => p.trim()).filter(Boolean);
  const sinTurno = parts.filter((p) => !TURNOS_EN_RUTA.includes(p));
  let codigo = sinTurno[0] || '';
  if (/^\d+$/.test(codigo)) {
    const n = parseInt(codigo, 10);
    if (Number.isFinite(n)) codigo = String(n);
  }
  const zona = sinTurno[1] ? String(sinTurno[1]).toUpperCase() : '';
  const direccion = sinTurno[2] || '';
  const turno = parts.find((p) => TURNOS_EN_RUTA.includes(p)) || '';
  const etiqueta =
    codigo && zona ? `${codigo} · ${zona}` : codigo || zona || raw.slice(0, 96);
  const ruta = sinTurno.join(' / ');
  const clave =
    codigo && zona
      ? `${codigo.toUpperCase()}|${zona}`
      : codigo
        ? codigo.toUpperCase()
        : String(raw)
            .replace(/\s+/g, ' ')
            .toUpperCase();
  return { codigo, zona, direccion, turno, etiqueta, ruta, rutaCompleta: raw, clave };
}

export function extraerPuesto(destinoRaw) {
  const p = parsePuestoOperacion(destinoRaw);
  return p.codigo || '';
}

/** Clave estable: mismo local + ciudad (no mezclar rutas distintas bajo un solo código). */
export function claveAgrupacionPuesto(destinoRaw) {
  const p = parsePuestoOperacion(destinoRaw);
  if (p.clave) return p.clave;
  return String(destinoRaw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function detectarTurnoPorDia() {
  return TURNO_POR_DIA[new Date().getDay()] || 'SxD';
}

/** PostgreSQL ISODOW: 1 = lunes … 7 = domingo (desde fecha operación AAAA-MM-DD). */
export function isodowDesdeFechaISO(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
    : new Date();
  if (Number.isNaN(d.getTime())) return 1;
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** Turno sugerido según el día de la semana de una fecha ISO (AAAA-MM-DD), p. ej. histórico SIRT. */
export function detectarTurnoPorFechaISO(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return detectarTurnoPorDia();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return detectarTurnoPorDia();
  return TURNO_POR_DIA[d.getDay()] || 'SxD';
}

export function detectarTurnoDesdeDatos(rows, fechaIsoFallback = '') {
  const turnos = ['SxD', 'VxS', 'JxV', 'MxJ', 'MxM', 'LxM', 'DxL'];
  const conteo = {};
  turnos.forEach((t) => {
    conteo[t] = 0;
  });
  const muestra = (rows || []).slice(0, 300);
  muestra.forEach((fila) => {
    const puesto = String(fila[9] ?? fila[8] ?? '').trim();
    turnos.forEach((t) => {
      if (puesto.includes(t)) conteo[t]++;
    });
  });
  let ganador = fechaIsoFallback
    ? detectarTurnoPorFechaISO(fechaIsoFallback)
    : detectarTurnoPorDia();
  let max = 0;
  turnos.forEach((t) => {
    if (conteo[t] > max) {
      max = conteo[t];
      ganador = t;
    }
  });
  return ganador;
}

/** Solo filas cuyo puesto/destino contiene el sufijo del turno (JxV, LxM, …). */
export function filtrarFilasPorTurnoOperacion(filas, turno, colPuesto = 9, colDestino = 8) {
  const t = String(turno || '').trim();
  if (!t) return filas || [];
  return (filas || []).filter((fila) => {
    const puesto = String(fila[colPuesto] ?? '').trim();
    const destino = String(fila[colDestino] ?? '').trim();
    return puesto.includes(t) || destino.includes(t);
  });
}

/**
 * Turno operativo: detectar desde Despachos_Cavas (como Apps Script), luego calendario.
 */
export function resolverTurnoOperacion(range = {}, despachosFilas = [], turnoForzado = '') {
  const t = String(turnoForzado || '').trim();
  if (t) return t;
  const iso = String(range?.from || range?.date || range?.to || '').trim();
  if ((despachosFilas || []).length) {
    return detectarTurnoDesdeDatos(despachosFilas, iso);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return detectarTurnoPorFechaISO(iso);
  return detectarTurnoPorDia();
}
