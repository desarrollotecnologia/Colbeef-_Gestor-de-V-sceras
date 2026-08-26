/**
 * Cuenta juegos programados MxM para una fecha.
 * node scripts/count-programados-fecha.mjs 2026-08-25 [ruta.env]
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { codigoBase } from '../server/gestor/engineUtils.js';

const fechaOp = String(process.argv[2] || '2026-08-25').trim();
const envPath = String(process.argv[3] || '').trim();
if (envPath) dotenv.config({ path: envPath });
else dotenv.config({ path: new URL('../.env', import.meta.url) });

const rezago = Math.max(1, Math.min(60, Number(process.env.SIRT_PROGRAMACION_REZAGO_DAYS ?? 21)));
const corte = Math.max(0, Math.min(23, Number(process.env.GESTOR_DIA_OPERATIVO_CORTE_HORA ?? 4)));
const TIPOS = `('Visceras Rojas', 'Visceras Blancas', 'Cabeza', 'Patas y Manos')`;
const cavaDesp = String(process.env.GESTOR_CAVA_DESPACHO || 'Cava Paquete Visceral 2').trim().toUpperCase();

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

function countCompletos(rows) {
  const m = new Map();
  for (const r of rows) {
    const b = codigoBase(r.codigo);
    if (!b) continue;
    if (!m.has(b)) m.set(b, { tipos: new Set(), sigue: false });
    const g = m.get(b);
    g.tipos.add(String(r.tipo).trim());
    if (r.sigue) g.sigue = true;
  }
  const completos = [...m.values()].filter((g) => g.tipos.size >= 4);
  return {
    total: completos.length,
    pendientes: completos.filter((g) => g.sigue).length,
    salidos: completos.filter((g) => !g.sigue).length,
  };
}

async function main() {
  await client.connect();
  const meta = await client.query(
    `SELECT $1::date AS fecha, EXTRACT(ISODOW FROM $1::date)::int AS isodow,
            CASE EXTRACT(ISODOW FROM $1::date)::int
              WHEN 1 THEN 'LxM' WHEN 2 THEN 'MxM' WHEN 3 THEN 'MxJ'
              WHEN 4 THEN 'JxV' WHEN 5 THEN 'VxS' WHEN 6 THEN 'SxD' ELSE 'DxL' END AS turno`,
    [fechaOp]
  );
  console.log(JSON.stringify(meta.rows[0]));

  const sqlTurno = `
    SELECT COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
           TRIM(tpp.nombre) AS tipo,
           BOOL_OR(ppcr.fecha_salida IS NULL) AS sigue
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto AND TRIM(tpp.nombre) IN ${TIPOS}
    JOIN trazabilidad_proceso.producto p ON p.id::text = pp.id_producto::text
    JOIN trazabilidad_proceso.producto_empresa pe ON pe.id_producto::text = p.id::text AND pe.activo = true
    JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
    JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    WHERE ppel.fecha_programacion_despacho IS NOT NULL
      AND EXTRACT(ISODOW FROM ppel.fecha_programacion_despacho) = EXTRACT(ISODOW FROM $2::date)
      AND ppel.fecha_programacion_despacho::date >= ($2::date - ($1::int * INTERVAL '1 day'))
      AND ppel.fecha_programacion_despacho::date <= $2::date
    GROUP BY 1, 2`;
  console.log('programados_turno_rezago_hasta_fecha', countCompletos((await client.query(sqlTurno, [rezago, fechaOp])).rows));

  const sqlGestor = `
    SELECT COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
           TRIM(tpp.nombre) AS tipo,
           TRUE AS sigue
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto AND TRIM(tpp.nombre) IN ${TIPOS}
    JOIN trazabilidad_proceso.producto p ON p.id::text = pp.id_producto::text
    JOIN trazabilidad_proceso.producto_empresa pe ON pe.id_producto::text = p.id::text AND pe.activo = true
    JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
    JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    WHERE ppcr.fecha_salida IS NULL
      AND ppel.fecha_programacion_despacho IS NOT NULL
      AND EXTRACT(ISODOW FROM ppel.fecha_programacion_despacho) = EXTRACT(ISODOW FROM $2::date)
      AND ppel.fecha_programacion_despacho::date >= ($2::date - ($1::int * INTERVAL '1 day'))
    GROUP BY 1, 2`;
  console.log('pendientes_ahora_consulta_gestor', countCompletos((await client.query(sqlGestor, [rezago, fechaOp])).rows));

  const sqlExacta = `
    SELECT COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
           TRIM(tpp.nombre) AS tipo,
           BOOL_OR(ppcr.fecha_salida IS NULL) AS sigue
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto AND TRIM(tpp.nombre) IN ${TIPOS}
    JOIN trazabilidad_proceso.producto p ON p.id::text = pp.id_producto::text
    JOIN trazabilidad_proceso.producto_empresa pe ON pe.id_producto::text = p.id::text AND pe.activo = true
    JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
    JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    WHERE ppel.fecha_programacion_despacho::date = $1::date
    GROUP BY 1, 2`;
  console.log('programados_fecha_exacta_25', countCompletos((await client.query(sqlExacta, [fechaOp])).rows));

  const sqlGestorAll = `
    SELECT COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
           TRIM(tpp.nombre) AS tipo,
           BOOL_OR(ppcr.fecha_salida IS NULL) AS sigue
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto AND TRIM(tpp.nombre) IN ${TIPOS}
    JOIN trazabilidad_proceso.producto p ON p.id::text = pp.id_producto::text
    JOIN trazabilidad_proceso.producto_empresa pe ON pe.id_producto::text = p.id::text AND pe.activo = true
    JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
    JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    WHERE ppel.fecha_programacion_despacho IS NOT NULL
      AND EXTRACT(ISODOW FROM ppel.fecha_programacion_despacho) = EXTRACT(ISODOW FROM $2::date)
      AND ppel.fecha_programacion_despacho::date >= ($2::date - ($1::int * INTERVAL '1 day'))
    GROUP BY 1, 2`;
  console.log(
    'programados_igual_gestor_sin_filtro_salida',
    countCompletos((await client.query(sqlGestorAll, [rezago, fechaOp])).rows)
  );

  const sqlSal = `
    SELECT COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text, pp.id_producto::text) AS codigo,
           TRIM(tpp.nombre) AS tipo,
           UPPER(TRIM(COALESCE(c.nombre,''))) AS cava
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto AND TRIM(tpp.nombre) IN ${TIPOS}
    JOIN trazabilidad_proceso.producto p ON p.id::text = pp.id_producto::text
    JOIN trazabilidad_proceso.producto_empresa pe ON pe.id_producto::text = p.id::text AND pe.activo = true
    JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
    LEFT JOIN trazabilidad_proceso.cava c ON c.id = ppcr.id_cava
    LEFT JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    LEFT JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    WHERE ppcr.fecha_salida IS NOT NULL
      AND ppcr.fecha_salida >= $2::timestamp
      AND ppcr.fecha_salida < ($2::date + INTERVAL '1 day' + make_interval(hours => $3))
      AND (
        ppel.fecha_programacion_despacho IS NULL OR (
          EXTRACT(ISODOW FROM ppel.fecha_programacion_despacho) = EXTRACT(ISODOW FROM $2::date)
          AND ppel.fecha_programacion_despacho::date >= ($2::date - ($1::int * INTERVAL '1 day'))
        )
      )
    GROUP BY 1, 2, 3`;
  const sal = await client.query(sqlSal, [rezago, fechaOp, corte]);
  const mAll = new Map();
  const mPist = new Map();
  for (const r of sal.rows) {
    const b = codigoBase(r.codigo);
    if (!b) continue;
    if (!mAll.has(b)) mAll.set(b, new Set());
    mAll.get(b).add(r.tipo);
    if (String(r.cava || '') === cavaDesp) {
      if (!mPist.has(b)) mPist.set(b, new Set());
      mPist.get(b).add(r.tipo);
    }
  }
  console.log('salidas_fisicas_dia_juegos_completos', [...mAll.values()].filter((t) => t.size >= 4).length);
  console.log('pistoleo_cava_despacho_juegos_completos', [...mPist.values()].filter((t) => t.size >= 4).length, 'cava=', cavaDesp);

  await client.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
