/**
 * Solo lectura: juegos asignados antes / después del corte 15:20 según la hora de
 * registro de la programación (ppel.fecha_registro + hora_registro).
 * node scripts/probe-adicionales-asignacion.mjs 2026-09-26 [15:20]
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const fecha = process.argv[2] || '2026-09-26';
const corte = process.argv[3] || '15:20';
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

async function main() {
  await client.connect();
  const { rows } = await client.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text) AS codigo,
      TRIM(tpp.nombre) AS tipo,
      ppel.activo,
      (ppel.fecha_registro + ppel.hora_registro) AS registro,
      COALESCE(NULLIF(TRIM(s.nombre), ''), '') AS sucursal,
      COALESCE(NULLIF(TRIM(e3.nombre), ''), '') AS propietario
    FROM trazabilidad_proceso.parte_producto_empresa_local ppel
    JOIN trazabilidad_proceso.parte_producto_empresa ppe ON ppe.id = ppel.id_parte_producto_empresa
    JOIN trazabilidad_proceso.parte_producto pp
      ON pp.id = ppe.id_parte_producto AND pp.id_producto::text = ppe.id_producto::text
    JOIN trazabilidad_proceso.tipo_parte_producto tpp
      ON tpp.id = pp.id_tipo_parte_producto
     AND TRIM(tpp.nombre) IN ('Visceras Rojas','Visceras Blancas','Cabeza','Patas y Manos')
    LEFT JOIN organizaciones.sucursal s ON s.id = ppel.id_local
    LEFT JOIN trazabilidad_proceso.producto_empresa pe
      ON pe.id_producto::text = pp.id_producto::text AND pe.activo = true
    LEFT JOIN organizaciones.empresa e3 ON e3.id = pe.id_empresa
    WHERE ppel.fecha_programacion_despacho::date = $1::date
    `,
    [fecha]
  );
  await client.end();

  const corteTs = new Date(`${fecha}T${corte}:00`);
  const animales = new Map();
  let inactivas = 0;
  rows.forEach((r) => {
    if (r.activo === false) {
      inactivas++;
      return;
    }
    const b = base(r.codigo);
    if (!animales.has(b)) animales.set(b, { tipos: new Set(), min: null, max: null, prop: r.propietario, suc: r.sucursal });
    const a = animales.get(b);
    a.tipos.add(r.tipo);
    const t = new Date(r.registro);
    if (!a.min || t < a.min) a.min = t;
    if (!a.max || t > a.max) a.max = t;
  });

  const completos = [...animales.values()].filter((a) => TIPOS.every((t) => a.tipos.has(t)));
  const antesMin = completos.filter((a) => a.min < corteTs).length;
  const despuesMin = completos.length - antesMin;
  const antesMax = completos.filter((a) => a.max < corteTs).length;
  const despuesMax = completos.length - antesMax;
  const mixtos = completos.filter((a) => a.min < corteTs && a.max >= corteTs);

  console.log(`\n${fecha} · corte ${corte}`);
  console.log(`Filas de programación: ${rows.length} (inactivas descartadas: ${inactivas})`);
  console.log(`Animales: ${animales.size} · juegos completos: ${completos.length}`);
  console.log(`Por primera asignación del juego: antes ${antesMin} + adicionales ${despuesMin} = ${completos.length}`);
  console.log(`Por última asignación del juego:  antes ${antesMax} + adicionales ${despuesMax} = ${completos.length}`);
  console.log(`Juegos con piezas asignadas a ambos lados del corte: ${mixtos.length}`);

  const porHora = new Map();
  completos.forEach((a) => {
    const k = `${a.min.toISOString().slice(0, 10) === fecha ? '' : a.min.toLocaleDateString('es-CO') + ' '}${String(a.min.getHours()).padStart(2, '0')}h`;
    porHora.set(k, (porHora.get(k) || 0) + 1);
  });
  console.log('\nJuegos por hora de asignación:');
  [...porHora.entries()].sort().forEach(([k, n]) => console.log(`  ${k.padEnd(14)} ${n}`));

  const adi = completos.filter((a) => a.min >= corteTs);
  const porProp = new Map();
  adi.forEach((a) => porProp.set(a.prop, (porProp.get(a.prop) || 0) + 1));
  console.log('\nAdicionales por propietario:');
  [...porProp.entries()].sort((x, y) => y[1] - x[1]).forEach(([p, n]) => console.log(`  ${String(n).padStart(4)}  ${p}`));
}

main().catch((e) => {
  console.error('PROBE_ERROR', e.message);
  process.exit(1);
});
