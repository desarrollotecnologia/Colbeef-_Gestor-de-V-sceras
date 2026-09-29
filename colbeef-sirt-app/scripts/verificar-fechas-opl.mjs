/**
 * Consulta el tablero (getDashboardData) para varias fechas en secuencia y muestra
 * meta / pendientes / avance por OPL. Sirve para comprobar que cambiar de fecha
 * no borra la meta congelada de otra fecha.
 * node scripts/verificar-fechas-opl.mjs 2026-09-28 2026-09-29 2026-09-28
 * Nota: escribe server/data/gestor-state.json local (no toca el servidor 205).
 */
import 'dotenv/config';
import { getDashboardData } from '../server/gestor/engine.js';
import { loadState } from '../server/gestor/store.js';

const fechas = process.argv.slice(2);
if (!fechas.length) fechas.push('2026-09-28', '2026-09-29', '2026-09-28');

for (const date of fechas) {
  const d = await getDashboardData({ date });
  if (!d?.success) {
    console.log(date, 'ERROR', d?.message);
    continue;
  }
  console.log(`\n=== ${date} · turno ${d.turnoOperacion} ===`);
  console.log(
    `meta ${d.juegosTotalesOperacion} = antes ${d.totalJuegosAntesCorte} + adi ${d.totalJuegosAdicionales}` +
      ` · salidos ${d.totalJuegosSalidos} · incompletos ${d.totalSalidasIncompletas}` +
      ` · pendientes ${d.totalPendientesEnCava} (adi pend ${d.totalAdicionalesPendientes}) · ${d.progreso}%`
  );
  (d.todosOPL || []).forEach((p) => {
    console.log(
      `  ${p.opl.padEnd(28)} total ${String(p.total).padStart(4)}  desp ${String(p.despachados).padStart(4)}` +
        `  pend ${String(p.pendientes).padStart(4)}  inc ${String(p.incompletos || 0).padStart(3)}` +
        `  antes ${String(p.asignadosAntes).padStart(4)} adi ${String(p.adicionales).padStart(3)}  ${p.progreso}%`
    );
  });
}

const s = await loadState();
console.log('\nBaselines guardadas por fecha:');
Object.entries(s.oplBaselinesPorDia || {}).forEach(([k, v]) => {
  const suma = Object.values(v.totals || {}).reduce((a, n) => a + Number(n || 0), 0);
  console.log(`  ${k}: ${suma} juegos (${Object.keys(v.totals || {}).length} OPL)`);
});
process.exit(0);
