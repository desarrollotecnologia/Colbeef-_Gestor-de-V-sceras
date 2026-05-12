-- =============================================================================
-- Verificación manual vs Gestor (getDashboardData / SIRT día)
-- Reemplace las fechas y el turno, ejecute en el mismo servidor PostgreSQL
-- que usa la app (mismos esquemas: trazabilidad_proceso, sai).
--
-- Parámetros (edite aquí):
--   :d_desde, :d_hasta  →  use el MISMO día en ambos para "un día" (ej. 2026-05-12)
--   :turno              →  mismo texto que en el tablero, ej. 'LxM', 'MxM', 'JxV'
--   SIRT_SYNC_DAYS en .env (default 120); despachos usa min(120,60) solo si NO hay rango de fechas.
-- =============================================================================
-- Busque y reemplace en TODO el archivo: 2026-05-12  y  LxM  (fecha del gestor y turno del tablero).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Estado "cava" (equiv. fetchEstadoCavasRows) — conteo de FILAS devueltas
--    El JSON del gestor incluye filasEstadoCavas = length de este resultado.
-- -----------------------------------------------------------------------------
SELECT count(*) AS filas_estado_cavas_mismo_filtro_app
FROM trazabilidad_proceso.parte_producto pp
JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
WHERE pp.fecha_registro::date >= '2026-05-12'::date
  AND pp.fecha_registro::date <= '2026-05-12'::date
  AND (
    t.nombre ILIKE '%visc%'
    OR t.nombre ILIKE '%cabeza%'
    OR t.nombre ILIKE '%pata%'
    OR t.nombre ILIKE '%mano%'
  );

-- -----------------------------------------------------------------------------
-- 2) totalSalidas (juegos únicos por par base-fila) — CASI igual a contarJuegosVisceralesSync
--    La app EXCLUYE la fila índice 0 del arreglo (legado hoja fila 13).
--    En SQL: ordene igual que la app (fecha_registro DESC) y OFFSET 1.
-- -----------------------------------------------------------------------------
WITH filas AS (
  SELECT
    pp.id_producto::text AS id_producto,
    row_number() OVER (ORDER BY pp.fecha_registro DESC) AS rn
  FROM trazabilidad_proceso.parte_producto pp
  JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
  WHERE pp.fecha_registro::date >= '2026-05-12'::date
    AND pp.fecha_registro::date <= '2026-05-12'::date
    AND (
      t.nombre ILIKE '%visc%'
      OR t.nombre ILIKE '%cabeza%'
      OR t.nombre ILIKE '%pata%'
      OR t.nombre ILIKE '%mano%'
    )
),
sin_primera AS (
  SELECT id_producto FROM filas WHERE rn > 1
),
pares AS (
  SELECT
    CASE
      WHEN strpos(trim(id_producto), '-') > 0 THEN
        split_part(trim(id_producto), '-', 1) || '-' || split_part(trim(id_producto), '-', 2)
      ELSE NULL
    END AS par_dos_primeros_segmentos
  FROM sin_primera
  WHERE trim(id_producto) <> ''
)
SELECT count(DISTINCT par_dos_primeros_segmentos) AS total_salidas_como_gestor_offset1
FROM pares
WHERE par_dos_primeros_segmentos IS NOT NULL;

-- Misma lógica de par pero SIN saltar la primera fila (referencia si difiere en 1 unidad):
WITH filas AS (
  SELECT pp.id_producto::text AS id_producto
  FROM trazabilidad_proceso.parte_producto pp
  JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
  WHERE pp.fecha_registro::date >= '2026-05-12'::date
    AND pp.fecha_registro::date <= '2026-05-12'::date
    AND (
      t.nombre ILIKE '%visc%'
      OR t.nombre ILIKE '%cabeza%'
      OR t.nombre ILIKE '%pata%'
      OR t.nombre ILIKE '%mano%'
    )
),
pares AS (
  SELECT
    CASE
      WHEN strpos(trim(id_producto), '-') > 0 THEN
        split_part(trim(id_producto), '-', 1) || '-' || split_part(trim(id_producto), '-', 2)
      ELSE NULL
    END AS par_dos_primeros_segmentos
  FROM filas
  WHERE trim(id_producto) <> ''
)
SELECT count(DISTINCT par_dos_primeros_segmentos) AS total_salidas_sin_offset1
FROM pares
WHERE par_dos_primeros_segmentos IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) Reporte decomisos — filasReporteDecomisos
-- -----------------------------------------------------------------------------
SELECT count(*) AS filas_reporte_decomisos
FROM sai.decomiso d
JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = d.id_tipo_parte_producto
WHERE d.fecha_registro::date >= '2026-05-12'::date
  AND d.fecha_registro::date <= '2026-05-12'::date;

-- -----------------------------------------------------------------------------
-- 4) Despachos cavas — filasDespachosCavas (ventana de días en app: min(SIRT_SYNC_DAYS,60))
-- -----------------------------------------------------------------------------
SELECT count(*) AS filas_despachos_cavas
FROM trazabilidad_proceso.vw_producto_vendido_colbeef v
WHERE v.fecha_despacho_planta::date >= '2026-05-12'::date
  AND v.fecha_despacho_planta::date <= '2026-05-12'::date;

-- -----------------------------------------------------------------------------
-- 5) totalJuegosDespachar (suma Visceras Rojas por puesto, turno en texto puesto)
--    puesto en app = orden || ' / ' || placa || ' / ' || descr (mapTipo en cat/descr)
--    Reemplace 'LxM' por el turno que muestra el tablero.
-- -----------------------------------------------------------------------------
WITH raw AS (
  SELECT
    v.lote_interno::text AS id,
    lower(coalesce(v.categoria, '') || coalesce(v.descripcion_productos, '')) AS nlow,
    trim(
      concat_ws(
        ' / ',
        nullif(trim(v.orden_despacho), ''),
        nullif(trim(v.placa_vehiculo), ''),
        nullif(trim(v.descripcion_productos), '')
      )
    ) AS puesto
  FROM trazabilidad_proceso.vw_producto_vendido_colbeef v
  WHERE v.fecha_despacho_planta::date >= '2026-05-12'::date
    AND v.fecha_despacho_planta::date <= '2026-05-12'::date
),
tipo AS (
  SELECT
    id,
    puesto,
    CASE
      WHEN nlow LIKE '%cabeza%' THEN 'Cabeza'
      WHEN nlow LIKE '%pata%' OR nlow LIKE '%mano%' THEN 'Patas y Manos'
      WHEN nlow LIKE '%blanc%' THEN 'Visceras Blancas'
      WHEN nlow LIKE '%roj%' OR nlow LIKE '%visc%' THEN 'Visceras Rojas'
      ELSE 'Visceras Rojas'
    END AS tipo_mapeado
  FROM raw
)
SELECT count(*) AS filas_vr_turno_LxM
FROM tipo
WHERE puesto LIKE '%' || 'LxM' || '%'
  AND tipo_mapeado = 'Visceras Rojas'
  AND trim(id) <> '';

-- -----------------------------------------------------------------------------
-- 6) Crudas (VB + observación cruda) — aproxima totalCrudas del gestor
-- -----------------------------------------------------------------------------
SELECT count(DISTINCT regexp_replace(trim(pp.id_producto::text), '[^0-9\-]', '', 'g')) AS distintos_id_limpio
FROM trazabilidad_proceso.parte_producto pp
JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
WHERE pp.fecha_registro::date >= '2026-05-12'::date
  AND pp.fecha_registro::date <= '2026-05-12'::date
  AND t.nombre = 'Visceras Blancas'
  AND (
    upper(trim(coalesce(pp.observaciones, ''))) = 'CRUDAS'
    OR upper(trim(coalesce(pp.observaciones, ''))) LIKE 'CRUDAS%'
  );

-- Nota: el motor usa codigoBase() en JS; si difiere levemente del regexp, compare con el JSON totalCrudas.

-- -----------------------------------------------------------------------------
-- 7) Muestra cruzable decomisos: IDs estado vs IDs reporte (mismo día)
-- -----------------------------------------------------------------------------
WITH est AS (
  SELECT DISTINCT trim(pp.id_producto::text) AS id
  FROM trazabilidad_proceso.parte_producto pp
  JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
  WHERE pp.fecha_registro::date >= '2026-05-12'::date
    AND pp.fecha_registro::date <= '2026-05-12'::date
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
  WHERE d.fecha_registro::date >= '2026-05-12'::date
    AND d.fecha_registro::date <= '2026-05-12'::date
)
SELECT
  (SELECT count(*) FROM est) AS ids_estado_distintos,
  (SELECT count(*) FROM dec) AS ids_reporte_distintos,
  (SELECT count(*) FROM est e INNER JOIN dec d ON d.id = e.id) AS ids_en_ambos;

-- -----------------------------------------------------------------------------
-- 8) Diagnóstico turno en despachos (por qué puede dar 0 con un turno mal elegido)
--    El gestor usa el turno que gana en una muestra de filas (detectarTurnoDesdeDatos)
--    o el de la fecha según contexto. El 12/05/2026 es martes → calendario app = MxM.
--    Si aquí no aparece 'LxM' en puesto, la consulta 5 con LxM dará 0.
-- -----------------------------------------------------------------------------
WITH raw AS (
  SELECT
    trim(
      concat_ws(
        ' / ',
        nullif(trim(v.orden_despacho), ''),
        nullif(trim(v.placa_vehiculo), ''),
        nullif(trim(v.descripcion_productos), '')
      )
    ) AS puesto
  FROM trazabilidad_proceso.vw_producto_vendido_colbeef v
  WHERE v.fecha_despacho_planta::date >= '2026-05-12'::date
    AND v.fecha_despacho_planta::date <= '2026-05-12'::date
)
SELECT
  sum(CASE WHEN puesto ILIKE '%DxL%' THEN 1 ELSE 0 END) AS con_DxL,
  sum(CASE WHEN puesto ILIKE '%LxM%' THEN 1 ELSE 0 END) AS con_LxM,
  sum(CASE WHEN puesto ILIKE '%MxM%' THEN 1 ELSE 0 END) AS con_MxM,
  sum(CASE WHEN puesto ILIKE '%MxJ%' THEN 1 ELSE 0 END) AS con_MxJ,
  sum(CASE WHEN puesto ILIKE '%JxV%' THEN 1 ELSE 0 END) AS con_JxV,
  sum(CASE WHEN puesto ILIKE '%VxS%' THEN 1 ELSE 0 END) AS con_VxS,
  sum(CASE WHEN puesto ILIKE '%SxD%' THEN 1 ELSE 0 END) AS con_SxD,
  count(*) AS filas_tot
FROM raw;

-- -----------------------------------------------------------------------------
-- 9) Cruce decomisos con IDs normalizados (solo si ids_en_ambos = 0 y quiere depurar)
--    Si ids_en_ambos_lower > 0 pero ids_en_ambos = 0, solo difieren mayúsculas/minúsculas
--    (el motor hoy compara sin lower — habría que alinear).
-- -----------------------------------------------------------------------------
WITH est AS (
  SELECT DISTINCT lower(trim(pp.id_producto::text)) AS id
  FROM trazabilidad_proceso.parte_producto pp
  JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
  WHERE pp.fecha_registro::date >= '2026-05-12'::date
    AND pp.fecha_registro::date <= '2026-05-12'::date
    AND (
      t.nombre ILIKE '%visc%'
      OR t.nombre ILIKE '%cabeza%'
      OR t.nombre ILIKE '%pata%'
      OR t.nombre ILIKE '%mano%'
    )
),
dec AS (
  SELECT DISTINCT lower(trim(coalesce(nullif(trim(d.codigo_maquina), ''), d.id::text))) AS id
  FROM sai.decomiso d
  WHERE d.fecha_registro::date >= '2026-05-12'::date
    AND d.fecha_registro::date <= '2026-05-12'::date
)
SELECT count(*) AS ids_en_ambos_lower
FROM est e
INNER JOIN dec d ON d.id = e.id;

-- -----------------------------------------------------------------------------
-- 10) Primeros IDs de cada lado (compare formato si ids_en_ambos = 0)
-- -----------------------------------------------------------------------------
SELECT trim(pp.id_producto::text) AS id_estado
FROM trazabilidad_proceso.parte_producto pp
JOIN trazabilidad_proceso.tipo_parte_producto t ON t.id = pp.id_tipo_parte_producto
WHERE pp.fecha_registro::date = '2026-05-12'::date
  AND (
    t.nombre ILIKE '%visc%'
    OR t.nombre ILIKE '%cabeza%'
    OR t.nombre ILIKE '%pata%'
    OR t.nombre ILIKE '%mano%'
  )
ORDER BY pp.fecha_registro DESC
LIMIT 12;

SELECT coalesce(nullif(trim(d.codigo_maquina), ''), d.id::text) AS id_reporte
FROM sai.decomiso d
WHERE d.fecha_registro::date = '2026-05-12'::date
ORDER BY d.fecha_registro DESC
LIMIT 12;
