/**
 * Compara conteos posibles para un día MxJ.
 * node scripts/probe-conteo-mxj.mjs [YYYY-MM-DD]
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/CAMPUSLANDS/Colbeef-_Gestor-de-V-sceras-1/colbeef-sirt-app/.env' });

const fecha = String(process.argv[2] || '2026-08-26').trim();
const { query } = await import('../server/db.js');
const { codigoBase } = await import('../server/gestor/engineUtils.js');

const TIPOS = `('Visceras Rojas', 'Visceras Blancas', 'Cabeza', 'Patas y Manos')`;

function contar(rows) {
  const m = new Map();
  for (const r of rows) {
    const b = codigoBase(r.codigo);
    if (!b) continue;
    if (!m.has(b)) m.set(b, new Set());
    m.get(b).add(String(r.tipo).trim());
  }
  let any = 0;
  let comple = 0;
  for (const s of m.values()) {
    any++;
    if (s.size >= 4) comple++;
  }
  return { animales: any, completos: comple, incompletos: any - comple };
}

const sqlBase = `
  SELECT
    COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text, ppcr.id_producto::text) AS codigo,
    TRIM(tpp.nombre) AS tipo,
    COALESCE(c.nombre, '') AS cava,
    (ppcr.fecha_salida IS NULL) AS en_cava
  FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
  JOIN trazabilidad_proceso.parte_producto pp
    ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
  JOIN trazabilidad_proceso.tipo_parte_producto tpp
    ON tpp.id = pp.id_tipo_parte_producto AND TRIM(tpp.nombre) IN ${TIPOS}
  JOIN trazabilidad_proceso.parte_producto_empresa ppe
    ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
  JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
    ON ppel.id_parte_producto_empresa = ppe.id
  LEFT JOIN trazabilidad_proceso.cava c ON c.id = ppcr.id_cava
  WHERE ppel.fecha_programacion_despacho IS NOT NULL
    AND ppel.fecha_programacion_despacho::date = $1::date
`;

const { rows: todos } = await query(sqlBase, [fecha]);
const pendientes = todos.filter((r) => r.en_cava);
const salidos = todos.filter((r) => !r.en_cava);
const paquete = todos.filter((r) =>
  String(r.cava || '')
    .toUpperCase()
    .startsWith('CAVA PAQUETE VISCERAL')
);
const paquetePend = paquete.filter((r) => r.en_cava);
const paqueteSal = paquete.filter((r) => !r.en_cava);

console.log('fecha', fecha, 'turno MxJ');
console.log('--- TODAS LAS CAVAS (programación fecha) ---');
console.log('todos (pend+sal)', contar(todos));
console.log('solo pendientes (fecha_salida NULL)', contar(pendientes));
console.log('solo salidos', contar(salidos));
console.log('--- SOLO CAVA PAQUETE VISCERAL ---');
console.log('paquete todos', contar(paquete));
console.log('paquete pendientes', contar(paquetePend));
console.log('paquete salidos', contar(paqueteSal));

// ISODOW + rezago 21 (modo viejo)
const { rows: isodow } = await query(
  `
  SELECT
    COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text) AS codigo,
    TRIM(tpp.nombre) AS tipo
  FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
  JOIN trazabilidad_proceso.parte_producto pp
    ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
  JOIN trazabilidad_proceso.tipo_parte_producto tpp
    ON tpp.id = pp.id_tipo_parte_producto AND TRIM(tpp.nombre) IN ${TIPOS}
  JOIN trazabilidad_proceso.parte_producto_empresa ppe
    ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
  JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
    ON ppel.id_parte_producto_empresa = ppe.id
  WHERE ppcr.fecha_salida IS NULL
    AND ppel.fecha_programacion_despacho IS NOT NULL
    AND EXTRACT(ISODOW FROM ppel.fecha_programacion_despacho) = EXTRACT(ISODOW FROM $1::date)
    AND ppel.fecha_programacion_despacho::date >= ($1::date - ($2::int * INTERVAL '1 day'))
    AND ppel.fecha_programacion_despacho::date <= $1::date
  `,
  [fecha, 21]
);
console.log('--- ISODOW+rezago 21 solo pendientes ---');
console.log(contar(isodow));

process.exit(0);
