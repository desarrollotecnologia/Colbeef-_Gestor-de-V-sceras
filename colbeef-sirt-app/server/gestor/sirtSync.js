import { query } from '../db.js';
import { TIPOS_PRODUCTO } from './constants.js';
import {
  detectarTurnoPorFechaISO,
  mapTipoProductoNombre,
  resolverTurnoOperacion,
} from './engineUtils.js';
import { DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL } from './sql/despachosColbeefGrouped.js';

const SYNC_DAYS = Number(process.env.SIRT_SYNC_DAYS || 120);
const CAVA_LOOKBACK_DAYS = Math.max(
  1,
  Math.min(30, Number(process.env.SIRT_CAVA_LOOKBACK_DAYS ?? 30))
);
const SALIDAS_CAVA_LOOKBACK_DAYS = Math.max(
  1,
  Math.min(30, Number(process.env.SIRT_SALIDAS_CAVA_LOOKBACK_DAYS ?? 30))
);
/** Días hacia atrás de fecha_programacion_despacho (rezago mismo turno / ISODOW). */
const PROGRAMACION_REZAGO_DAYS = Math.max(
  1,
  Math.min(60, Number(process.env.SIRT_PROGRAMACION_REZAGO_DAYS ?? 21))
);
/** Días hacia atrás desde la fecha de consulta (automático; el usuario no configura esto). */
const DECOMISO_LOOKBACK_DAYS = Math.max(
  1,
  Math.min(30, Number(process.env.SIRT_DECOMISO_LOOKBACK_DAYS ?? 7))
);

const TIPOS_SUBPRODUCTO = `('Visceras Rojas', 'Visceras Blancas', 'Cabeza', 'Patas y Manos')`;

/** Joins comunes a consultas de cava (en stock y salidas). */
const SQL_CAVA_FROM = `
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto
     AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto
     AND tpp.nombre IN ${TIPOS_SUBPRODUCTO}
    JOIN trazabilidad_proceso.producto p
      ON p.id::text = pp.id_producto::text
    JOIN trazabilidad_proceso.producto_empresa pe
      ON pe.id_producto::text = p.id::text
     AND pe.activo = true
    JOIN organizaciones.empresa e3
      ON e3.id = pe.id_empresa
    LEFT JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text
     AND ppe.id_parte_producto = pp.id
    LEFT JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    LEFT JOIN organizaciones.sucursal s
      ON s.id = ppel.id_local
    LEFT JOIN trazabilidad_proceso.destino de
      ON de.id = s.id_destino
`;

function isoAddDays(iso, delta) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta);
  return new Date(t).toISOString().slice(0, 10);
}

function normDate(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function fmtDateCell(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').trim();
}

function fmtDateTimeCell(v) {
  if (v instanceof Date) {
    const d = v;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(v ?? '').trim();
}

function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rango automático de decomisos: desde (fecha tope − N días) hasta fecha tope (inclusive).
 * La fecha tope es la del encabezado (`date`/`from`/`to`) o hoy si no se indica.
 */
export function rangoDecomisosAutomatico(range = {}) {
  const to =
    normDate(range.to) || normDate(range.from) || normDate(range.date) || hoyIso();
  const from = isoAddDays(to, -DECOMISO_LOOKBACK_DAYS);
  return { from, to, lookbackDias: DECOMISO_LOOKBACK_DAYS };
}

const SQL_DECOMISO_FROM = `
    FROM sai.inspeccion i
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = i.id_parte_producto
     AND pp.id_producto::text = i.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp_puesto
      ON tpp_puesto.id = pp.id_tipo_parte_producto
    JOIN sai.inspeccion_decomiso id_dec
      ON id_dec.id_inspeccion = i.id
    JOIN sai.decomiso "dec"
      ON "dec".id = id_dec.id_decomiso
    LEFT JOIN trazabilidad_proceso.tipo_parte_producto tpp_sub
      ON tpp_sub.id = "dec".id_tipo_parte_producto
    LEFT JOIN sai.decomiso_enfermedad de_enf
      ON de_enf.id_decomiso = "dec".id
    LEFT JOIN sai.enfermedad enf
      ON enf.id = de_enf.id_enfermedad
`;

function buildPuestoDespacho(r) {
  return [r.sucursal_origen || '', r.destino || '', r.riel ? `Riel ${r.riel}` : ''].filter(Boolean).join(' / ');
}

/** Puesto/destino como en ERP (orden · placa · producto); el turno suele ir en orden_despacho (/LxM/). */
function buildPuestoDespachoColbeef(r) {
  return [r.orden_despacho, r.placa_vehiculo, r.descripcion_productos]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' / ');
}

function filaDespachoDesdeColbeef(r) {
  const tipo = mapTipoProductoNombre(r.descripcion_productos);
  if (!TIPOS_PRODUCTO.includes(tipo)) return null;
  const puesto = buildPuestoDespachoColbeef(r);
  if (!puesto) return null;
  const row = new Array(13).fill('');
  row[0] = fmtDateCell(r.fecha_despacho_planta);
  row[1] = '';
  row[3] = String(r.lote_interno ?? '').trim();
  row[4] = String(r.propietario ?? '').trim();
  row[5] = r.peso != null ? String(r.peso) : '';
  row[7] = tipo;
  row[8] = String(r.cliente ?? '').trim();
  row[9] = puesto;
  row[10] = String(r.orden_despacho ?? '').trim().split('/')[0] || '';
  row[12] = '';
  return row;
}

/** Matriz 14 columnas (Estado_Cavas / productos en cava). */
export function estadoCavaRowToDto(fila) {
  const obs = String(fila[13] ?? '').trim();
  return {
    codigo: String(fila[0] ?? '').trim(),
    descripcion: String(fila[1] ?? '').trim(),
    pesoPie: String(fila[2] ?? '').trim(),
    propietario: String(fila[3] ?? '').trim(),
    ingresoCava: String(fila[4] ?? '').trim(),
    sucursalOrigen: String(fila[5] ?? '').trim(),
    destino: String(fila[8] ?? '').trim(),
    riel: String(fila[7] ?? '').trim(),
    observaciones: obs,
    observacion: obs,
  };
}

/** Matriz 13 columnas (Despachos_Cavas / salidas de cava). */
export function despachoCavaRowToDto(fila) {
  const tipo = String(fila[7] ?? '').trim();
  return {
    fechaSalida: String(fila[0] ?? '').trim(),
    fechaIngreso: String(fila[1] ?? '').trim(),
    codigo: String(fila[3] ?? '').trim(),
    descripcion: tipo,
    tipoProducto: tipo,
    pesoPie: String(fila[5] ?? '').trim(),
    propietario: String(fila[4] ?? '').trim(),
    destino: String(fila[8] ?? '').trim(),
    codigoNuevaSucursal: String(fila[10] ?? '').trim(),
    puesto: String(fila[9] ?? '').trim(),
    cava: String(fila[6] ?? '').trim(),
    riel: String(fila[2] ?? '').trim(),
    observaciones: String(fila[12] ?? '').trim(),
  };
}

/**
 * Consulta 2 — Subproductos en cava.
 * stockActual=true (defecto): solo filas con fecha_salida IS NULL (stock físico ahora).
 * stockActual=false: snapshot histórico en fecha asOf (para análisis puntual).
 */
export async function fetchEstadoCavasRows(range = {}) {
  const from = normDate(range.from);
  const to = normDate(range.to);
  const asOf = to || from;
  const stockActual = range.stockActual !== false;
  const sql = stockActual
    ? `
    SELECT
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
      tpp.nombre::text AS descripcion,
      COALESCE(p.peso_animal_pie::text, '') AS peso_pie,
      COALESCE(NULLIF(TRIM(e3.nombre), ''), 'SIN PROPIETARIO')::text AS propietario,
      ppcr.fecha_ingreso AS fecha_ingreso,
      COALESCE(s.nombre, '')::text AS sucursal_origen,
      COALESCE(de.nombre, '')::text AS destino,
      COALESCE(ppcr.id_riel::text, '') AS riel,
      COALESCE(pp.observaciones, '')::text AS observaciones
    ${SQL_CAVA_FROM}
    WHERE ppcr.fecha_salida IS NULL
      AND ppcr.fecha_ingreso >= (CURRENT_DATE - $1::int)
    ORDER BY ppcr.fecha_ingreso DESC
    LIMIT 40000
  `
    : `
    SELECT
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
      tpp.nombre::text AS descripcion,
      COALESCE(p.peso_animal_pie::text, '') AS peso_pie,
      COALESCE(NULLIF(TRIM(e3.nombre), ''), 'SIN PROPIETARIO')::text AS propietario,
      ppcr.fecha_ingreso AS fecha_ingreso,
      COALESCE(s.nombre, '')::text AS sucursal_origen,
      COALESCE(de.nombre, '')::text AS destino,
      COALESCE(ppcr.id_riel::text, '') AS riel,
      COALESCE(pp.observaciones, '')::text AS observaciones
    ${SQL_CAVA_FROM}
    WHERE (
      (
        $4::date IS NOT NULL
        AND ppcr.fecha_ingreso::date <= $4::date
        AND ppcr.fecha_ingreso::date >= ($4::date - $1::int)
        AND (ppcr.fecha_salida IS NULL OR ppcr.fecha_salida::date > $4::date)
      )
      OR (
        $4::date IS NULL
        AND ppcr.fecha_salida IS NULL
        AND ppcr.fecha_ingreso >= (CURRENT_DATE - $1::int)
        AND ($2::date IS NULL OR ppcr.fecha_ingreso::date >= $2::date)
        AND ($3::date IS NULL OR ppcr.fecha_ingreso::date <= $3::date)
      )
    )
    ORDER BY ppcr.fecha_ingreso DESC
    LIMIT 40000
  `;
  const params = stockActual ? [CAVA_LOOKBACK_DAYS] : [CAVA_LOOKBACK_DAYS, from, to, asOf];
  const { rows } = await query(sql, params);
  return rows.map((r) => {
    const out = new Array(14).fill('');
    out[0] = r.codigo;
    out[1] = r.descripcion;
    out[2] = r.peso_pie;
    out[3] = r.propietario;
    out[4] = fmtDateTimeCell(r.fecha_ingreso);
    out[5] = r.sucursal_origen;
    out[6] = r.descripcion;
    out[7] = r.riel;
    out[8] = r.destino;
    out[13] = r.observaciones;
    return out;
  });
}

/** DTO detallado para UI (consulta SAI.decomiso). */
export function decomisoDetalleToDto(r) {
  const fecha =
    r.fecha_registro instanceof Date
      ? r.fecha_registro.toISOString().slice(0, 10)
      : fmtDateCell(r.fecha_registro);
  return {
    codigo: String(r.codigo ?? '').trim(),
    puesto: String(r.puesto ?? '').trim(),
    producto: String(r.subproducto ?? '').trim(),
    peso: String(r.peso ?? '').trim(),
    fecha,
    hora: String(r.hora_registro ?? '').trim(),
    responsable: String(r.responsable ?? '').trim(),
    causa: String(r.causa ?? '').trim(),
    observaciones: String(r.observacion ?? '').trim(),
  };
}

/** Matriz Reporte_Decomisos (6 cols) para cruce con Estado_Cavas. */
function mapDecomisoRowToReporteMatrix(r) {
  const fecha =
    r.fecha_registro instanceof Date
      ? r.fecha_registro.toISOString().slice(0, 10)
      : fmtDateCell(r.fecha_registro);
  const codigo = String(r.codigo ?? '').trim();
  return [
    codigo,
    fecha,
    String(r.subproducto ?? '').trim() || 'Subproducto',
    '1',
    String(r.causa ?? '').trim() || 'Por especificar',
    String(r.responsable ?? '').trim(),
    String(r.puesto ?? '').trim(),
    String(r.hora_registro ?? '').trim(),
    String(r.peso ?? '').trim(),
    String(r.observacion ?? '').trim(),
  ];
}

/**
 * Reporte_Decomisos desde SAI (inspección + decomiso + enfermedad).
 * Ventana automática: últimos N días hasta la fecha de consulta (por defecto 7).
 */
export async function fetchReporteDecomisosRows(range = {}) {
  const { from, to, lookbackDias } = rangoDecomisosAutomatico(range);
  const params = [from, to];
  const sqlRows = `
    SELECT
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text) AS codigo,
      tpp_puesto.nombre::text AS puesto,
      COALESCE(tpp_sub.nombre, 'Subproducto')::text AS subproducto,
      COALESCE("dec".peso::text, '') AS peso,
      "dec".fecha_registro AS fecha_registro,
      to_char("dec".hora_registro, 'HH24:MI') AS hora_registro,
      COALESCE(NULLIF(TRIM("dec".user_name), ''), '') AS responsable,
      COALESCE(enf.nombre, 'Por especificar')::text AS causa,
      COALESCE("dec".observacion, '')::text AS observacion
    ${SQL_DECOMISO_FROM}
    WHERE "dec".fecha_registro::date BETWEEN $1::date AND $2::date
    ORDER BY "dec".fecha_registro DESC, "dec".hora_registro DESC
    LIMIT 50000
  `;
  const sqlStats = `
    SELECT
      COUNT(*)::int AS filas_en_rango,
      COUNT(DISTINCT "dec".id)::int AS decomisos_unicos,
      COUNT(DISTINCT COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text))::int AS con_codigo
    ${SQL_DECOMISO_FROM}
    WHERE "dec".fecha_registro::date BETWEEN $1::date AND $2::date
  `;
  const [main, stats] = await Promise.all([query(sqlRows, params), query(sqlStats, params)]);
  const st = stats.rows[0] || {};
  const detalle = main.rows.map(decomisoDetalleToDto);
  const rows = main.rows.map(mapDecomisoRowToReporteMatrix);
  return {
    rows,
    detalle,
    vinculo: {
      fuente: 'sai.decomiso',
      desde: from,
      hasta: to,
      lookbackDias,
      filasEnRango: Number(st.filas_en_rango || 0),
      decomisosUnicos: Number(st.decomisos_unicos || 0),
      conIdProducto: Number(st.con_codigo || 0),
      conTipoProducto: detalle.length,
      conCodigoMaquina: Number(st.con_codigo || 0),
      conIdRegistroSesion: detalle.length,
    },
  };
}

/**
 * Animales decomisados (vw_decomisos) en ventana de fechas — cruce en app con piezas en cava
 * (evita JOIN LIKE lento en PostgreSQL).
 */
export async function fetchDecomisosAnimalesVw(range = {}) {
  const { from, to, lookbackDias } = rangoDecomisosAutomatico(range);
  const sql = `
    SELECT DISTINCT ON (TRIM(vd.codigo_animal::text))
      TRIM(vd.codigo_animal::text) AS codigo_animal,
      TRIM(vd.tipo_parte::text) AS tipo_parte,
      vd.fecha_registro
    FROM trazabilidad_proceso.vw_decomisos vd
    WHERE vd.fecha_registro::date BETWEEN $1::date AND $2::date
      AND NULLIF(TRIM(vd.codigo_animal::text), '') IS NOT NULL
    ORDER BY TRIM(vd.codigo_animal::text), vd.fecha_registro DESC
    LIMIT 50000
  `;
  const { rows } = await query(sql, [from, to]);
  return {
    rows,
    desde: from,
    hasta: to,
    lookbackDias,
    animalesUnicos: rows.length,
  };
}

/** Vista previa de decomisos SIRT para el frontend. */
export async function consultarDecomisosDesdeSirt(range = {}) {
  const pack = await fetchReporteDecomisosRows(range);
  return {
    success: true,
    desde: pack.vinculo.desde,
    hasta: pack.vinculo.hasta,
    lookbackDias: pack.vinculo.lookbackDias,
    totalFilas: pack.detalle.length,
    filas: pack.detalle,
    vinculo: pack.vinculo,
  };
}

/**
 * Salida física cava–riel (fecha_salida ya registrada en SIRT).
 * Fuente alternativa: SIRT_DESPACHOS_FUENTE=riel
 */
async function fetchDespachosCavaRielRows(range = {}) {
  const from = normDate(range.from);
  const to = normDate(range.to);
  const sql = `
    SELECT
      ppcr.fecha_salida AS fecha_salida,
      ppcr.fecha_ingreso AS fecha_ingreso,
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
      tpp.nombre::text AS descripcion,
      COALESCE(p.peso_animal_pie::text, '') AS peso_pie,
      COALESCE(NULLIF(TRIM(e3.nombre), ''), 'SIN PROPIETARIO')::text AS propietario,
      COALESCE(s.nombre, '')::text AS sucursal_origen,
      COALESCE(de.nombre, '')::text AS destino,
      split_part(COALESCE(de.nombre, ''), '/', 1) AS codigo_nueva_sucursal,
      COALESCE(ppcr.id_riel::text, '') AS riel,
      COALESCE(pp.observaciones, '')::text AS observaciones
    ${SQL_CAVA_FROM}
    WHERE (
      ($2::date IS NOT NULL OR $3::date IS NOT NULL)
      OR ppcr.fecha_salida >= (CURRENT_DATE - $1::int)
    )
      AND ppcr.fecha_salida IS NOT NULL
      AND ($2::date IS NULL OR ppcr.fecha_salida::date >= $2::date)
      AND ($3::date IS NULL OR ppcr.fecha_salida::date <= $3::date)
    ORDER BY ppcr.fecha_salida DESC
    LIMIT 80000
  `;
  const { rows } = await query(sql, [SALIDAS_CAVA_LOOKBACK_DAYS, from, to]);
  return rows.map((r) => {
    const row = new Array(13).fill('');
    row[0] = fmtDateCell(r.fecha_salida);
    row[1] = fmtDateCell(r.fecha_ingreso);
    row[3] = r.codigo || '';
    row[4] = r.propietario || '';
    row[5] = r.peso_pie || '';
    row[7] = r.descripcion || '';
    row[8] = r.destino || '';
    row[9] = buildPuestoDespacho(r);
    row[10] = String(r.codigo_nueva_sucursal || '').trim();
    row[12] = r.observaciones || '';
    return row;
  });
}

/**
 * Opción B — En cava ahora + programación del mismo turno (ISODOW) que la fecha operación.
 * Incluye rezago: piezas programadas en martes anteriores (MxM) que siguen sin salida de cava.
 * Turno y sufijo /LxM/… se toman de la fecha del encabezado, no de una fecha fija en SQL.
 */
async function fetchDespachosProgramadosCavaRows(range = {}) {
  const fechaOp =
    normDate(range.from) || normDate(range.date) || normDate(range.to) || hoyIso();
  const turnoOp = detectarTurnoPorFechaISO(fechaOp);
  const sql = `
    SELECT
      ppel.fecha_programacion_despacho AS fecha_programada,
      ppcr.fecha_ingreso AS fecha_ingreso,
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text, ppcr.id_producto::text) AS codigo,
      tpp.nombre::text AS subproducto,
      COALESCE(p.peso_animal_pie::text, '') AS peso_pie,
      COALESCE(NULLIF(TRIM(e3.nombre), ''), 'SIN PROPIETARIO')::text AS propietario,
      COALESCE(de.nombre, '')::text AS destino,
      COALESCE(s.nombre, '')::text AS sucursal_origen,
      COALESCE(ppcr.id_riel::text, '') AS riel,
      COALESCE(pp.observaciones, '')::text AS observaciones,
      COALESCE(c.nombre, 'Cava Principal')::text AS cava_nombre,
      LPAD(COALESCE(s.id::text, '0'), 5, '0') || '/' ||
        UPPER(COALESCE(de.nombre, s.nombre, 'SIN CIUDAD')) || '/' ||
        UPPER(COALESCE(NULLIF(TRIM(s.direccion), ''), 'SIN DIRECCION')) || '/' ||
        $3::text || '/' AS puesto_turno
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto
     AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto
     AND TRIM(tpp.nombre) IN ${TIPOS_SUBPRODUCTO}
    JOIN trazabilidad_proceso.producto p
      ON p.id::text = pp.id_producto::text
    JOIN trazabilidad_proceso.producto_empresa pe
      ON pe.id_producto::text = p.id::text
     AND pe.activo = true
    JOIN organizaciones.empresa e3
      ON e3.id = pe.id_empresa
    JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text
     AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    JOIN organizaciones.sucursal s
      ON s.id = ppel.id_local
    LEFT JOIN trazabilidad_proceso.destino de
      ON de.id = s.id_destino
    LEFT JOIN trazabilidad_proceso.cava c
      ON c.id = ppcr.id_cava
    WHERE ppcr.fecha_salida IS NULL
      AND ppel.fecha_programacion_despacho IS NOT NULL
      AND EXTRACT(ISODOW FROM ppel.fecha_programacion_despacho) =
          EXTRACT(ISODOW FROM $2::date)
      AND ppel.fecha_programacion_despacho::date >= ($2::date - ($1::int * INTERVAL '1 day'))
    ORDER BY ppel.fecha_programacion_despacho DESC, ppcr.fecha_ingreso DESC
    LIMIT 80000
  `;
  const { rows } = await query(sql, [PROGRAMACION_REZAGO_DAYS, fechaOp, turnoOp]);
  return rows.map((r) => {
    const row = new Array(13).fill('');
    row[0] = fmtDateTimeCell(r.fecha_programada) || fmtDateCell(r.fecha_programada);
    row[1] = fmtDateTimeCell(r.fecha_ingreso) || fmtDateCell(r.fecha_ingreso);
    row[2] = r.riel || '';
    row[3] = r.codigo || '';
    row[4] = r.propietario || '';
    row[5] = r.peso_pie || '';
    row[6] = r.cava_nombre || '';
    row[7] = r.subproducto || '';
    row[8] = r.destino || '';
    row[9] = r.puesto_turno || '';
    row[10] = String(r.puesto_turno || '').split('/')[0] || '';
    row[12] = r.observaciones || '';
    return row;
  });
}

/**
 * Despachos programados ERP (orden de despacho / vehículo / fecha_despacho_planta).
 * Equiv. vw_producto_vendido_colbeef — fuente alternativa SIRT_DESPACHOS_FUENTE=erp
 */
async function fetchDespachosProgramadosColbeefRows(range = {}) {
  const from = normDate(range.from);
  const to = normDate(range.to);
  const sql = `
    SELECT
      v.fecha_despacho_planta,
      v.propietario,
      v.cliente,
      v.orden_despacho,
      v.placa_vehiculo,
      v.descripcion_productos,
      v.categoria,
      v.lote_interno,
      v.sum AS peso
    FROM (${DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL}) v
    WHERE v.categoria = 'SUBPRODUCTOS'
    ORDER BY v.fecha_despacho_planta DESC, v.orden_despacho, v.lote_interno
    LIMIT 80000
  `;
  const { rows } = await query(sql, [SALIDAS_CAVA_LOOKBACK_DAYS, from, to]);
  const out = [];
  rows.forEach((r) => {
    const row = filaDespachoDesdeColbeef(r);
    if (row) out.push(row);
  });
  return out;
}

/**
 * Consulta 1 — Despachos_Cavas del gestor.
 * programado (defecto): en cava + turno ISODOW de la fecha operación (+ rezago)
 * erp: despacho_desposte · riel: solo fecha_salida física
 */
export async function fetchDespachosCavasRows(range = {}) {
  const fuente = String(process.env.SIRT_DESPACHOS_FUENTE || 'programado').toLowerCase();
  if (fuente === 'riel' || fuente === 'cava_riel') {
    return fetchDespachosCavaRielRows(range);
  }
  if (fuente === 'erp' || fuente === 'colbeef') {
    return fetchDespachosProgramadosColbeefRows(range);
  }
  return fetchDespachosProgramadosCavaRows(range);
}

/** Payload listo para API/RPC — productos en cava. */
export async function consultarEnCavaDesdeSirt(range = {}) {
  const from = normDate(range.from);
  const to = normDate(range.to);
  const filas = await fetchEstadoCavasRows({ stockActual: true });
  return {
    success: true,
    modo: 'stock-actual',
    desde: from,
    hasta: to,
    lookbackDias: from && to ? null : CAVA_LOOKBACK_DAYS,
    totalFilas: filas.length,
    filas: filas.map(estadoCavaRowToDto),
  };
}

/** Payload listo para API/RPC — salidas de cava. */
export async function consultarSalidasCavaDesdeSirt(range = {}) {
  const from = normDate(range.from) || normDate(range.date);
  const to = normDate(range.to) || normDate(range.date);
  const fechaOp = from || normDate(range.date) || hoyIso();
  const filas = await fetchDespachosCavasRows({ from: fechaOp, to: fechaOp, date: range.date });
  const turno = detectarTurnoPorFechaISO(fechaOp);
  const fuente = String(process.env.SIRT_DESPACHOS_FUENTE || 'programado').toLowerCase();
  const modoTurnoIsodow = fuente === 'programado';
  return {
    success: true,
    modo: modoTurnoIsodow ? 'turno-isodow' : from && to ? 'fecha' : 'lookback',
    desde: fechaOp,
    hasta: to || fechaOp,
    fechaConsulta: fechaOp,
    turnoOperacion: turno,
    rezagoDias: modoTurnoIsodow ? PROGRAMACION_REZAGO_DAYS : null,
    lookbackDias: modoTurnoIsodow ? null : from && to ? null : SALIDAS_CAVA_LOOKBACK_DAYS,
    totalFilas: filas.length,
    filas: filas.map(despachoCavaRowToDto),
  };
}
