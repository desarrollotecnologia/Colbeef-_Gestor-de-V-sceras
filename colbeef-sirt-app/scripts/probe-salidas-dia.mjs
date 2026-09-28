/**
 * Diagnóstico solo lectura: historia de cavas de las piezas programadas en una fecha.
 * Uso: node scripts/probe-salidas-dia.mjs 2026-09-26 "2026-09-26T21:08:00"
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const fecha = process.argv[2] || '2026-09-26';
const snapshot = new Date(process.argv[3] || `${fecha}T21:08:00`);
const CORTE_MINS = 15 * 60 + 20;
const TIPOS = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];

const client = new pg.Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 10000,
});

const base = (id) => {
  const s = String(id ?? '').trim().replace(/[^0-9-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
};
const esPaquete = (c) => /^cava paquete visceral|^despacho contenedor paquete visceral/i.test(c || '');
const mins = (d) => d.getHours() * 60 + d.getMinutes();
const hhmm = (d) => (d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—');

async function main() {
  await client.connect();
  const { rows } = await client.query(
    `
    SELECT DISTINCT ON (ppcr.id)
      ppcr.id AS ppcr_id,
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), ppcr.id_producto::text) AS codigo,
      TRIM(tpp.nombre) AS tipo,
      COALESCE(c.nombre, '') AS cava,
      ppcr.fecha_ingreso,
      ppcr.fecha_salida,
      COALESCE(NULLIF(TRIM(e3.nombre), ''), 'SIN PROPIETARIO') AS propietario
    FROM trazabilidad_proceso.parte_producto_cava_riel ppcr
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppcr.id_parte_producto AND pp.id_producto::text = ppcr.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto
     AND TRIM(tpp.nombre) IN ('Visceras Rojas','Visceras Blancas','Cabeza','Patas y Manos')
    JOIN trazabilidad_proceso.producto_empresa pe
      ON pe.id_producto::text = pp.id_producto::text AND pe.activo = true
    JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
    JOIN trazabilidad_proceso.parte_producto_empresa ppe
      ON ppe.id_producto::text = pp.id_producto::text AND ppe.id_parte_producto = pp.id
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    LEFT JOIN trazabilidad_proceso.cava c ON c.id = ppcr.id_cava
    WHERE ppel.fecha_programacion_despacho::date = $1::date
    ORDER BY ppcr.id
    `,
    [fecha]
  );
  await client.end();

  /** pieza = codigo|tipo → movimientos ordenados */
  const piezas = new Map();
  rows.forEach((r) => {
    const k = `${r.codigo}|${r.tipo}`;
    if (!piezas.has(k)) piezas.set(k, { codigo: r.codigo, tipo: r.tipo, prop: r.propietario, movs: [] });
    piezas.get(k).movs.push({
      cava: r.cava,
      ing: r.fecha_ingreso ? new Date(r.fecha_ingreso) : null,
      sal: r.fecha_salida ? new Date(r.fecha_salida) : null,
    });
  });
  piezas.forEach((p) => p.movs.sort((a, b) => (a.ing?.getTime() || 0) - (b.ing?.getTime() || 0)));

  const enCavaEn = (p, t) => p.movs.some((m) => m.ing && m.ing <= t && (!m.sal || m.sal > t));
  const salidaPaqueteHasta = (p, t) =>
    p.movs.filter((m) => esPaquete(m.cava) && m.sal && m.sal <= t).map((m) => m.sal).sort((a, b) => b - a)[0] || null;

  /** animal → { tipos: Map tipo→pieza } */
  const animales = new Map();
  piezas.forEach((p) => {
    const b = base(p.codigo);
    if (!animales.has(b)) animales.set(b, { prop: p.prop, tipos: new Map() });
    animales.get(b).tipos.set(p.tipo, p);
  });
  const completo = (a) => TIPOS.every((t) => a.tipos.has(t));

  const now = new Date('2100-01-01');
  const resumen = (t, modo) => {
    let pend = 0, antes = 0, adi = 0, inc = 0, doble = 0;
    animales.forEach((a) => {
      const ps = [...a.tipos.values()];
      const pendiente = completo(a) && ps.every((p) => enCavaEn(p, t));
      const salidas = ps
        .map((p) => {
          if (modo === 'v30' && enCavaEn(p, t)) return null;
          return salidaPaqueteHasta(p, t);
        })
        .filter(Boolean);
      const tiposSalidos = new Set(ps.filter((p, i) => {
        if (modo === 'v30' && enCavaEn(p, t)) return false;
        return salidaPaqueteHasta(p, t);
      }).map((p) => p.tipo));
      if (pendiente) pend++;
      if (tiposSalidos.size === 4) {
        const max = salidas.sort((x, y) => y - x)[0];
        if (mins(max) >= CORTE_MINS) adi++;
        else antes++;
        if (pendiente) doble++;
      } else if (tiposSalidos.size > 0) inc++;
    });
    return { pend, antes, adi, inc, meta: pend + antes + adi + inc, dobleContados: doble };
  };

  const totalAnimales = animales.size;
  const completos = [...animales.values()].filter(completo).length;
  console.log(`\nFecha programación ${fecha}: ${rows.length} movimientos, ${piezas.size} piezas, ${totalAnimales} animales (${completos} con los 4 subproductos)\n`);

  console.log(`Snapshot ${snapshot.toLocaleString('es-CO')} (lógica actual v29):`, resumen(snapshot, 'v29'));
  console.log(`Snapshot ${snapshot.toLocaleString('es-CO')} (corrección v30):  `, resumen(snapshot, 'v30'));
  console.log('Hoy (v29):', resumen(now, 'v29'));
  console.log('Hoy (v30):', resumen(now, 'v30'));

  const rutas = new Map();
  piezas.forEach((p) => {
    const r = p.movs.map((m) => m.cava.replace(/Recepción|Recepci.n/i, 'Rec.')).join(' → ');
    rutas.set(r, (rutas.get(r) || 0) + 1);
  });
  console.log('\nRutas de cavas por pieza:');
  [...rutas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([r, n]) => console.log(String(n).padStart(6), r));

  const ultimaSalida = new Map();
  piezas.forEach((p) => {
    const last = p.movs[p.movs.length - 1];
    const k = last.sal ? `${last.cava} · sale ${last.sal.toISOString().slice(0, 10)} ${String(last.sal.getHours()).padStart(2, '0')}h` : `${last.cava} · SIGUE EN CAVA`;
    ultimaSalida.set(k, (ultimaSalida.get(k) || 0) + 1);
  });
  console.log('\nÚltimo movimiento por pieza (cava · hora de salida):');
  [...ultimaSalida.entries()].sort().forEach(([k, n]) => console.log(String(n).padStart(6), k));

  const ejemplos = [];
  animales.forEach((a, b) => {
    if (ejemplos.length >= 3 || !completo(a)) return;
    const ps = [...a.tipos.values()];
    if (ps.every((p) => enCavaEn(p, snapshot)) && ps.every((p) => salidaPaqueteHasta(p, snapshot))) {
      ejemplos.push({ b, a });
    }
  });
  console.log('\nEjemplos de juegos contados doble a la hora del snapshot:');
  ejemplos.forEach(({ b, a }) => {
    console.log(`  ${b} (${a.prop})`);
    [...a.tipos.values()].forEach((p) =>
      console.log(`    ${p.tipo.padEnd(16)} ${p.movs.map((m) => `${m.cava} [${hhmm(m.ing)}–${hhmm(m.sal)}]`).join(' → ')}`)
    );
  });
}

main().catch((e) => {
  console.error('PROBE_ERROR', e.message);
  process.exit(1);
});
