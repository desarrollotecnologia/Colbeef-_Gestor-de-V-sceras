/**
 * Equivalente a trazabilidad_proceso.vw_producto_vendido_colbeef (definición real en BD),
 * con filtro de fecha sobre va.despacho_desposte **antes** del GROUP BY para que el planificador
 * pueda acotar filas sin materializar toda la vista.
 *
 * Parámetros: [days, from, from] — mismos que sirtSync.fetchDespachosCavasRows / metrics.js
 * ($1 días hacia atrás si no hay rango; $2/$3 fecha desde/hasta opcional).
 */
export const DESPACHOS_COLBEEF_GROUPED_FILTERED_SQL = `
SELECT
  va.despacho_desposte AS fecha_despacho_planta,
  e.nombre AS propietario,
  e2.nombre AS cliente,
  od.codigo AS orden_despacho,
  va.placa_vehiculo,
  nc.nombre_alternativo AS descripcion_productos,
  CASE
    WHEN c.id_categoria_corte = 1 THEN 'CORTES'::text
    ELSE 'SUBPRODUCTOS'::text
  END AS categoria,
  l.codigo AS lote_interno,
  p.lote_externo,
  te.nombre AS empaque,
  tc.nombre AS conservacion,
  sum(pd.peso) AS sum
FROM desposte.caja ca
JOIN desposte.caja_producto_desposte cpd ON ca.id = cpd.id_caja
JOIN desposte.producto_desposte pd ON cpd.id_producto_desposte = pd.id
JOIN desposte.nombre_corte nc ON pd.id_nombre_corte = nc.id
JOIN desposte.corte c ON nc.id_corte = c.id
JOIN desposte.vehiculo_asignado_orden_despacho vaod ON ca.id_vehiculo_orden = vaod.id
JOIN trazabilidad_proceso.vehiculo_asignado va ON vaod.id_vehiculo_asignado = va.id
JOIN desposte.lote l ON ca.id_lote = l.id
JOIN desposte.plan_desposte pdt ON l.id_plan_desposte = pdt.id
JOIN desposte.pedido p ON pdt.id_pedido = p.id
JOIN desposte.ficha_empresa fe ON p.id_ficha_empresa = fe.id
JOIN organizaciones.empresa e ON fe.id_empresa = e.id
JOIN desposte.tipo_conservacion tc ON pd.id_tipo_conservacion = tc.id
JOIN desposte.tipo_embalaje te ON ca.id_tipo_embalaje = te.id
JOIN desposte.ruta_sucursal rs ON ca.id_ruta_sucursal = rs.id
JOIN desposte.ruta r ON rs.id_ruta = r.id
JOIN organizaciones.sucursal s ON rs.id_sucursal = s.id
JOIN trazabilidad_proceso.destino ds ON s.id_destino = ds.id
LEFT JOIN trazabilidad_proceso.vehiculo_asignado_sucursal vas2 ON vas2.id_vehiculo_asignado = va.id AND vas2.id_sucursal = s.id
LEFT JOIN trazabilidad_proceso.vehiculo_asignado_sucursal vas3 ON vas3.id_vehiculo_asignado = va.id AND NOT (EXISTS (
  SELECT vas4.id,
    vas4.id_vehiculo_asignado,
    vas4.id_sucursal,
    vas4.numero_guia_transporte,
    vas4.numero_guia_transporte_completo,
    vas4.fecha_creacion,
    vas4.user_name,
    vas4.fecha_fin_vigencia
  FROM trazabilidad_proceso.vehiculo_asignado_sucursal vas4
  WHERE vas4.id_vehiculo_asignado = vas3.id_vehiculo_asignado AND vas4.id < vas3.id
))
JOIN desposte.orden_despacho od ON vaod.id_orden_despacho = od.id
JOIN organizaciones.empresa e2 ON e2.id = od.id_empresa
WHERE (
    ($2::date IS NOT NULL OR $3::date IS NOT NULL)
    OR (va.despacho_desposte::date >= (CURRENT_DATE - $1::int))
  )
  AND ($2::date IS NULL OR va.despacho_desposte::date >= $2::date)
  AND ($3::date IS NULL OR va.despacho_desposte::date <= $3::date)
GROUP BY
  va.despacho_desposte,
  e.nombre,
  e2.nombre,
  od.codigo,
  va.placa_vehiculo,
  nc.nombre_alternativo,
  (CASE WHEN c.id_categoria_corte = 1 THEN 'CORTES'::text ELSE 'SUBPRODUCTOS'::text END),
  l.codigo,
  p.lote_externo,
  te.nombre,
  tc.nombre
`;
