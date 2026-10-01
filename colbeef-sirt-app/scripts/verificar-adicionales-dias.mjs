/**
 * Solo lectura. Compara por día:
 *  - motor del gestor (programados + salidas reales de SIRT)
 *  - conteo independiente sobre la programación (ppel.fecha_registro + hora_registro)
 *  - regla anterior (adicional = salida física ≥ 15:30)
 * node scripts/verificar-adicionales-dias.mjs 2026-09-13 2026-09-28
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { query } = await import('../server/db.js');
const { fetchDespachosCavasRows, fetchDespachosCavaRielRows, fetchEstadoCavasRows } = await import(
  '../server/gestor/sirtSync.js'
);
const { construirProgresoOplDesdeDespachos } = await import('../server/gestor/engine.js');
const { TURNO_POR_DIA, TIPOS_PRODUCTO } = await import('../server/gestor/constants.js');

const desde = process.argv[2] || '2026-09-13';
const hasta = process.argv[3] || '2026-09-28';

const base = (id) => {
  const s = String(id ?? '').trim().replace(/[^0-9-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
};

function dias(a, b) {
  const out = [];
  for (let d = new Date(`${a}T12:00:00`); d <= new Date(`${b}T12:00:00`); d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

async function conteoIndependiente(fecha) {
  const { rows } = await query(
    `
    SELECT COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text) AS codigo,
           TRIM(tpp.nombre) AS tipo,
           (ppel.fecha_registro + ppel.hora_registro) >= ($1::date + TIME '15:30') AS adicional
    FROM trazabilidad_proceso.parte_producto_empresa_local ppel
    JOIN trazabilidad_proceso.parte_producto_empresa ppe ON ppe.id = ppel.id_parte_producto_empresa
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppe.id_parte_producto AND pp.id_producto::text = ppe.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto
     AND TRIM(tpp.nombre) IN ('Visceras Rojas','Visceras Blancas','Cabeza','Patas y Manos')
    WHERE ppel.fecha_programacion_despacho::date = $1::date
    `,
    [fecha]
  );
  const animales = new Map();
  rows.forEach((r) => {
    const b = base(r.codigo);
    if (!animales.has(b)) animales.set(b, { tipos: new Set(), adi: true });
    const a = animales.get(b);
    a.tipos.add(r.tipo);
    if (!r.adicional) a.adi = false;
  });
  let antes = 0;
  let adi = 0;
  animales.forEach((a) => {
    if (!TIPOS_PRODUCTO.every((t) => a.tipos.has(t))) return;
    if (a.adi) adi++;
    else antes++;
  });
  return { antes, adi, total: antes + adi };
}

const estado = await fetchEstadoCavasRows({ stockActual: true });
const resultados = [];
for (const fecha of dias(desde, hasta)) {
  const turno = TURNO_POR_DIA[new Date(`${fecha}T12:00:00`).getDay()];
  const range = { from: fecha, to: fecha };
  const [prog, sal, ind] = await Promise.all([
    fetchDespachosCavasRows(range),
    fetchDespachosCavaRielRows(range),
    conteoIndependiente(fecha),
  ]);
  const s = {
    lastSyncRange: range,
    despachosCavas: prog,
    salidasCavaDia: sal,
    estadoFromRow12: estado,
    oplConfig: [],
    oplTotalsJuego: {},
    oplTotalsJuegoCompleto: {},
  };
  const p = construirProgresoOplDesdeDespachos(s, turno, fecha);
  const ok = p.totalAsignadosAntes === ind.antes && p.totalAdicionales === ind.adi;
  resultados.push({
    fecha,
    turno,
    'SIRT antes': ind.antes,
    'SIRT adic': ind.adi,
    'Gestor antes': p.totalAsignadosAntes,
    'Gestor adic': p.totalAdicionales,
    'Meta': p.totalJuegos,
    'Despachados': p.totalDespachados,
    'Pend.': p.totalPendientes,
    'Inc.': p.totalIncompletos,
    'Adic regla vieja': p.juegosSalidaAdicionales,
    OK: ok ? 'sí' : 'NO',
  });
}
console.table(resultados);
process.exit(0);
