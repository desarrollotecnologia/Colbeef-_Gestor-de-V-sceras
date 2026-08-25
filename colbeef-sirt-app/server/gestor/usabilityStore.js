/**
 * Telemetría del gestor y auth del dashboard de usabilidad.
 *
 * Preferencia: MySQL (`usability_events`). Si MySQL no está listo, JSON local.
 * Tokens admin solo en memoria (24 h; se pierden al reiniciar).
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { isGestorMysqlReady, gestorQuery } from '../gestorDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'usability-events.json');
const MAX_EVENTS = 50000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const adminPassword = String(process.env.USABILITY_ADMIN_PASSWORD || '').trim();
const adminTokens = new Map();

let cache = null;

function defaultData() {
  return { events: [], version: 1 };
}

async function loadData() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    cache = { ...defaultData(), ...JSON.parse(raw) };
    if (!Array.isArray(cache.events)) cache.events = [];
    return cache;
  } catch {
    cache = defaultData();
    return cache;
  }
}

async function saveData() {
  if (!cache) return;
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

function trimEvents(events) {
  if (events.length <= MAX_EVENTS) return events;
  return events.slice(events.length - MAX_EVENTS);
}

function buildEvent(payload, reqMeta = {}) {
  return {
    id: crypto.randomBytes(8).toString('hex'),
    ts: new Date().toISOString(),
    usuario: String(payload.usuario || 'anonimo').trim().slice(0, 120) || 'anonimo',
    action: String(payload.action || 'event').trim().slice(0, 80),
    module: String(payload.module || '').trim().slice(0, 80),
    detail: String(payload.detail || '').trim().slice(0, 240),
    sessionId: String(payload.sessionId || '').trim().slice(0, 64),
    page: String(payload.page || '').trim().slice(0, 80),
    meta: payload.meta && typeof payload.meta === 'object' ? payload.meta : {},
    ip: String(reqMeta.ip || '').slice(0, 64),
    userAgent: String(reqMeta.userAgent || '').slice(0, 280),
  };
}

async function recordEventMysql(evt) {
  await gestorQuery(
    `INSERT INTO usability_events
      (event_id, ts, usuario, action, module, detail, session_id, page, meta_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
    [
      evt.id,
      new Date(evt.ts),
      evt.usuario,
      evt.action,
      evt.module || null,
      evt.detail || null,
      evt.sessionId || null,
      evt.page || null,
      JSON.stringify(evt.meta || {}),
      evt.ip || null,
      evt.userAgent || null,
    ]
  );
}

async function recordEventJson(evt) {
  const data = await loadData();
  data.events.push(evt);
  data.events = trimEvents(data.events);
  await saveData();
}

export async function recordEvent(payload, reqMeta = {}) {
  const evt = buildEvent(payload, reqMeta);
  if (isGestorMysqlReady()) {
    try {
      await recordEventMysql(evt);
      return { success: true, id: evt.id, store: 'mysql' };
    } catch (e) {
      console.warn('[usabilidad] MySQL falló, usando JSON:', e.message);
    }
  }
  await recordEventJson(evt);
  return { success: true, id: evt.id, store: 'json' };
}

/** Valida la contraseña configurada y crea un token administrativo temporal. */
export function loginAdmin(password) {
  if (!adminPassword) {
    console.error('[usabilidad] Defina USABILITY_ADMIN_PASSWORD en .env');
    return null;
  }
  if (String(password || '') !== adminPassword) return null;
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

export function verifyAdminToken(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  const exp = adminTokens.get(t);
  if (!exp || Date.now() > exp) {
    adminTokens.delete(t);
    return false;
  }
  return true;
}

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

function aggregateEvents(events, days) {
  const byUsuario = {};
  const byAction = {};
  const byModule = {};
  const byDay = {};
  const sessions = new Set();
  let lastEvent = null;

  events.forEach((e) => {
    const u = e.usuario || 'anonimo';
    byUsuario[u] = (byUsuario[u] || 0) + 1;
    const act = e.action || 'event';
    byAction[act] = (byAction[act] || 0) + 1;
    if (e.module) byModule[e.module] = (byModule[e.module] || 0) + 1;
    const dk = dayKey(e.ts);
    byDay[dk] = (byDay[dk] || 0) + 1;
    if (e.sessionId) sessions.add(`${u}::${e.sessionId}`);
    if (!lastEvent || e.ts > lastEvent.ts) lastEvent = e;
  });

  const toSorted = (obj) =>
    Object.entries(obj)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  const recent = [...events]
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    .slice(0, 200)
    .map((e) => ({
      ts: e.ts,
      usuario: e.usuario,
      action: e.action,
      module: e.module,
      detail: e.detail,
      page: e.page,
    }));

  return {
    success: true,
    totalEvents: events.length,
    uniqueUsers: Object.keys(byUsuario).length,
    uniqueSessions: sessions.size,
    days,
    lastActivity: lastEvent
      ? { ts: lastEvent.ts, usuario: lastEvent.usuario, action: lastEvent.action }
      : null,
    byUsuario: toSorted(byUsuario).slice(0, 50),
    byAction: toSorted(byAction).slice(0, 40),
    byModule: toSorted(byModule).slice(0, 30),
    byDay: Object.keys(byDay)
      .sort()
      .map((d) => ({ date: d, count: byDay[d] })),
    recent,
  };
}

async function getUsageStatsMysql(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const rows = await gestorQuery(
    `SELECT event_id, ts, usuario, action, module, detail, session_id, page
     FROM usability_events
     WHERE ts >= ?
     ORDER BY ts DESC
     LIMIT 50000`,
    [cutoff]
  );
  const events = rows.map((r) => ({
    id: r.event_id,
    ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
    usuario: r.usuario,
    action: r.action,
    module: r.module || '',
    detail: r.detail || '',
    sessionId: r.session_id || '',
    page: r.page || '',
  }));
  const stats = aggregateEvents(events, days);
  stats.store = 'mysql';
  return stats;
}

async function getUsageStatsJson(days) {
  const data = await loadData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const events = data.events.filter((e) => new Date(e.ts) >= cutoff);
  const stats = aggregateEvents(events, days);
  stats.store = 'json';
  return stats;
}

export async function getUsageStats(days = 30) {
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  if (isGestorMysqlReady()) {
    try {
      return await getUsageStatsMysql(d);
    } catch (e) {
      console.warn('[usabilidad] stats MySQL falló, usando JSON:', e.message);
    }
  }
  return getUsageStatsJson(d);
}

/** Importa eventos del JSON a MySQL una vez (idempotente por event_id). */
export async function migrateUsabilityJsonToMysql() {
  if (!isGestorMysqlReady()) return { ok: false, skipped: true };
  const data = await loadData();
  if (!data.events.length) return { ok: true, imported: 0 };
  let imported = 0;
  for (const e of data.events) {
    try {
      await gestorQuery(
        `INSERT IGNORE INTO usability_events
          (event_id, ts, usuario, action, module, detail, session_id, page, meta_json, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
        [
          e.id || crypto.randomBytes(8).toString('hex'),
          e.ts ? new Date(e.ts) : new Date(),
          e.usuario || 'anonimo',
          e.action || 'event',
          e.module || null,
          e.detail || null,
          e.sessionId || null,
          e.page || null,
          JSON.stringify(e.meta || {}),
          e.ip || null,
          e.userAgent || null,
        ]
      );
      imported += 1;
    } catch (_) {
      /* ignore row errors */
    }
  }
  console.log(`[usabilidad] Migrados ${imported} eventos JSON → MySQL`);
  return { ok: true, imported };
}

export function buildGestorLink(baseUrl, usuario) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const u = encodeURIComponent(String(usuario || '').trim());
  return `${base}/gestor.html?usuario=${u}`;
}
