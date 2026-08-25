/**
 * Catálogo oficial Puesto → Plaza (BD Plazas OPL.xlsx).
 * Se aplica al arrancar si el estado aún no tiene esa versión sembrada.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState, saveState } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, 'plazasCatalog.json');

let cached = null;

export function loadPlazasCatalog() {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const plazasMap = {};
  const src = raw.plazasMap && typeof raw.plazasMap === 'object' ? raw.plazasMap : {};
  Object.keys(src).forEach((puesto) => {
    const p = String(puesto || '').trim();
    const pl = String(src[puesto] || '')
      .trim()
      .toUpperCase();
    if (!p || !pl) return;
    plazasMap[p] = pl;
  });
  cached = {
    version: Number(raw.version) || 1,
    source: String(raw.source || 'plazasCatalog.json'),
    count: Object.keys(plazasMap).length,
    plazasMap,
  };
  return cached;
}

/**
 * Fusiona el catálogo en plazasMap (el Excel gana en esos puestos).
 * Conserva puestos agregados a mano que no estén en el catálogo.
 * Idempotente por plazasCatalogVersion.
 */
export async function seedPlazasCatalogIfNeeded() {
  const catalog = loadPlazasCatalog();
  if (!catalog.count) return { ok: false, skipped: true, reason: 'empty-catalog' };

  const s = await loadState();
  const currentVer = Number(s.plazasCatalogVersion || 0);
  const mapSize = s.plazasMap && typeof s.plazasMap === 'object' ? Object.keys(s.plazasMap).length : 0;

  // Ya sembrado con esta versión y con un mapa razonable → no tocar.
  if (currentVer >= catalog.version && mapSize >= Math.min(100, catalog.count)) {
    return { ok: true, skipped: true, version: currentVer, count: mapSize };
  }

  if (!s.plazasMap || typeof s.plazasMap !== 'object') s.plazasMap = {};

  // Índice case-insensitive para no duplicar "01028" / "01028 "
  const byUpper = new Map();
  Object.keys(s.plazasMap).forEach((k) => {
    byUpper.set(String(k).trim().toUpperCase(), k);
  });

  let applied = 0;
  Object.keys(catalog.plazasMap).forEach((puesto) => {
    const plaza = catalog.plazasMap[puesto];
    const upper = puesto.toUpperCase();
    const existingKey = byUpper.get(upper);
    if (existingKey && existingKey !== puesto) {
      delete s.plazasMap[existingKey];
    }
    if (s.plazasMap[puesto] !== plaza) {
      s.plazasMap[puesto] = plaza;
      applied += 1;
    }
    byUpper.set(upper, puesto);
  });

  s.plazasCatalogVersion = catalog.version;
  await saveState(s, { updatedBy: 'seed-plazas-catalog' });
  console.log(
    `[plazas] Catálogo ${catalog.source}: ${catalog.count} puestos (versión ${catalog.version}, ${applied} actualizados)`
  );
  return {
    ok: true,
    imported: true,
    version: catalog.version,
    count: catalog.count,
    applied,
  };
}
