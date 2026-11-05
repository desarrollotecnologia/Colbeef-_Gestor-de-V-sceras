/**
 * Historial de planilla: resumen OPL + preferir foto con más juegos.
 * node scripts/test-planilla-historial.mjs
 */
import assert from 'assert';
import { resumenOplDesdeConsolidado } from '../server/gestor/planillaHistorial.js';
import { descartarJornadaDeOtroDia, defaultState } from '../server/gestor/store.js';

const consolidado = [
  ['1014', 'Visceras Rojas', '', '1014/CENTRO/', '1014', 'CENTRO', 'CAVA AJR', 21, '04/11/2026', 'MxJ'],
  ['9016', 'Visceras Rojas', '', '9016/FLORIDA/', '9016', 'FLORIDA', 'CAVA AJR', 5, '04/11/2026', 'MxJ'],
  ['2032', 'Visceras Rojas', '', '2032/SAN FRANCISCO/', '2032', 'SAN FRANCISCO', 'EDGAR AM', 10, '04/11/2026', 'MxJ'],
];

const resumen = resumenOplDesdeConsolidado(consolidado);
assert.strictEqual(resumen.length, 2);
assert.strictEqual(resumen[0].opl, 'CAVA AJR');
assert.strictEqual(resumen[0].totalJuegos, 26);
assert.strictEqual(resumen[1].opl, 'EDGAR AM');
assert.strictEqual(resumen[1].totalJuegos, 10);

const s = defaultState();
s.diaGuardado = '2026-11-04';
s.planillaPorDia['2026-11-04|MxJ'] = {
  consolidado,
  totalJuegos: 36,
  turno: 'MxJ',
  fechaIso: '2026-11-04',
  fechaTxt: '04/11/2026',
};
const r = descartarJornadaDeOtroDia(s, '2026-11-05');
assert.ok(r && r.descartado === '2026-11-04');
assert.ok(s.planillaPorDia['2026-11-04|MxJ'].totalJuegos === 36, 'historial local sobrevive');

console.log('test-planilla-historial: ok');
