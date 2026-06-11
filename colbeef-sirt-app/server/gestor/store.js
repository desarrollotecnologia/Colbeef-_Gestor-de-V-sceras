import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { OPL_EXCEPCIONES_DEFAULT } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, '..', 'data', 'gestor-state.json');

function defaultOplConfig() {
  return OPL_EXCEPCIONES_DEFAULT.map(([propietario, opl]) => ({
    propietario: propietario.toUpperCase(),
    opl,
    total: 0,
  }));
}

export function defaultState() {
  return {
    estadoFromRow12: [],
    reporteDecomisos: [],
    decomisosVwFilas: [],
    decomisoVwStats: null,
    decomisoVinculoStats: null,
    resumenRows: [],
    resumenDecomisoMeta: null,
    resumenFechaProc: null,
    despachosCavas: [],
    /** Salidas físicas del día (fecha_salida en SIRT) para progreso OPL. */
    salidasCavaDia: [],
    resumenDespachos: {
      turno: '',
      fechaStr: '',
      totalJuegos: 0,
      resultado: [],
      historicoGuardadoFlag: '',
    },
    oplConfig: defaultOplConfig(),
    oplBaselineFecha: '',
    oplBaselineTurno: '',
    /** Total fijo de subproductos a despachar por OPL (baseline del día). */
    oplTotalsSubproducto: {},
    oplProgreso: [],
    historicoOpl: [],
    consolidado: [],
    plazasMap: {},
    informe: null,
    historialPdf: [],
    fechaInicioOperacion: null,
  };
}

let cache = null;

export async function loadState() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    cache = { ...defaultState(), ...JSON.parse(raw) };
    if (!cache.oplConfig || !cache.oplConfig.length) cache.oplConfig = defaultOplConfig();
    return cache;
  } catch {
    cache = defaultState();
    return cache;
  }
}

export async function saveState(s) {
  cache = s;
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2), 'utf8');
}

export function getCache() {
  return cache;
}
