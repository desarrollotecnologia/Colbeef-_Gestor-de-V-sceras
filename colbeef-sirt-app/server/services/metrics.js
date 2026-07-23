/**
 * Métricas agregadas para endpoints REST y exportaciones.
 *
 * Esta capa consulta períodos históricos. No sustituye el dashboard operativo
 * de `gestor/engine.js`, que trabaja con fecha, turno y estado de sesión.
 */
import { query } from '../db.js';
import { DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL } from '../gestor/sql/despachosColbeefGrouped.js';

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
 * Calcula KPIs históricos en un rango explícito o en los últimos N días.
 *
 * `totalSalidas` representa códigos base registrados; `conSalidaCava` cuenta
 * códigos base con salida física. La diferencia se expone como pendiente.
 *
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
    ? `d.fecha BETWEEN $1::date AND $2::date`
    : `d.fecha >= CURRENT_DATE - $1::int`;

  const pVw = useRange ? [days, from, to] : [days, null, null];

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
    SELECT COUNT(DISTINCT CONCAT(TRIM(d.id_producto), '|', d.id_parte_producto))::int AS total
    FROM a_trazabilidad_proceso.a_vehiculo_asignado_decomisado d
    WHERE ${condDecom}
      AND NULLIF(TRIM(d.id_producto), '') IS NOT NULL
      AND COALESCE(UPPER(TRIM(d.accion)), 'INSERT') <> 'DELETE'
  `;
  const { rows: dRows } = await query(decomSql, p);

  const vwSql = `
    SELECT
      COUNT(*)::int AS filas,
      COALESCE(SUM(v.sum), 0)::numeric(18,2) AS kg_total,
      COUNT(DISTINCT v.propietario)::int AS propietarios
    FROM (${DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL}) v
  `;
  const { rows: vRows } = await query(vwSql, pVw);

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

/** Agrupa la vista filtrada de despachos por propietario y suma su peso. */
export async function getDespachosPorPropietario({ days = 7, from, to, limit = 50 } = {}) {
  const useRange = from && to;
  const p = useRange ? [from, to] : [clampDays(days)];
  const d = clampDays(days);
  const pVw = useRange ? [d, from, to] : [p[0], null, null];
  const lim = Math.min(Number(limit) || 50, 200);
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(v.propietario), ''), '(Sin propietario)') AS propietario,
      COUNT(*)::int AS filas,
      COALESCE(SUM(v.sum), 0)::numeric(18,2) AS kg,
      COUNT(DISTINCT v.orden_despacho)::int AS ordenes
    FROM (${DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL}) v
    GROUP BY 1
    ORDER BY kg DESC NULLS LAST
    LIMIT ${lim}
  `;
  const { rows } = await query(sql, pVw);
  return { success: true, rows };
}

/** Devuelve las categorías con mayor peso para el período solicitado. */
export async function getCategoriasVw({ days = 7, from, to, limit = 20 } = {}) {
  const useRange = from && to;
  const p = useRange ? [from, to] : [clampDays(days)];
  const d = clampDays(days);
  const pVw = useRange ? [d, from, to] : [p[0], null, null];
  const lim = Math.min(Number(limit) || 20, 100);
  const sql = `
    SELECT
      COALESCE(NULLIF(TRIM(v.categoria), ''), '(Sin categoría)') AS categoria,
      COALESCE(SUM(v.sum), 0)::numeric(18,2) AS kg
    FROM (${DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL}) v
    GROUP BY 1
    ORDER BY kg DESC
    LIMIT ${lim}
  `;
  const { rows } = await query(sql, pVw);
  return { success: true, rows };
}
