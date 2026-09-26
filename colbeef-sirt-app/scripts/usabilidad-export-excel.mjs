#!/usr/bin/env node
/**
 * Exporta usabilidad a Excel (15–26 sep o rango libre).
 *
 * Preferencia: MySQL local (ideal en PC 205) → API remota → JSON.
 *
 * Uso:
 *   node scripts/usabilidad-export-excel.mjs --from=2026-09-15 --to=2026-09-26
 *   node scripts/usabilidad-export-excel.mjs --from=2026-09-15 --to=2026-09-26 --base=http://192.168.20.205:3001
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { buildUsabilityExcelBuffer, buildUsabilityReport } from '../server/gestor/usabilityExport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

function parseArgs() {
  const args = {
    from: '2026-09-15',
    to: '2026-09-26',
    base: process.env.USABILITY_EXPORT_BASE || 'http://192.168.20.205:3001',
    out: '',
    password: process.env.USABILITY_ADMIN_PASSWORD || '',
  };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--from=')) args.from = a.slice(7);
    else if (a.startsWith('--to=')) args.to = a.slice(5);
    else if (a.startsWith('--base=')) args.base = a.slice(7).replace(/\/$/, '');
    else if (a.startsWith('--out=')) args.out = a.slice(6);
    else if (a.startsWith('--password=')) args.password = a.slice(11);
  }
  if (
    (args.password.startsWith('"') && args.password.endsWith('"')) ||
    (args.password.startsWith("'") && args.password.endsWith("'"))
  ) {
    args.password = args.password.slice(1, -1);
  }
  return args;
}

async function fetchEventsFromApi(base, password, from, to) {
  if (!password) return null;
  const loginRes = await fetch(`${base}/api/usability/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const login = await loginRes.json().catch(() => ({}));
  if (!login.success || !login.token) {
    console.warn('[api] Login usabilidad falló:', login.message || loginRes.status);
    return null;
  }
  const headers = { Authorization: `Bearer ${login.token}` };
  const exportUrl = `${base}/api/usability/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const expRes = await fetch(exportUrl, { headers });
  if (expRes.ok) {
    const data = await expRes.json();
    if (data.success && Array.isArray(data.events)) {
      console.log(`[api] export: ${data.events.length} eventos`);
      return data.events;
    }
  }
  console.warn('[api] export no disponible o vacío (status', expRes.status, ')');
  return null;
}

async function fetchEventsFromMysql(from, to) {
  try {
    const { isGestorMysqlReady, initGestorMysql, gestorQuery } = await import('../server/gestorDb.js');
    await initGestorMysql({ silencioso: true });
    if (!isGestorMysqlReady()) return null;
    const rows = await gestorQuery(
      `SELECT event_id, ts, usuario, action, module, detail, session_id, page, ip, user_agent
       FROM usability_events
       WHERE DATE(ts) >= ? AND DATE(ts) <= ?
       ORDER BY ts ASC
       LIMIT 100000`,
      [from, to]
    );
    console.log(`[mysql] ${rows.length} eventos`);
    return rows.map((r) => ({
      id: r.event_id,
      ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      usuario: r.usuario,
      action: r.action,
      module: r.module || '',
      detail: r.detail || '',
      sessionId: r.session_id || '',
      page: r.page || '',
      ip: r.ip || '',
      userAgent: r.user_agent || '',
    }));
  } catch (e) {
    console.warn('[mysql]', e.message);
    return null;
  }
}

async function fetchEventsFromJson(from, to) {
  const p = path.join(ROOT, 'server', 'data', 'usability-events.json');
  try {
    const raw = JSON.parse(await fs.readFile(p, 'utf8'));
    const events = (raw.events || []).filter((e) => {
      const d = String(e.ts || '').slice(0, 10);
      return d >= from && d <= to;
    });
    console.log(`[json] ${events.length} eventos en rango`);
    return events;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs();
  console.log(`Rango ${args.from} → ${args.to}`);

  let events =
    (await fetchEventsFromMysql(args.from, args.to)) ||
    (await fetchEventsFromApi(args.base, args.password, args.from, args.to)) ||
    (await fetchEventsFromJson(args.from, args.to));

  if (!events) {
    console.error('No se pudieron obtener eventos (MySQL / API / JSON).');
    console.error('Ejecute este script en la PC 205, o pase --password=... de usabilidad tras desplegar el export.');
    process.exit(1);
  }

  const report = buildUsabilityReport(events, args.from, args.to);
  console.log(
    `En rango: ${report.resumen.totalEventos} eventos · ${report.resumen.usuariosUnicos} usuarios · ${report.resumen.sesiones} sesiones`
  );

  const { buffer } = await buildUsabilityExcelBuffer(events, args.from, args.to);
  const out =
    args.out ||
    path.join(ROOT, 'server', 'data', `usabilidad_${args.from}_${args.to}.xlsx`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, buffer);
  console.log(`Excel: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
