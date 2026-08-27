/**
 * Cruza OPL en vivo (servidor 205) vs programación en cava por propietario/OPL.
 * node scripts/probe-opl-live-api.mjs [baseUrl]
 */
const base = process.argv[2] || 'http://192.168.20.205:3001';

const OPL_EX = [
  ['AVILA MONSALVE REINALDO', 'DRA CAVA'],
  ['CALIXTO ARDILA JAIME', 'DRA CAVA'],
];
const mapa = {};
OPL_EX.forEach(([p, o]) => {
  mapa[p.toUpperCase()] = o;
});
const OPL_DEFAULT = 'TRANSCARNES';

function oplDeProp(prop) {
  return mapa[String(prop || '').trim().toUpperCase()] || OPL_DEFAULT;
}

function codigoBase(id) {
  const s = String(id ?? '')
    .trim()
    .replace(/[^0-9\-]/g, '');
  const g = s.lastIndexOf('-');
  return g > 0 ? s.substring(0, g) : s;
}

const TIPOS = ['Visceras Rojas', 'Visceras Blancas', 'Cabeza', 'Patas y Manos'];

function contarJuegos(filas, getOpl) {
  const g = {};
  for (const f of filas) {
    const tipo = String(f.subproducto || f.descripcion || '').trim();
    if (!TIPOS.includes(tipo)) continue;
    const cava = String(f.cavaNombre || f.cava || '').toUpperCase();
    if (!cava.includes('PAQUETE VISCERAL')) continue;
    const b = codigoBase(f.codigo);
    if (!b) continue;
    const opl = getOpl(f);
    if (!g[opl]) g[opl] = {};
    if (!g[opl][b]) g[opl][b] = new Set();
    g[opl][b].add(tipo);
  }
  const out = {};
  for (const [opl, animales] of Object.entries(g)) {
    let comp = 0;
    for (const s of Object.values(animales)) {
      if (TIPOS.every((t) => s.has(t))) comp++;
    }
    out[opl] = comp;
  }
  return out;
}

const [dash, sal] = await Promise.all([
  fetch(`${base}/api/dashboard`).then((r) => r.json()),
  fetch(`${base}/api/salidas?from=2026-08-27&to=2026-08-27`).then((r) => r.json()),
]);

const prog = (sal.filas || []).filter((f) => !f.fechaSalida);
const salidas = (sal.filas || []).filter((f) => f.fechaSalida);

// /api/salidas returns programados when fuente=programado? Let me check - actually it uses consultarSalidasCavaDesdeSIRT which uses fetchDespachosCavasRows = programados only

const enCava = contarJuegos(sal.filas || [], (f) => oplDeProp(f.propietario));

// Need real salidas from dashboard filasSalidasFisicas - use separate approach
// Dashboard says filasSalidasFisicas: 2802 - sal endpoint might only be programados

console.log('=== Dashboard OPL ===');
for (const p of dash.todosOPL || []) {
  console.log(`  ${p.opl}: desp=${p.despachados} total=${p.total} pend=${p.pendientes}`);
}

console.log('\n=== Programados en cava (api/salidas = programados fuente programado) ===');
console.log(enCava);

console.log('\n=== operacionPuestos por OPL ===');
const byOpl = {};
for (const p of dash.operacionPuestos || []) {
  byOpl[p.opl] = (byOpl[p.opl] || 0) + p.juegos;
}
console.log(byOpl);

console.log('\n=== KPIs ===');
console.log({
  meta: dash.meta,
  despachados: dash.despachados,
  faltan: dash.faltan,
  filasDespachosCavas: dash.filasDespachosCavas,
  filasSalidasFisicas: dash.filasSalidasFisicas,
  turno: dash.turnoOperacion,
  fecha: dash.fechaConsulta,
});
