/**
 * Almacén del estado operativo del gestor.
 *
 * Preferencia: MySQL (`gestor_state.payload`). Si MySQL no está listo, JSON local.
 * SIRT sigue siendo la fuente de verdad de negocio; aquí solo sesión, OPL, plazas,
 * baselines, informes e historial local de respaldo.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { OPL_EXCEPCIONES_DEFAULT } from './constants.js';
import { gestorQuery, isGestorMysqlReady } from '../gestorDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, '..', 'data', 'gestor-state.json');

function defaultOplConfig() {
  return OPL_EXCEPCIONES_DEFAULT.map(([propietario, opl]) => ({
    propietario: propietario.toUpperCase(),
    opl,
    total: 0,
  }));
}

/** Incorpora excepciones nuevas del código sin borrar totales ya guardados. */
function asegurarOplExcepcionesEnConfig(s) {
  if (!s.oplConfig) s.oplConfig = defaultOplConfig();
  const known = new Set(s.oplConfig.map((r) => String(r.propietario || '').trim().toUpperCase()));
  OPL_EXCEPCIONES_DEFAULT.forEach(([propietario, opl]) => {
    const upper = propietario.toUpperCase();
    if (known.has(upper)) return;
    s.oplConfig.push({ propietario: upper, opl, total: 0 });
    known.add(upper);
  });
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
    oplBaselineBuild: '',
    /** Totales congelados del tablero (En cava / Decomisos / Crudas) por fecha+turno. */
    despachoKpiBaseline: {
      fecha: '',
      turno: '',
      juegosBases: [],
      decomisoBases: [],
      crudasBases: [],
    },
    /** Total fijo de juegos a despachar por OPL (baseline del día). */
    oplTotalsJuego: {},
    oplTotalsJuegoCompleto: {},
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

function normalizeState(raw) {
  const s = { ...defaultState(), ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!s.oplConfig || !s.oplConfig.length) s.oplConfig = defaultOplConfig();
  else asegurarOplExcepcionesEnConfig(s);
  if (!s.oplTotalsJuego) s.oplTotalsJuego = {};
  if (!s.oplTotalsJuegoCompleto) s.oplTotalsJuegoCompleto = {};
  if (!s.despachoKpiBaseline || typeof s.despachoKpiBaseline !== 'object') {
    s.despachoKpiBaseline = defaultState().despachoKpiBaseline;
  }
  if (!s.plazasMap || typeof s.plazasMap !== 'object') s.plazasMap = {};
  delete s.oplTotalsSubproducto;
  return s;
}

function parseMysqlPayload(payload) {
  if (payload == null) return null;
  if (typeof payload === 'object') return payload;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return null;
}

async function readStateFromJsonFile() {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeStateToJsonFile(s) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2), 'utf8');
}

async function readStateFromMysql() {
  const rows = await gestorQuery('SELECT payload FROM gestor_state WHERE id = 1 LIMIT 1');
  if (!rows.length) return null;
  const parsed = parseMysqlPayload(rows[0].payload);
  if (!parsed) return null;
  return normalizeState(parsed);
}

async function writeStateToMysql(s, updatedBy = null) {
  const json = JSON.stringify(s);
  await gestorQuery(
    `INSERT INTO gestor_state (id, payload, updated_by)
     VALUES (1, CAST(? AS JSON), ?)
     ON DUPLICATE KEY UPDATE
       payload = VALUES(payload),
       updated_by = VALUES(updated_by)`,
    [json, updatedBy ? String(updatedBy).slice(0, 120) : null]
  );
}

/**
 * Carga el estado una vez y completa campos nuevos con valores por defecto.
 * Prioridad: MySQL → JSON → sesión vacía.
 */
export async function loadState() {
  if (cache) return cache;

  if (isGestorMysqlReady()) {
    try {
      const fromMysql = await readStateFromMysql();
      if (fromMysql) {
        cache = fromMysql;
        return cache;
      }
      const fromJson = await readStateFromJsonFile();
      if (fromJson) {
        cache = fromJson;
        try {
          await writeStateToMysql(cache, 'migracion-json');
          console.log('[gestor-state] JSON migrado a MySQL (gestor_state)');
        } catch (e) {
          console.warn('[gestor-state] No se pudo migrar JSON → MySQL:', e.message);
        }
        return cache;
      }
      cache = defaultState();
      return cache;
    } catch (e) {
      console.warn('[gestor-state] Lectura MySQL falló, usando JSON:', e.message);
    }
  }

  const fromJson = await readStateFromJsonFile();
  cache = fromJson || defaultState();
  return cache;
}

/**
 * Actualiza la caché y persiste en MySQL (preferido) y/o JSON de respaldo.
 * @param {object} s
 * @param {{ updatedBy?: string }} [opts]
 */
export async function saveState(s, opts = {}) {
  cache = s;
  const updatedBy = opts.updatedBy || null;

  let mysqlOk = false;
  if (isGestorMysqlReady()) {
    try {
      await writeStateToMysql(s, updatedBy);
      mysqlOk = true;
    } catch (e) {
      console.warn('[gestor-state] Guardado MySQL falló, se usa JSON:', e.message);
    }
  }

  // Respaldo local siempre (o fuente principal si MySQL no está listo).
  try {
    await writeStateToJsonFile(s);
  } catch (e) {
    if (!mysqlOk) throw e;
    console.warn('[gestor-state] Respaldo JSON falló (MySQL OK):', e.message);
  }
}

/**
 * Importa `gestor-state.json` a MySQL solo si la fila aún no existe.
 * Idempotente; seguro llamar en cada arranque.
 */
export async function migrateGestorStateJsonToMysql() {
  if (!isGestorMysqlReady()) return { ok: false, skipped: true };

  try {
    const existing = await readStateFromMysql();
    if (existing) {
      console.log('[gestor-state] MySQL ya tiene estado; no se sobrescribe desde JSON');
      return { ok: true, imported: false, reason: 'already-present' };
    }

    const fromJson = await readStateFromJsonFile();
    if (!fromJson) {
      return { ok: true, imported: false, reason: 'no-json' };
    }

    await writeStateToMysql(fromJson, 'migracion-arranque');
    if (!cache) cache = fromJson;
    console.log('[gestor-state] Migrado gestor-state.json → MySQL (OPL, plazas, sesión)');
    return { ok: true, imported: true };
  } catch (e) {
    console.warn('[gestor-state] Migración JSON → MySQL falló:', e.message);
    return { ok: false, error: e.message };
  }
}

/** Acceso de diagnóstico a la referencia actualmente almacenada en memoria. */
export function getCache() {
  return cache;
}
