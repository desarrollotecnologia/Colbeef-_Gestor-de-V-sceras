import { query } from '../db.js';
import { mapTipoProductoNombre } from './engineUtils.js';

const SYNC_DAYS = Number(process.env.SIRT_SYNC_DAYS || 120);

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
      COALESCE(v.propietario, pp.identificacion, 'SIN PROPIETARIO')::text AS c3,
      to_char(pp.fecha_registro, 'DD/MM/YYYY HH24:MI')::text AS c4,
      COALESCE(pp.con_destino, '')::text AS c8,
      t.nombre::text AS c6_tipo,
      COALESCE(pp.observaciones, '')::text AS c13
    FROM trazabilidad_proceso.parte_producto pp
    JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
    LEFT JOIN LATERAL (
      SELECT v2.propietario
      FROM trazabilidad_proceso.vw_producto_vendido_colbeef v2
      WHERE v2.lote_interno = pp.id_producto
      ORDER BY v2.fecha_despacho_planta DESC NULLS LAST
      LIMIT 1
    ) v ON TRUE
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
  const from = normDate(range.from);
  const to = normDate(range.to);
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
    FROM trazabilidad_proceso.vw_producto_vendido_colbeef v
    WHERE (
      ($2::date IS NOT NULL OR $3::date IS NOT NULL)
      OR v.fecha_despacho_planta >= (CURRENT_DATE - $1::int)
    )
      AND ($2::date IS NULL OR v.fecha_despacho_planta::date >= $2::date)
      AND ($3::date IS NULL OR v.fecha_despacho_planta::date <= $3::date)
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
