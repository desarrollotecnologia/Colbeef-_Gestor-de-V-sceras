/**
 * Historial de Planilla de Puntos en MySQL (`planilla_historial`).
 * Una fila por fecha+turno con el consolidado (distribución OPL/zona/puesto).
 * Fallback: si MySQL no está listo, el motor sigue usando `planillaPorDia` en estado.
 */
import { gestorQuery, isGestorMysqlReady } from '../gestorDb.js';

export async function ensurePlanillaHistorialTable() {
  if (!isGestorMysqlReady()) return;
  await gestorQuery(`
    CREATE TABLE IF NOT EXISTS planilla_historial (
      fecha DATE NOT NULL,
      turno VARCHAR(16) NOT NULL DEFAULT '',
      total_juegos INT UNSIGNED NOT NULL DEFAULT 0,
      fecha_txt VARCHAR(32) NULL,
      payload JSON NOT NULL,
      guardado_en TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
        ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (fecha, turno),
      KEY idx_planilla_historial_guardado (guardado_en)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function rowToSnap(row) {
  if (!row) return null;
  const payload = parsePayload(row.payload);
  if (!payload?.consolidado?.length) return null;
  const fechaIso =
    row.fecha instanceof Date
      ? row.fecha.toISOString().slice(0, 10)
      : String(row.fecha || payload.fechaIso || '').slice(0, 10);
  const guardado =
    row.guardado_en instanceof Date
      ? row.guardado_en.toISOString()
      : String(row.guardado_en || payload.guardadoEn || '');
  return {
    consolidado: payload.consolidado,
    totalJuegos: Number(row.total_juegos ?? payload.totalJuegos ?? 0),
    turno: String(row.turno || payload.turno || '').trim(),
    fechaIso,
    fechaTxt: String(row.fecha_txt || payload.fechaTxt || '').trim(),
    resumenOpl: Array.isArray(payload.resumenOpl) ? payload.resumenOpl : [],
    guardadoEn: guardado,
    origen: 'mysql',
  };
}

/** Resumen por OPL a partir del consolidado (col 6 = OPL, col 7 = juegos). */
export function resumenOplDesdeConsolidado(consolidado) {
  const map = {};
  let total = 0;
  (consolidado || []).forEach((fila) => {
    const opl = String(fila?.[6] ?? '').trim();
    const n = Number(fila?.[7] || 0);
    if (!opl || !(n > 0)) return;
    map[opl] = (map[opl] || 0) + n;
    total += n;
  });
  return Object.keys(map)
    .map((opl) => ({
      opl,
      totalJuegos: Math.round(map[opl] * 100) / 100,
      porcentaje: total > 0 ? ((map[opl] / total) * 100).toFixed(1) : '0.0',
    }))
    .sort((a, b) => b.totalJuegos - a.totalJuegos);
}

/**
 * Upsert de la foto del día. No pisa una foto con más juegos salvo `force`.
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string }}
 */
export async function upsertPlanillaHistorial(snap, { force = false } = {}) {
  if (!isGestorMysqlReady()) return { ok: false, skipped: true, reason: 'mysql-off' };
  const fechaIso = String(snap?.fechaIso || '').trim().slice(0, 10);
  const turno = String(snap?.turno || '').trim();
  const consolidado = snap?.consolidado;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso) || !consolidado?.length) {
    return { ok: false, skipped: true, reason: 'datos-invalidos' };
  }
  const totalJuegos = Number(snap.totalJuegos || 0);
  if (!(totalJuegos > 0)) return { ok: false, skipped: true, reason: 'sin-juegos' };

  await ensurePlanillaHistorialTable();

  const prevRows = await gestorQuery(
    `SELECT total_juegos AS totalJuegos
     FROM planilla_historial
     WHERE fecha = ? AND turno = ?
     LIMIT 1`,
    [fechaIso, turno]
  );
  const prevTotal = Number(prevRows[0]?.totalJuegos || 0);
  if (!force && prevTotal > totalJuegos) {
    return { ok: true, skipped: true, reason: 'conserva-mayor' };
  }

  const fechaTxt = String(snap.fechaTxt || '').trim();
  const resumenOpl =
    Array.isArray(snap.resumenOpl) && snap.resumenOpl.length
      ? snap.resumenOpl
      : resumenOplDesdeConsolidado(consolidado);
  const payload = {
    consolidado,
    totalJuegos,
    turno,
    fechaIso,
    fechaTxt,
    resumenOpl,
    guardadoEn: new Date().toISOString(),
  };

  await gestorQuery(
    `INSERT INTO planilla_historial
      (fecha, turno, total_juegos, fecha_txt, payload, guardado_en)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       total_juegos = VALUES(total_juegos),
       fecha_txt = VALUES(fecha_txt),
       payload = VALUES(payload),
       guardado_en = CURRENT_TIMESTAMP(3)`,
    [fechaIso, turno, totalJuegos, fechaTxt || null, JSON.stringify(payload)]
  );
  return { ok: true };
}

/**
 * Lee historial de una fecha. Si hay varias filas (turnos), toma la de más juegos
 * salvo que se pida un turno concreto.
 */
export async function getPlanillaHistorial(fechaIso, turno = '') {
  if (!isGestorMysqlReady()) return null;
  const dia = String(fechaIso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  await ensurePlanillaHistorialTable();

  const t = String(turno || '').trim();
  if (t) {
    const rows = await gestorQuery(
      `SELECT fecha, turno, total_juegos, fecha_txt, payload, guardado_en
       FROM planilla_historial
       WHERE fecha = ? AND turno = ?
       LIMIT 1`,
      [dia, t]
    );
    return rowToSnap(rows[0]);
  }

  const rows = await gestorQuery(
    `SELECT fecha, turno, total_juegos, fecha_txt, payload, guardado_en
     FROM planilla_historial
     WHERE fecha = ?
     ORDER BY total_juegos DESC, guardado_en DESC
     LIMIT 1`,
    [dia]
  );
  return rowToSnap(rows[0]);
}

/** Lista resúmenes de historial (sin payload completo) para un rango. */
export async function listPlanillaHistorial(filtro = {}) {
  if (!isGestorMysqlReady()) return null;
  await ensurePlanillaHistorialTable();
  let from = String(filtro.from || filtro.date || '').trim().slice(0, 10);
  let to = String(filtro.to || filtro.date || from).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) to = from;

  const rows = await gestorQuery(
    `SELECT fecha, turno, total_juegos AS totalJuegos, fecha_txt AS fechaTxt,
            guardado_en AS guardadoEn
     FROM planilla_historial
     WHERE fecha >= ? AND fecha <= ?
     ORDER BY fecha DESC, total_juegos DESC
     LIMIT 90`,
    [from, to]
  );
  return rows.map((r) => ({
    fechaIso:
      r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha).slice(0, 10),
    turno: String(r.turno || ''),
    totalJuegos: Number(r.totalJuegos || 0),
    fechaTxt: String(r.fechaTxt || ''),
    guardadoEn:
      r.guardadoEn instanceof Date ? r.guardadoEn.toISOString() : String(r.guardadoEn || ''),
  }));
}

/** Migra `planillaPorDia` del estado JSON a MySQL (no reduce totales ya guardados). */
export async function migratePlanillaPorDiaToMysql(planillaPorDia) {
  if (!isGestorMysqlReady() || !planillaPorDia || typeof planillaPorDia !== 'object') {
    return { imported: 0 };
  }
  await ensurePlanillaHistorialTable();
  let imported = 0;
  for (const snap of Object.values(planillaPorDia)) {
    if (!snap?.consolidado?.length) continue;
    try {
      const r = await upsertPlanillaHistorial(
        {
          fechaIso: snap.fechaIso,
          turno: snap.turno,
          totalJuegos: snap.totalJuegos,
          fechaTxt: snap.fechaTxt,
          consolidado: snap.consolidado,
          resumenOpl: snap.resumenOpl,
        },
        { force: false }
      );
      if (r.ok && !r.skipped) imported += 1;
      else if (r.ok && r.reason === 'conserva-mayor') {
        /* ya había mejor */
      } else if (r.ok) imported += 1;
    } catch (_) {
      /* ignore fila */
    }
  }
  return { imported };
}
