/**
 * Diagnóstico solo lectura vía API del gestor (sin credenciales SIRT locales).
 * Reconstruye la historia de cavas de cada pieza a partir de las salidas físicas del día.
 * Uso: node scripts/probe-salidas-dia-api.mjs 2026-09-26 21:08 [http://192.168.20.205:3001]
 */
const fecha = process.argv[2] || '2026-09-26';
const horaSnap = process.argv[3] || '21:08';
const host = process.argv[4] || 'http://192.168.20.205:3001';
const CORTE_MINS = 15 * 60 + 20;
const TIPOS = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];

const base = (id) => {
  const s = String(id ?? '').trim().replace(/[^0-9-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
};
const esPaquete = (c) => /^cava paquete visceral|^despacho contenedor paquete visceral/i.test(c || '');
const parseIso = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);
const parseDmy = (s) => {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`) : null;
};
const mins = (d) => d.getHours() * 60 + d.getMinutes();
const hhmm = (d) => (d ? d.toTimeString().slice(0, 5) : '—');
const corta = (c) => String(c).replace(/^Recepci.n\s*/i, 'Rec. ').replace(/Visceras|Vísceras/gi, 'V.');

async function main() {
  const res = await fetch(`${host}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'consultarSalidasFisicasDesdeSIRT', args: [{ from: fecha, to: fecha }] }),
  });
  const json = await res.json();
  const out = json.result || json;
  const filas = out.filas || [];

  const piezas = new Map();
  filas.forEach((f) => {
    if (!TIPOS.includes(f.tipoProducto)) return;
    const k = `${f.codigo}|${f.tipoProducto}`;
    if (!piezas.has(k)) piezas.set(k, { codigo: f.codigo, tipo: f.tipoProducto, prop: f.propietario, puesto: f.puesto, movs: [] });
    piezas.get(k).movs.push({ cava: f.cava, ing: parseDmy(f.fechaIngreso), sal: parseIso(f.fechaSalida) });
  });
  piezas.forEach((p) => p.movs.sort((a, b) => (a.sal?.getTime() || 0) - (b.sal?.getTime() || 0)));

  const snap = new Date(`${fecha}T${horaSnap}:59`);
  const enCavaEn = (p, t) => p.movs.some((m) => m.ing && m.ing <= t && m.sal > t);
  const salPaq = (p, t) =>
    p.movs.filter((m) => esPaquete(m.cava) && m.sal <= t).map((m) => m.sal).sort((a, b) => b - a)[0] || null;

  const animales = new Map();
  piezas.forEach((p) => {
    const b = base(p.codigo);
    if (!animales.has(b)) animales.set(b, { prop: p.prop, tipos: new Map() });
    animales.get(b).tipos.set(p.tipo, p);
  });
  const completo = (a) => TIPOS.every((t) => a.tipos.has(t));

  const simular = (t, v30) => {
    let pend = 0, antes = 0, adi = 0, inc = 0, doble = 0;
    animales.forEach((a) => {
      const ps = [...a.tipos.values()];
      const pendiente = completo(a) && ps.every((p) => enCavaEn(p, t));
      const salidos = ps.filter((p) => (!v30 || !enCavaEn(p, t)) && salPaq(p, t));
      if (pendiente) pend++;
      if (new Set(salidos.map((p) => p.tipo)).size === 4) {
        const max = salidos.map((p) => salPaq(p, t)).sort((x, y) => y - x)[0];
        if (mins(max) >= CORTE_MINS) adi++;
        else antes++;
        if (pendiente) doble++;
      } else if (salidos.length > 0) inc++;
    });
    return { pendientes: pend, antes, adicionales: adi, incompletos: inc, metaSuma: pend + antes + adi + inc, dobleContados: doble };
  };

  console.log(`\n${fecha}: ${filas.length} movimientos de salida, ${piezas.size} piezas, ${animales.size} animales (${[...animales.values()].filter(completo).length} con los 4)`);
  console.log(`\nA las ${horaSnap} con la lógica v29 (en 205):`, simular(snap, false));
  console.log(`A las ${horaSnap} con la corrección v30:     `, simular(snap, true));
  const fin = new Date('2100-01-01');
  console.log('Día cerrado v29:', simular(fin, false));
  console.log('Día cerrado v30:', simular(fin, true));

  const rutas = new Map();
  piezas.forEach((p) => {
    const r = p.movs.map((m) => corta(m.cava)).join(' → ');
    rutas.set(r, (rutas.get(r) || 0) + 1);
  });
  console.log('\nRutas de cavas por pieza (orden de salida):');
  [...rutas.entries()].sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(String(n).padStart(6), r));

  const porHora = new Map();
  piezas.forEach((p) => {
    const last = p.movs[p.movs.length - 1];
    const d = last.sal;
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const k = `${dia} ${String(d.getHours()).padStart(2, '0')}h · ${corta(last.cava)}`;
    porHora.set(k, (porHora.get(k) || 0) + 1);
  });
  console.log('\nÚltima salida de cada pieza (salida real de planta):');
  [...porHora.entries()].sort().forEach(([k, n]) => console.log(String(n).padStart(6), k));

  console.log('\nEjemplos de juegos contados doble a las ' + horaSnap + ':');
  let n = 0;
  animales.forEach((a, b) => {
    if (n >= 3 || !completo(a)) return;
    const ps = [...a.tipos.values()];
    if (ps.every((p) => enCavaEn(p, snap)) && ps.every((p) => salPaq(p, snap))) {
      n++;
      console.log(`  ${b} (${a.prop})`);
      ps.forEach((p) =>
        console.log(`    ${p.tipo.padEnd(16)} ${p.movs.map((m) => `${corta(m.cava)} [${hhmm(m.ing)}–${hhmm(m.sal)}]`).join(' → ')}`)
      );
    }
  });
}

main().catch((e) => {
  console.error('PROBE_ERROR', e.message);
  process.exit(1);
});
