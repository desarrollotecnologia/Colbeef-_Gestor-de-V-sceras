/**
 * Verifica métricas del gestor vs capturas (01/06/2026, turno LxM).
 * node scripts/verify-live-2026-06-01.mjs
 */
import {
  getDashboardData,
  consultarDespachosPreview,
  contarCrudasSync,
  contarJuegosVisceralesSync,
  procesarDespachos,
} from '../server/gestor/engine.js';
import { fetchDespachosCavasRows, fetchEstadoCavasRows, fetchReporteDecomisosRows } from '../server/gestor/sirtSync.js';
import { query } from '../server/db.js';
import { aplicarEstadoEnCavaNeto } from '../server/gestor/engineUtils.js';

const FECHA = '2026-06-01';
const RANGE = { date: FECHA, from: FECHA, to: FECHA };

const ESPERADO = {
  totalJuegosTurno: 432,
  puestosTurno: 140,
  totalCrudas: 29,
  opl: {
    TRANSCARNES: 160,
    'MLT. GUARIN': 113,
    'DRA CAVA': 38,
    'CAVA CAMILO': 28,
    'CAVA AJR': 27,
    'CAVA MIREYA': 23,
    'CAVA T.A': 17,
    'CAVA WO': 13,
    'CAVA YERSON': 13,
  },
};

function tag(ok) {
  return ok ? '✓' : '✗';
}

function cmp(label, got, exp) {
  if (exp == null) {
    console.log(`  · ${label}: ${got}`);
    return true;
  }
  const ok = got === exp;
  console.log(`  ${tag(ok)} ${label}: ${got} (captura ${exp})`);
  return ok;
}

async function sqlChecks() {
  const piezasProg = await query(
    `
    SELECT COUNT(*)::int AS n
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
      AND tpp.nombre IN ('Cabeza','Patas y Manos','Visceras Blancas','Visceras Rojas')
    JOIN trazabilidad_proceso.parte_producto_empresa ppe ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel ON ppel.id_parte_producto_empresa = ppe.id
    WHERE ppcr.fecha_salida IS NULL
      AND ppel.fecha_programacion_despacho::date = $1::date
    `,
    [FECHA]
  );
  const piezasLxM = await query(
    `
    SELECT COUNT(*)::int AS n
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp ON tpp.id = pp.id_tipo_parte_producto
      AND tpp.nombre IN ('Cabeza','Patas y Manos','Visceras Blancas','Visceras Rojas')
    JOIN trazabilidad_proceso.parte_producto_empresa ppe ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel ON ppel.id_parte_producto_empresa = ppe.id
    JOIN organizaciones.sucursal s ON s.id = ppel.id_local
    LEFT JOIN trazabilidad_proceso.destino de ON de.id = s.id_destino
    WHERE ppcr.fecha_salida IS NULL
      AND ppel.fecha_programacion_despacho::date = $1::date
      AND (
        LPAD(COALESCE(s.id::text, '0'), 5, '0') || '/' ||
        UPPER(COALESCE(de.nombre, 'SIN CIUDAD')) || '/' ||
        UPPER(COALESCE(NULLIF(TRIM(s.direccion), ''), 'SIN DIRECCION')) || '/' ||
        CASE EXTRACT(DOW FROM ppel.fecha_programacion_despacho)::int
          WHEN 1 THEN 'LxM' ELSE 'Otros' END || '/'
      ) LIKE '%/LxM/%'
    `,
    [FECHA]
  );
  return {
    piezasProgramadasDia: piezasProg.rows[0]?.n ?? 0,
    piezasRutaLxM: piezasLxM.rows[0]?.n ?? 0,
  };
}

async function main() {
  console.log('=== Verificación Colbeef ·', FECHA, '· turno LxM ===\n');
  let fails = 0;

  try {
    const sql = await sqlChecks();
    console.log('SQL directo SIRT:');
    cmp('piezas programadas (en cava, fecha prog)', sql.piezasProgramadasDia, null);
    console.log(`     (referencia: 432 juegos × 4 tipos ≈ ${432 * 4} piezas si juego completo)`);
    console.log(`     piezas con ruta /LxM/ en SQL: ${sql.piezasRutaLxM}`);
    console.log('');
  } catch (e) {
    console.warn('SQL directo:', e.message, '\n');
  }

  const dash = await getDashboardData(RANGE);
  if (!dash.success) {
    console.error('getDashboardData:', dash.message || dash);
    process.exit(1);
  }

  const preview = await consultarDespachosPreview('LxM', RANGE);
  const estadoBruto = await fetchEstadoCavasRows({ stockActual: true });
  const despRows = await fetchDespachosCavasRows(RANGE);
  const reporte = await fetchReporteDecomisosRows(RANGE);
  const estado = aplicarEstadoEnCavaNeto(estadoBruto, despRows);
  const sWork = { estadoFromRow12: estado, despachosCavas: despRows, reporteDecomisos: reporte.rows };
  const juegosStock = contarJuegosVisceralesSync(sWork).total;
  const crudas = contarCrudasSync(sWork).total;

  console.log('Tablero (getDashboardData):');
  if (!cmp('totalJuegosDespachar', dash.totalJuegosDespachar, ESPERADO.totalJuegosTurno)) fails++;
  console.log(
    `     juegosEnCava (stock, no es lo de la captura si dice 432): ${dash.juegosEnCava}`
  );
  if (!cmp('totalCrudas', dash.totalCrudas, ESPERADO.totalCrudas)) fails++;
  console.log(`     decomisos vinculados (programado hoy): ${dash.totalDecomisosVinculadosCava}`);
  console.log(`     decomisos período SAI (7 días): ${dash.totalDecomisosEnRango}`);
  console.log(`     piezas programadas: ${dash.filasDespachosCavas}`);
  console.log(`     consultaSIRT: ${dash.consultaSIRT} · build: ${dash.gestorBuild}`);
  console.log('');

  console.log('Módulo Despachos (consultarDespachosPreview LxM):');
  if (!cmp('totalJuegos', preview.totalJuegos, ESPERADO.totalJuegosTurno)) fails++;
  if (!cmp('puestos', preview.totalPuestos, ESPERADO.puestosTurno)) fails++;
  console.log(`     piezas en consulta: ${preview.filasDespachosCavas}`);
  console.log('');

  // Simular "Procesar" en memoria (misma lógica que UI tras sincronizar)
  const { loadState, saveState, defaultState } = await import('../server/gestor/store.js');
  const persisted = await loadState();
  const sim = {
    ...defaultState(),
    estadoFromRow12: estado,
    despachosCavas: despRows,
    reporteDecomisos: reporte.rows,
    oplConfig: persisted.oplConfig?.length ? JSON.parse(JSON.stringify(persisted.oplConfig)) : defaultState().oplConfig,
    lastSyncRange: RANGE,
  };
  const prevStore = await loadState();
  await saveState(sim);
  const proc = await procesarDespachos('LxM');
  await saveState(prevStore);

  console.log('Tras procesarDespachos (sesión simulada):');
  if (proc.success) {
    if (!cmp('totalJuegos', proc.totalJuegos, ESPERADO.totalJuegosTurno)) fails++;
    console.log(`     puestos: ${proc.totalPuestos}`);
    console.log(`     con decomiso (animales): ${proc.totalConDecomiso}`);
  } else {
    console.log('  ✗ procesarDespachos:', proc.message);
    fails++;
  }
  console.log('');

  console.log('OPL (desde programación del turno; requiere mapa OPL de planta en store):');
  const oplDash = {};
  (dash.todosOPL || dash.progresoOPL || []).forEach((p) => {
    oplDash[p.opl] = p.total;
  });
  for (const [opl, exp] of Object.entries(ESPERADO.opl)) {
    const got = oplDash[opl];
    if (got === undefined) {
      console.log(`  ? ${opl}: no en respuesta (revise oplConfig en servidor)`);
      continue;
    }
    if (!cmp(`OPL ${opl}`, got, exp)) fails++;
  }
  console.log('');

  console.log('Auxiliar stock vs programación:');
  console.log(`  juegos completos en cava (stock): ${juegosStock}`);
  console.log(`  crudas VB únicas en cava: ${crudas}`);
  console.log('');

  if (fails === 0) {
    console.log('RESULTADO: coincidencia con capturas en juegos/puestos/crudas.');
  } else {
    console.log(`RESULTADO: ${fails} diferencia(s) — revisar turno, fecha operación o despliegue.`);
  }
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
