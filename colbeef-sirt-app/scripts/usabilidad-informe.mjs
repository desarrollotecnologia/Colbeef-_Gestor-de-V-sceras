#!/usr/bin/env node
/**
 * Genera un informe de usabilidad a partir de server/data/usability-events.json
 *
 * Uso:
 *   node scripts/usabilidad-informe.mjs [--days=30] [--json]
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'server', 'data', 'usability-events.json');

const MODULE_LABELS = {
  decomisos: 'Decomisos',
  despachos: 'Despachos',
  informe: 'Informe laboral',
  historial: 'Historial PDF',
  crudas: 'Crudas',
  planilla: 'Planilla',
  dashboard: 'Dashboard',
  opl: 'OPL',
  gestor: 'Gestor',
  portal: 'Portal',
  usabilidad: 'Usabilidad',
};

const WORKFLOW_MODULES = ['decomisos', 'despachos', 'opl', 'crudas', 'planilla', 'informe', 'historial'];

function parseArgs() {
  const args = { days: 30, json: false };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--days=')) args.days = Math.max(1, Math.min(365, Number(a.split('=')[1]) || 30));
    if (a === '--json') args.json = true;
  }
  return args;
}

function classifySession(events) {
  const actions = new Set(events.map((e) => e.action));
  const modules = new Set(events.filter((e) => e.action === 'module_open').map((e) => e.module));
  const moduleOpens = events.filter((e) => e.action === 'module_open').length;

  if (events.length <= 1 && actions.has('session_start')) {
    return 'solo_entrada';
  }
  if (moduleOpens === 0) {
    return 'sin_modulos';
  }
  if (moduleOpens === 1 && modules.size === 1) {
    return 'un_modulo';
  }
  if (modules.size >= 3 || moduleOpens >= 4) {
    return 'uso_activo';
  }
  return 'exploracion_ligera';
}

function sessionDurationMs(events) {
  if (events.length < 2) return 0;
  const sorted = [...events].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return new Date(sorted[sorted.length - 1].ts) - new Date(sorted[0].ts);
}

function fmtMs(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60000)} min`;
}

function fmtPct(n, total) {
  if (!total) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

async function main() {
  const { days, json: asJson } = parseArgs();
  let raw;
  try {
    raw = await fs.readFile(DATA_PATH, 'utf8');
  } catch {
    console.error(`No se encontró ${DATA_PATH}`);
    console.error('El archivo se crea cuando operadores usan el gestor en el servidor.');
    process.exit(1);
  }

  const data = JSON.parse(raw);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const events = (data.events || []).filter((e) => new Date(e.ts) >= cutoff);

  const bySession = new Map();
  for (const e of events) {
    const key = `${e.usuario || 'anonimo'}::${e.sessionId || '?'}`;
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(e);
  }

  const sessionStats = [];
  const byClass = { solo_entrada: 0, sin_modulos: 0, un_modulo: 0, exploracion_ligera: 0, uso_activo: 0 };
  const moduleOnlyUsers = new Map();
  const userSessions = new Map();

  for (const [key, sessEvents] of bySession) {
    const [usuario] = key.split('::');
    const cls = classifySession(sessEvents);
    byClass[cls]++;
    const dur = sessionDurationMs(sessEvents);
    const modules = [...new Set(sessEvents.filter((e) => e.action === 'module_open').map((e) => e.module))];
    sessionStats.push({ key, usuario, cls, dur, modules, eventCount: sessEvents.length });

    if (!userSessions.has(usuario)) userSessions.set(usuario, []);
    userSessions.get(usuario).push(cls);

    if (cls === 'un_modulo') {
      moduleOnlyUsers.set(usuario, (moduleOnlyUsers.get(usuario) || 0) + 1);
    }
  }

  const byUsuario = {};
  const byModule = {};
  const byAction = {};
  const byDay = {};

  for (const e of events) {
    const u = e.usuario || 'anonimo';
    byUsuario[u] = (byUsuario[u] || 0) + 1;
    if (e.module) byModule[e.module] = (byModule[e.module] || 0) + 1;
    byAction[e.action || 'event'] = (byAction[e.action || 'event'] || 0) + 1;
    const dk = String(e.ts).slice(0, 10);
    byDay[dk] = (byDay[dk] || 0) + 1;
  }

  const totalSessions = bySession.size;
  const peekRate = byClass.solo_entrada + byClass.un_modulo;
  const activeRate = byClass.uso_activo + byClass.exploracion_ligera;

  const userProfile = [...userSessions.entries()].map(([usuario, classes]) => {
    const active = classes.filter((c) => c === 'uso_activo' || c === 'exploracion_ligera').length;
    const peek = classes.filter((c) => c === 'solo_entrada' || c === 'un_modulo').length;
    let perfil = 'mixto';
    if (active === 0 && peek > 0) perfil = 'solo_mira';
    else if (active > peek * 2) perfil = 'operador_activo';
    else if (peek > active * 2) perfil = 'curioso_poco_uso';
    return { usuario, sesiones: classes.length, perfil, activas: active, superficiales: peek };
  }).sort((a, b) => b.sesiones - a.sesiones);

  const moduleOpens = events.filter((e) => e.action === 'module_open');
  const moduleOpenCounts = {};
  for (const e of moduleOpens) {
    moduleOpenCounts[e.module] = (moduleOpenCounts[e.module] || 0) + 1;
  }

  const report = {
    periodoDias: days,
    generadoEn: new Date().toISOString(),
    resumen: {
      totalEventos: events.length,
      usuariosUnicos: Object.keys(byUsuario).length,
      sesionesUnicas: totalSessions,
      ultimoEvento: events.length
        ? [...events].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0]
        : null,
    },
    patronesSesion: {
      total: totalSessions,
      ...byClass,
      pctSoloEntradaOModulo: fmtPct(peekRate, totalSessions),
      pctUsoRealEstimado: fmtPct(activeRate, totalSessions),
    },
    modulosMasAbiertos: Object.entries(moduleOpenCounts)
      .map(([name, count]) => ({ name, label: MODULE_LABELS[name] || name, count }))
      .sort((a, b) => b.count - a.count),
    perfilesUsuario: userProfile,
    duracionSesiones: {
      promedio: totalSessions
        ? fmtMs(sessionStats.reduce((s, x) => s + x.dur, 0) / totalSessions)
        : '0 s',
      mediana: (() => {
        const durs = sessionStats.map((s) => s.dur).sort((a, b) => a - b);
        if (!durs.length) return '0 s';
        const mid = Math.floor(durs.length / 2);
        return fmtMs(durs.length % 2 ? durs[mid] : (durs[mid - 1] + durs[mid]) / 2);
      })(),
    },
    flujoEsperado: WORKFLOW_MODULES.map((m) => ({
      modulo: MODULE_LABELS[m] || m,
      aperturas: moduleOpenCounts[m] || 0,
      enFlujo: WORKFLOW_MODULES.includes(m),
    })),
    byDay: Object.keys(byDay)
      .sort()
      .map((d) => ({ date: d, count: byDay[d] })),
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lines = [];
  lines.push('# Informe de usabilidad — Gestor de Vísceras Colbeef');
  lines.push('');
  lines.push(`**Periodo:** últimos ${days} días`);
  lines.push(`**Generado:** ${new Date().toLocaleString('es-CO')}`);
  lines.push('');

  lines.push('## 1. Resumen ejecutivo');
  lines.push('');
  if (!events.length) {
    lines.push('> No hay eventos registrados en el periodo seleccionado.');
  } else {
    lines.push(`- **${report.resumen.totalEventos}** eventos registrados`);
    lines.push(`- **${report.resumen.usuariosUnicos}** usuarios distintos (nombre del portal)`);
    lines.push(`- **${report.resumen.sesionesUnicas}** sesiones de navegador`);
    if (report.resumen.ultimoEvento) {
      const u = report.resumen.ultimoEvento;
      lines.push(`- **Última actividad:** ${u.usuario} — ${u.action} (${u.ts})`);
    }
    lines.push('');
    lines.push('### ¿Usan el programa o solo abren módulos?');
    lines.push('');
    lines.push('| Patrón de sesión | Cantidad | % | Interpretación |');
    lines.push('|---|---:|---:|---|');
    lines.push(`| Solo entra y sale | ${byClass.solo_entrada} | ${fmtPct(byClass.solo_entrada, totalSessions)} | Abre gestor, no entra a módulos |`);
    lines.push(`| Entra sin abrir módulos | ${byClass.sin_modulos} | ${fmtPct(byClass.sin_modulos, totalSessions)} | Se queda en dashboard/portal |`);
    lines.push(`| Abre 1 módulo y ya | ${byClass.un_modulo} | ${fmtPct(byClass.un_modulo, totalSessions)} | **Curiosidad / consulta rápida** |`);
    lines.push(`| Exploración ligera (2+ módulos) | ${byClass.exploracion_ligera} | ${fmtPct(byClass.exploracion_ligera, totalSessions)} | Navega varios módulos |`);
    lines.push(`| Uso activo (3+ módulos o 4+ aperturas) | ${byClass.uso_activo} | ${fmtPct(byClass.uso_activo, totalSessions)} | **Flujo operativo probable** |`);
    lines.push('');
    lines.push(
      `**Estimación:** ~${report.patronesSesion.pctSoloEntradaOModulo} de sesiones son superficiales (solo entrada o un módulo). ` +
        `~${report.patronesSesion.pctUsoRealEstimado} muestran exploración o uso activo.`
    );
    lines.push('');
    lines.push(
      '> **Limitación:** el tracker solo registra *apertura* de módulos, no acciones internas (sincronizar SIRT, generar PDF, procesar despachos). ' +
        'Un usuario puede abrir Despachos y trabajar ahí sin más eventos.'
    );
  }

  lines.push('');
  lines.push('## 2. Módulos más visitados');
  lines.push('');
  if (report.modulosMasAbiertos.length) {
    lines.push('| Módulo | Aperturas |');
    lines.push('|---|---:|');
    for (const m of report.modulosMasAbiertos) {
      lines.push(`| ${m.label} | ${m.count} |`);
    }
  } else {
    lines.push('Sin aperturas de módulos.');
  }

  lines.push('');
  lines.push('## 3. Perfil por usuario');
  lines.push('');
  lines.push('| Usuario | Sesiones | Perfil | Activas | Superficiales |');
  lines.push('|---|---:|---|---:|---:|');
  for (const u of userProfile.slice(0, 30)) {
    const perfilLabel = {
      operador_activo: 'Operador activo',
      solo_mira: 'Solo mira / no usa',
      curioso_poco_uso: 'Poco uso',
      mixto: 'Mixto',
    }[u.perfil];
    lines.push(`| ${u.usuario} | ${u.sesiones} | ${perfilLabel} | ${u.activas} | ${u.superficiales} |`);
  }

  lines.push('');
  lines.push('## 4. Duración de sesión (aprox.)');
  lines.push('');
  lines.push(`- Promedio entre primer y último evento: **${report.duracionSesiones.promedio}**`);
  lines.push(`- Mediana: **${report.duracionSesiones.mediana}**`);

  lines.push('');
  lines.push('## 5. Flujo operativo esperado vs. aperturas');
  lines.push('');
  lines.push('Orden recomendado en planta: Decomisos → Despachos → OPL → Crudas/Planilla → Informe → Historial PDF');
  lines.push('');
  lines.push('| Paso | Aperturas registradas |');
  lines.push('|---|---:|');
  for (const f of report.flujoEsperado) {
    lines.push(`| ${f.modulo} | ${f.aperturas} |`);
  }

  lines.push('');
  lines.push('## 6. Recomendaciones');
  lines.push('');
  lines.push('1. **Complementar con historial PDF** (`gestor-state.json` → `historialPdf`): generar PDF confirma uso real en Decomisos.');
  lines.push('2. **Instrumentar acciones clave:** `sirt_sync`, `procesar_despachos`, `generar_pdf`, `export_planilla`, `generar_informe`.');
  lines.push('3. **Revisar dashboard en vivo:** `/usabilidad.html` (5 clics en logo + contraseña admin).');
  lines.push('4. **Backup periódico** de `server/data/usability-events.json`.');

  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
