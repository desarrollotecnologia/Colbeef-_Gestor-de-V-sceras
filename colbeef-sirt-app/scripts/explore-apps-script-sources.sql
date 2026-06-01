-- =============================================================================
-- De dónde salen en BD los 3 insumos típicos del Apps Script (Excel → hojas)
--
-- 1) PRODUCTOS EN CAVA / ESTADO DE CAVA  →  hoja "Estado_Cavas" en GAS
--    En Node hoy: trazabilidad_proceso.parte_producto + tipo_parte_producto
--    (ver fetchEstadoCavasRows en server/gestor/sirtSync.js)
--
-- 2) DECOMISO / REPORTE DECOMISOS       →  hoja "Reporte_Decomisos" en GAS
--    En Node hoy: sai.decomiso + tipo_parte_producto
--    (ver fetchReporteDecomisosRows)
--
-- 3) SALIDAS DE CAVA / DESPACHOS        →  en GAS suele ser Excel "Despachos_Cavas"
--    En Node hoy (defecto): despachosColbeefGrouped = programados ERP (despacho_desposte)
--    Alternativa: SIRT_DESPACHOS_FUENTE=riel → parte_producto_cava_riel.fecha_salida
--
--    NOTA: En el API de métricas (metrics.js) "salida de cava" también se cuenta
--    con parte_producto_cava_riel + fecha_salida — puede ser otra vista del mismo
--    negocio (salida física riel vs venta/despacho). Compare ambas si los números
--    no coinciden con lo que esperan de planta.
--
-- Reemplace '2026-05-11' por la fecha que quiera explorar.
-- =============================================================================

-- --- A) Columnas disponibles (descubrimiento; ejecute por partes si alguna falla) ---
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'trazabilidad_proceso'
  AND table_name IN ('parte_producto', 'parte_producto_cava_riel')
ORDER BY table_name, ordinal_position;

SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'sai' AND table_name = 'decomiso'
ORDER BY ordinal_position;

SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'trazabilidad_proceso'
  AND table_name = 'vw_producto_vendido_colbeef'
ORDER BY ordinal_position;

-- --- B1) "Productos en cava" / estado (equivalente Estado_Cavas del gestor) ---
SELECT
  pp.id_producto,
  t.nombre AS tipo_producto,
  pp.identificacion,
  pp.fecha_registro,
  pp.con_destino,
  pp.observaciones
FROM trazabilidad_proceso.parte_producto pp
JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
WHERE pp.fecha_registro::date = '2026-05-11'::date
  AND (
    t.nombre ILIKE '%visc%'
    OR t.nombre ILIKE '%cabeza%'
    OR t.nombre ILIKE '%pata%'
    OR t.nombre ILIKE '%mano%'
  )
ORDER BY pp.fecha_registro DESC
LIMIT 100;

SELECT count(*) AS filas_estado_cavas_mismo_filtro_gestor
FROM trazabilidad_proceso.parte_producto pp
JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
WHERE pp.fecha_registro::date = '2026-05-11'::date
  AND (
    t.nombre ILIKE '%visc%'
    OR t.nombre ILIKE '%cabeza%'
    OR t.nombre ILIKE '%pata%'
    OR t.nombre ILIKE '%mano%'
  );

-- --- B2) Decomisos (equivalente Reporte_Decomisos) ---
SELECT
  d.id,
  d.codigo_maquina,
  d.fecha_registro,
  t.nombre AS producto,
  d.peso,
  d.observacion
FROM sai.decomiso d
JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = d.id_tipo_parte_producto
WHERE d.fecha_registro::date = '2026-05-11'::date
ORDER BY d.fecha_registro DESC
LIMIT 100;

SELECT count(*) AS filas_decomiso_dia
FROM sai.decomiso d
WHERE d.fecha_registro::date = '2026-05-11'::date;

-- --- B3) Despachos / "salidas" comerciales (equivalente Despachos_Cavas del gestor) ---
SELECT
  v.lote_interno,
  v.propietario,
  v.categoria,
  v.descripcion_productos,
  v.orden_despacho,
  v.placa_vehiculo,
  v.fecha_despacho_planta
FROM trazabilidad_proceso.vw_producto_vendido_colbeef v
WHERE v.fecha_despacho_planta::date = '2026-05-11'::date
ORDER BY v.fecha_despacho_planta DESC
LIMIT 100;

SELECT count(*) AS filas_vw_despacho_dia
FROM trazabilidad_proceso.vw_producto_vendido_colbeef v
WHERE v.fecha_despacho_planta::date = '2026-05-11'::date;

-- --- B4) Salida física cava–riel (usada en metrics.js; puede no estar en el gestor) ---
SELECT pcr.*
FROM trazabilidad_proceso.parte_producto_cava_riel pcr
WHERE pcr.fecha_salida::date = '2026-05-11'::date
ORDER BY pcr.fecha_salida DESC
LIMIT 50;

SELECT count(*) AS filas_cava_riel_salida_dia
FROM trazabilidad_proceso.parte_producto_cava_riel pcr
WHERE pcr.fecha_salida::date = '2026-05-11'::date;

-- --- C) Cruce que usa el gestor (ID estado = codigo_maquina o id decomiso) ---
WITH est AS (
  SELECT DISTINCT trim(pp.id_producto::text) AS id
  FROM trazabilidad_proceso.parte_producto pp
  JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
  WHERE pp.fecha_registro::date = '2026-05-11'::date
    AND (
      t.nombre ILIKE '%visc%'
      OR t.nombre ILIKE '%cabeza%'
      OR t.nombre ILIKE '%pata%'
      OR t.nombre ILIKE '%mano%'
    )
),
dec AS (
  SELECT DISTINCT coalesce(nullif(trim(d.codigo_maquina), ''), d.id::text) AS id
  FROM sai.decomiso d
  WHERE d.fecha_registro::date = '2026-05-11'::date
)
SELECT
  (SELECT count(*) FROM est) AS ids_estado,
  (SELECT count(*) FROM dec) AS ids_reporte,
  (SELECT count(*) FROM est e INNER JOIN dec d ON d.id = e.id) AS ids_cruce_exacto;
