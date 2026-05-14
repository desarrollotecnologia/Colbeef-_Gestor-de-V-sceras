import { query } from '../db.js';
import { mapTipoProductoNombre } from './engineUtils.js';
import { DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL } from './sql/despachosColbeefGrouped.js';

const SYNC_DAYS = Number(process.env.SIRT_SYNC_DAYS || 120);
/** Si from=to (un día), ampliar inicio del filtro de sai.decomiso (días hacia atrás). En planta los decomisos suelen quedar con fecha_registro del día hábil anterior al corte de estado. 0 = solo ese día. */
const DECOMISO_EXTRA_DAYS_BEFORE = Math.max(
  0,
  Math.min(7, Number(process.env.SIRT_DECOMISO_EXTRA_DAYS_BEFORE ?? 1))
);
const DECOMISO_EXTRA_DAYS_AFTER = Math.max(
  0,
  Math.min(7, Number(process.env.SIRT_DECOMISO_EXTRA_DAYS_AFTER ?? 0))
);

function isoAddDays(iso, delta) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta);
  return new Date(t).toISOString().slice(0, 10);
}

/** Para un solo día SIRT, el reporte de decomisos a menudo viene con fecha_registro desfasada (ej. 13 vs estado 14). */
function rangoEfectivoDecomiso(from, to) {
  if (!from || !to || from !== to) return { from, to };
  return {
    from: isoAddDays(from, -DECOMISO_EXTRA_DAYS_BEFORE),
    to: isoAddDays(to, DECOMISO_EXTRA_DAYS_AFTER),
  };
}

function normDate(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 14 columnas B–O (índices 0..13) */
export async function fetchEstadoCavasRows(range = {}) {
  const from = normDate(range.from);
  const to = normDate(range.to);
  const sql = `
    SELECT
      pp.id_producto::text AS c0,
      t.nombre::text AS c1,
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), 'SIN PROPIETARIO')::text AS c3,
      to_char(pp.fecha_registro, 'DD/MM/YYYY HH24:MI')::text AS c4,
      COALESCE(pp.con_destino, '')::text AS c8,
      t.nombre::text AS c6_tipo,
      COALESCE(pp.observaciones, '')::text AS c13
    FROM trazabilidad_proceso.parte_producto pp
    JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
    WHERE (
      ($2::date IS NOT NULL OR $3::date IS NOT NULL)
      OR pp.fecha_registro >= (CURRENT_DATE - $1::int)
    )
      AND ($2::date IS NULL OR pp.fecha_registro::date >= $2::date)
      AND ($3::date IS NULL OR pp.fecha_registro::date <= $3::date)
      AND (
        t.nombre ILIKE '%visc%'
        OR t.nombre ILIKE '%cabeza%'
        OR t.nombre ILIKE '%pata%'
        OR t.nombre ILIKE '%mano%'
      )
    ORDER BY pp.fecha_registro DESC
    LIMIT 40000
  `;
  const { rows } = await query(sql, [SYNC_DAYS, from, to]);
  return rows.map((r) => {
    const out = new Array(14).fill('');
    out[0] = r.c0;
    out[1] = r.c1;
    out[3] = r.c3;
    out[4] = r.c4;
    out[6] = r.c6_tipo;
    out[8] = r.c8;
    out[13] = r.c13;
    return out;
  });
}

export async function fetchReporteDecomisosRows(range = {}) {
  const fromRaw = normDate(range.from);
  const toRaw = normDate(range.to);
  const { from, to } = rangoEfectivoDecomiso(fromRaw, toRaw);
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(d.codigo_maquina), ''), d.id::text) AS id,
      d.fecha_registro AS fr,
      t.nombre AS producto,
      d.peso::text AS cantidad,
      COALESCE(d.observacion, '') AS motivo,
      ''::text AS responsable
    FROM sai.decomiso d
    JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = d.id_tipo_parte_producto
    WHERE (
      ($2::date IS NOT NULL OR $3::date IS NOT NULL)
      OR d.fecha_registro >= (CURRENT_DATE - $1::int)
    )
      AND ($2::date IS NULL OR d.fecha_registro::date >= $2::date)
      AND ($3::date IS NULL OR d.fecha_registro::date <= $3::date)
    ORDER BY d.fecha_registro DESC
    LIMIT 50000
  `;
  const { rows } = await query(sql, [SYNC_DAYS, from, to]);
  return rows.map((r) => [
    r.id,
    r.fr instanceof Date ? r.fr.toISOString().slice(0, 10) : String(r.fr ?? ''),
    r.producto,
    r.cantidad,
    r.motivo,
    r.responsable,
  ]);
}

export async function fetchDespachosCavasRows(range = {}) {
  const from = normDate(range.from);
  const to = normDate(range.to);
  const days = Math.min(SYNC_DAYS, 60);
  const sql = `
    SELECT
      v.lote_interno::text AS id,
      v.propietario::text AS prop,
      v.categoria::text AS cat,
      v.descripcion_productos::text AS descr,
      v.orden_despacho::text AS orden,
      v.placa_vehiculo::text AS placa
    FROM (${DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL}) v
    ORDER BY v.fecha_despacho_planta DESC
    LIMIT 80000
  `;
  const { rows } = await query(sql, [days, from, to]);
  return rows.map((r) => {
    const tipo = mapTipoProductoNombre(r.cat || r.descr || '');
    const puesto = [r.orden || '', r.placa || '', r.descr || ''].filter(Boolean).join(' / ');
    const row = new Array(13).fill('');
    row[3] = r.id || '';
    row[4] = r.prop || '';
    row[7] = tipo;
    row[9] = puesto;
    return row;
  });
}
