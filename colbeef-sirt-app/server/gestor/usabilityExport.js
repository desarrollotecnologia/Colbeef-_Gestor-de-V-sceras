/**
 * Construcción del informe Excel de usabilidad (compartido API + CLI).
 */
import ExcelJS from 'exceljs';

export const MODULE_LABELS = {
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

const ACTION_LABELS = {
  session_start: 'Inicio de sesión',
  session_end: 'Fin de sesión',
  module_open: 'Abrir módulo',
  admin_open: 'Abrir admin usabilidad',
  portal_back: 'Volver al portal',
  sync: 'Sincronizar',
  click: 'Clic',
  event: 'Evento',
};

export function labelMod(m) {
  return MODULE_LABELS[m] || m || '(sin módulo)';
}

export function labelAct(a) {
  return ACTION_LABELS[a] || a || '(acción)';
}

export function dayKey(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  } catch {
    return String(iso || '').slice(0, 10);
  }
}

function inRange(ts, from, to) {
  const d = dayKey(ts);
  return d >= from && d <= to;
}

function sessionDurationMs(events) {
  if (!events || events.length < 2) return 0;
  const sorted = [...events].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return Math.max(0, new Date(sorted[sorted.length - 1].ts) - new Date(sorted[0].ts));
}

export function fmtDuration(ms) {
  if (!ms || ms < 0) return '0 min';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} h ${m} min`;
}

function classifySession(events) {
  const modules = new Set(
    events.filter((e) => e.action === 'module_open').map((e) => e.module).filter(Boolean)
  );
  const moduleOpens = events.filter((e) => e.action === 'module_open').length;
  const actions = new Set(events.map((e) => e.action));
  if (events.length <= 1 && actions.has('session_start')) return 'solo_entrada';
  if (moduleOpens === 0) return 'sin_modulos';
  if (moduleOpens === 1 && modules.size === 1) return 'un_modulo';
  if (modules.size >= 3 || moduleOpens >= 4) return 'uso_activo';
  return 'exploracion_ligera';
}

export function buildUsabilityReport(events, from, to) {
  const filtered = (events || []).filter((e) => inRange(e.ts, from, to));
  const bySession = new Map();
  for (const e of filtered) {
    const key = `${e.usuario || 'anonimo'}::${e.sessionId || 'sin-sesion'}`;
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(e);
  }

  const sesiones = [];
  for (const [key, evs] of bySession) {
    const [usuario, sessionId] = key.split('::');
    const sorted = [...evs].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const mods = [
      ...new Set(sorted.filter((e) => e.action === 'module_open').map((e) => e.module).filter(Boolean)),
    ];
    const dur = sessionDurationMs(sorted);
    sesiones.push({
      usuario,
      sessionId,
      inicio: sorted[0]?.ts || '',
      fin: sorted[sorted.length - 1]?.ts || '',
      duracionMs: dur,
      duracion: fmtDuration(dur),
      eventos: sorted.length,
      modulos: mods.map(labelMod).join(', '),
      tipo: classifySession(sorted),
      dia: dayKey(sorted[0]?.ts),
    });
  }
  sesiones.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

  const userMap = new Map();
  for (const s of sesiones) {
    if (!userMap.has(s.usuario)) {
      userMap.set(s.usuario, {
        usuario: s.usuario,
        sesiones: 0,
        eventos: 0,
        tiempoMs: 0,
        modulos: new Set(),
        dias: new Set(),
        tipos: {},
      });
    }
    const u = userMap.get(s.usuario);
    u.sesiones += 1;
    u.eventos += s.eventos;
    u.tiempoMs += s.duracionMs;
    u.dias.add(s.dia);
    u.tipos[s.tipo] = (u.tipos[s.tipo] || 0) + 1;
  }
  for (const e of filtered) {
    const u = userMap.get(e.usuario || 'anonimo');
    if (!u) continue;
    if (e.action === 'module_open' && e.module) u.modulos.add(labelMod(e.module));
  }

  const porUsuario = [...userMap.values()]
    .map((u) => ({
      usuario: u.usuario,
      sesiones: u.sesiones,
      eventos: u.eventos,
      diasActivos: u.dias.size,
      tiempoTotal: fmtDuration(u.tiempoMs),
      tiempoMs: u.tiempoMs,
      modulosUsados: [...u.modulos].sort().join(', ') || '(ninguno)',
      usoActivo: u.tipos.uso_activo || 0,
      exploracion: u.tipos.exploracion_ligera || 0,
      unModulo: u.tipos.un_modulo || 0,
      soloEntrada: u.tipos.solo_entrada || 0,
      sinModulos: u.tipos.sin_modulos || 0,
    }))
    .sort((a, b) => b.tiempoMs - a.tiempoMs || b.eventos - a.eventos);

  const modCount = {};
  const actCount = {};
  const dayCount = {};
  const userMod = {};
  for (const e of filtered) {
    const dk = dayKey(e.ts);
    dayCount[dk] = (dayCount[dk] || 0) + 1;
    actCount[e.action || 'event'] = (actCount[e.action || 'event'] || 0) + 1;
    if (e.module) {
      modCount[e.module] = (modCount[e.module] || 0) + 1;
      const u = e.usuario || 'anonimo';
      if (!userMod[u]) userMod[u] = {};
      userMod[u][e.module] = (userMod[u][e.module] || 0) + 1;
    }
  }

  const porModulo = Object.entries(modCount)
    .map(([m, c]) => ({ modulo: labelMod(m), codigo: m, eventos: c }))
    .sort((a, b) => b.eventos - a.eventos);
  const porAccion = Object.entries(actCount)
    .map(([a, c]) => ({ accion: labelAct(a), codigo: a, eventos: c }))
    .sort((a, b) => b.eventos - a.eventos);
  const porDia = Object.keys(dayCount)
    .sort()
    .map((d) => ({ fecha: d, eventos: dayCount[d] }));
  const matrizUsuarioModulo = [];
  for (const [usuario, mods] of Object.entries(userMod)) {
    for (const [mod, count] of Object.entries(mods)) {
      matrizUsuarioModulo.push({
        usuario,
        modulo: labelMod(mod),
        codigo: mod,
        eventos: count,
      });
    }
  }
  matrizUsuarioModulo.sort((a, b) => a.usuario.localeCompare(b.usuario) || b.eventos - a.eventos);

  return {
    filtered,
    sesiones,
    porUsuario,
    porModulo,
    porAccion,
    porDia,
    matrizUsuarioModulo,
    resumen: {
      desde: from,
      hasta: to,
      totalEventos: filtered.length,
      usuariosUnicos: porUsuario.length,
      sesiones: sesiones.length,
      tiempoTotalMs: porUsuario.reduce((s, u) => s + u.tiempoMs, 0),
    },
  };
}

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
}

export async function buildUsabilityExcelBuffer(events, from, to) {
  const report = buildUsabilityReport(events, from, to);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Colbeef Gestor';
  wb.created = new Date();

  {
    const ws = wb.addWorksheet('Resumen');
    ws.columns = [
      { header: 'Indicador', key: 'k', width: 36 },
      { header: 'Valor', key: 'v', width: 48 },
    ];
    styleHeader(ws);
    const r = report.resumen;
    [
      ['Período', `${r.desde} → ${r.hasta}`],
      ['Total eventos', r.totalEventos],
      ['Usuarios únicos', r.usuariosUnicos],
      ['Sesiones', r.sesiones],
      ['Tiempo total estimado', fmtDuration(r.tiempoTotalMs)],
      ['Nota tiempo', 'Suma (último − primer evento) por sesión'],
      ['Generado', new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })],
    ].forEach(([k, v]) => ws.addRow({ k, v }));
  }

  {
    const ws = wb.addWorksheet('Por usuario');
    ws.columns = [
      { header: 'Usuario', key: 'usuario', width: 28 },
      { header: 'Sesiones', key: 'sesiones', width: 10 },
      { header: 'Eventos', key: 'eventos', width: 10 },
      { header: 'Días activos', key: 'diasActivos', width: 12 },
      { header: 'Tiempo total', key: 'tiempoTotal', width: 14 },
      { header: 'Módulos usados', key: 'modulosUsados', width: 55 },
      { header: 'Sesiones uso activo', key: 'usoActivo', width: 16 },
      { header: 'Exploración', key: 'exploracion', width: 12 },
      { header: 'Un módulo', key: 'unModulo', width: 12 },
      { header: 'Solo entrada', key: 'soloEntrada', width: 12 },
      { header: 'Sin módulos', key: 'sinModulos', width: 12 },
    ];
    styleHeader(ws);
    report.porUsuario.forEach((u) => ws.addRow(u));
  }

  {
    const ws = wb.addWorksheet('Sesiones');
    ws.columns = [
      { header: 'Usuario', key: 'usuario', width: 24 },
      { header: 'Día', key: 'dia', width: 12 },
      { header: 'Inicio', key: 'inicio', width: 22 },
      { header: 'Fin', key: 'fin', width: 22 },
      { header: 'Duración', key: 'duracion', width: 12 },
      { header: 'Eventos', key: 'eventos', width: 10 },
      { header: 'Tipo sesión', key: 'tipo', width: 18 },
      { header: 'Módulos', key: 'modulos', width: 50 },
      { header: 'Session ID', key: 'sessionId', width: 28 },
    ];
    styleHeader(ws);
    report.sesiones.forEach((s) => ws.addRow(s));
  }

  {
    const ws = wb.addWorksheet('Usuario x módulo');
    ws.columns = [
      { header: 'Usuario', key: 'usuario', width: 24 },
      { header: 'Módulo', key: 'modulo', width: 22 },
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Eventos', key: 'eventos', width: 10 },
    ];
    styleHeader(ws);
    report.matrizUsuarioModulo.forEach((r) => ws.addRow(r));
  }

  {
    const ws = wb.addWorksheet('Por módulo');
    ws.columns = [
      { header: 'Módulo', key: 'modulo', width: 24 },
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Eventos', key: 'eventos', width: 10 },
    ];
    styleHeader(ws);
    report.porModulo.forEach((r) => ws.addRow(r));
  }

  {
    const ws = wb.addWorksheet('Por acción');
    ws.columns = [
      { header: 'Acción', key: 'accion', width: 28 },
      { header: 'Código', key: 'codigo', width: 18 },
      { header: 'Eventos', key: 'eventos', width: 10 },
    ];
    styleHeader(ws);
    report.porAccion.forEach((r) => ws.addRow(r));
  }

  {
    const ws = wb.addWorksheet('Por día');
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Eventos', key: 'eventos', width: 10 },
    ];
    styleHeader(ws);
    report.porDia.forEach((r) => ws.addRow(r));
  }

  {
    const ws = wb.addWorksheet('Eventos detalle');
    ws.columns = [
      { header: 'Fecha/hora', key: 'ts', width: 24 },
      { header: 'Día', key: 'dia', width: 12 },
      { header: 'Usuario', key: 'usuario', width: 22 },
      { header: 'Acción', key: 'accion', width: 22 },
      { header: 'Módulo', key: 'modulo', width: 18 },
      { header: 'Detalle', key: 'detail', width: 40 },
      { header: 'Página', key: 'page', width: 12 },
      { header: 'Session ID', key: 'sessionId', width: 24 },
      { header: 'IP', key: 'ip', width: 16 },
    ];
    styleHeader(ws);
    const sorted = [...report.filtered].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    for (const e of sorted) {
      ws.addRow({
        ts: e.ts,
        dia: dayKey(e.ts),
        usuario: e.usuario,
        accion: labelAct(e.action),
        modulo: labelMod(e.module),
        detail: e.detail || '',
        page: e.page || '',
        sessionId: e.sessionId || '',
        ip: e.ip || '',
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(buf), report };
}
