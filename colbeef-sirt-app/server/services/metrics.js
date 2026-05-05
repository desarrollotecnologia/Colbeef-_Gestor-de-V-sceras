import { query } from '../db.js';

const SQL_BASE_PP = `
  CASE
    WHEN pp.id_producto ~ '^[0-9]+-[0-9]+-'
    THEN substring(pp.id_producto from '^([0-9]+-[0-9]+)-')
    ELSE pp.id_producto
  END
`;

const SQL_BASE_PCR = `
  CASE
    WHEN pcr.id_producto ~ '^[0-9]+-[0-9]+-'
    THEN substring(pcr.id_producto from '^([0-9]+-[0-9]+)-')
    ELSE pcr.id_producto
  END
`;

const VISCERAS_TIPO = `
  (
    t.nombre ILIKE '%visc%'
    OR t.nombre ILIKE '%cabeza%'
    OR t.nombre ILIKE '%mano%'
    OR t.nombre ILIKE '%pata%'
  )
`;

function clampDays(d) {
  return Math.min(Math.max(Number(d) || 7, 1), 90);
}

/**
 * @param {{ days?: number, from?: string, to?: string }} opt
 */
export async function getDashboard(opt = {}) {
  const from = opt.from;
  const to = opt.to;
  const days = clampDays(opt.days);
  const useRange = from && to;
  const p = useRange ? [from, to] : [days];

  const condPP = useRange
    ? `pp.fecha_registro::date BETWEEN $1::date AND $2::date`
    : `pp.fecha_registro::date >= CURRENT_DATE - $1::int`;

  const condPCR = useRange
    ? `pcr.fecha_salida::date BETWEEN $1::date AND $2::date`
    : `pcr.fecha_salida::date >= CURRENT_DATE - $1::int`;

  const condDecom = useRange
    ? `d.fecha_registro BETWEEN $1::date AND $2::date`
    : `d.fecha_registro >= CURRENT_DATE - $1::int`;

  const condVw = useRange
    ? `v.fecha_despacho_planta::date BETWEEN $1::date AND $2::date`
    : `v.fecha_despacho_planta::date >= CURRENT_DATE - $1::int`;

  const juegosSql = `
    SELECT COUNT(DISTINCT ${SQL_BASE_PP})::int AS total
    FROM trazabilidad_proceso.parte_producto pp
    JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
    WHERE ${condPP}
      AND ${VISCERAS_TIPO}
  `;
  const { rows: jRows } = await query(juegosSql, p);

  const salidosSql = `
    SELECT COUNT(DISTINCT ${SQL_BASE_PCR})::int AS total
    FROM trazabilidad_proceso.parte_producto_cava_riel pcr
    WHERE ${condPCR}
  `;
  const { rows: sRows } = await query(salidosSql, p);

  const crudasSql = `
    SELECT COUNT(DISTINCT ${SQL_BASE_PP})::int AS total
    FROM trazabilidad_proceso.parte_producto pp
    JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
    WHERE ${condPP}
      AND t.nombre ILIKE '%visc%blanc%'
      AND (
        COALESCE(pp.observaciones, '') ILIKE '%cruda%'
        OR COALESCE(pp.con_destino, '') ILIKE '%cruda%'
      )
  `;
  const { rows: cRows } = await query(crudasSql, p);

  const decomSql = `
    SELECT COUNT(*)::int AS total
    FROM sai.decomiso d
    WHERE ${condDecom}
  `;
  const { rows: dRows } = await query(decomSql, p);

  const vwSql = `
    SELECT
      COUNT(*)::int AS filas,
      COALESCE(SUM(v.sum), 0)::numeric(18,2) AS kg_total,
      COUNT(DISTINCT v.propietario)::int AS propietarios
    FROM trazabilidad_proceso.vw_producto_vendido_colbeef v
    WHERE ${condVw}
  `;
  const { rows: vRows } = await query(vwSql, p);

  const totalSalidas = jRows[0]?.total ?? 0;
  const conSalidaCava = sRows[0]?.total ?? 0;
  const totalCrudas = cRows[0]?.total ?? 0;
  const totalDecomisos = dRows[0]?.total ?? 0;
  const vw = vRows[0] || { filas: 0, kg_total: 0, propietarios: 0 };

  let progreso = 0;
  let pendientes = 0;
  if (totalSalidas > 0) {
    if (conSalidaCava >= totalSalidas) {
      progreso = 100;
      pendientes = 0;
    } else {
      progreso = Math.min(100, Math.round((conSalidaCava / totalSalidas) * 100));
      pendientes = totalSalidas - conSalidaCava;
    }
  }

  return {
    success: true,
    dias: useRange ? null : days,
    desde: from || null,
    hasta: to || null,
    totalSalidas,
    conSalidaCava,
    totalDecomisos,
    totalCrudas,
    totalJuegosDespachar: pendientes,
    despachoKg: Number(vw.kg_total),
    filasVw: vw.filas,
    propietariosActivos: vw.propietarios,
    progreso,
    meta: totalSalidas,
  };
}

export async function getDespachosPorPropietario({ days = 7, from, to, limit = 50 } = {}) {
  const useRange = from && to;
  const p = useRange ? [from, to] : [clampDays(days)];
  const cond = useRange
    ? `fecha_despacho_planta::date BETWEEN $1::date AND $2::date`
    : `fecha_despacho_planta::date >= CURRENT_DATE - $1::int`;

  const lim = Math.min(Number(limit) || 50, 200);
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(propietario), ''), '(Sin propietario)') AS propietario,
      COUNT(*)::int AS filas,
      COALESCE(SUM(sum), 0)::numeric(18,2) AS kg,
      COUNT(DISTINCT orden_despacho)::int AS ordenes
    FROM trazabilidad_proceso.vw_producto_vendido_colbeef
    WHERE ${cond}
    GROUP BY 1
    ORDER BY kg DESC NULLS LAST
    LIMIT ${lim}
  `;
  const { rows } = await query(sql, p);
  return { success: true, rows };
}

export async function getCategoriasVw({ days = 7, from, to, limit = 20 } = {}) {
  const useRange = from && to;
  const p = useRange ? [from, to] : [clampDays(days)];
  const cond = useRange
    ? `fecha_despacho_planta::date BETWEEN $1::date AND $2::date`
    : `fecha_despacho_planta::date >= CURRENT_DATE - $1::int`;

  const lim = Math.min(Number(limit) || 20, 100);
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(categoria), ''), '(Sin categoría)') AS categoria,
      COALESCE(SUM(sum), 0)::numeric(18,2) AS kg
    FROM trazabilidad_proceso.vw_producto_vendido_colbeef
    WHERE ${cond}
    GROUP BY 1
    ORDER BY kg DESC
    LIMIT ${lim}
  `;
  const { rows } = await query(sql, p);
  return { success: true, rows };
}
