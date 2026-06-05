import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'usability-events.json');
const MAX_EVENTS = 50000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const adminPassword = String(process.env.USABILITY_ADMIN_PASSWORD || '123456789');
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

export async function recordEvent(payload, reqMeta = {}) {
  const data = await loadData();
  const evt = {
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
  data.events.push(evt);
  data.events = trimEvents(data.events);
  await saveData();
  return { success: true, id: evt.id };
}

export function loginAdmin(password) {
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

export async function getUsageStats(days = 30) {
  const data = await loadData();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Math.min(365, Number(days) || 30)));
  const events = data.events.filter((e) => new Date(e.ts) >= cutoff);

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

export function buildGestorLink(baseUrl, usuario) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const u = encodeURIComponent(String(usuario || '').trim());
  return `${base}/gestor.html?usuario=${u}`;
}
