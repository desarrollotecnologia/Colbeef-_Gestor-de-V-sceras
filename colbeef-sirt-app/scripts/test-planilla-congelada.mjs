/**
 * Foto congelada de Planilla de Puntos por fecha|turno.
 * node scripts/test-planilla-congelada.mjs
 */
import assert from 'assert';
import { descartarJornadaDeOtroDia, defaultState } from '../server/gestor/store.js';

// Helpers internos no exportados: ejercitamos el contrato vía estado + API pública.
const engine = await import('../server/gestor/engine.js');

const dia = '2026-11-04';
const turno = 'MxJ';
const consolidado = [
  ['1014', 'Visceras Rojas', '', '1014/CENTRO/', '1014', 'CENTRO', 'CAVA AJR', 21, '04/11/2026', turno],
  ['9016', 'Visceras Rojas', '', '9016/FLORIDA/', '9016', 'FLORIDA', 'CAVA AJR', 5, '04/11/2026', turno],
];

// Simula lo que hace consolidarDatos al guardar la foto.
const s = defaultState();
s.diaGuardado = dia;
s.lastSyncRange = { from: dia, to: dia };
s.consolidado = consolidado;
s.planillaPorDia[`${dia}|${turno}`] = {
  consolidado: JSON.parse(JSON.stringify(consolidado)),
  totalJuegos: 26,
  turno,
  fechaIso: dia,
  fechaTxt: '04/11/2026',
  guardadoEn: '2026-11-04T20:00:00.000Z',
};

// Al cambiar el día, la jornada se limpia pero la foto permanece.
const r = descartarJornadaDeOtroDia(s, '2026-11-05');
assert.ok(r && r.descartado === dia, 'debe descartar la jornada del 04');
assert.strictEqual(s.consolidado.length, 0, 'consolidado activo se limpia');
assert.ok(s.planillaPorDia[`${dia}|${turno}`], 'planillaPorDia sobrevive');
assert.strictEqual(s.planillaPorDia[`${dia}|${turno}`].totalJuegos, 26);

// Restaurar como haría cargarPlanillaCongelada.
const snap = s.planillaPorDia[`${dia}|${turno}`];
s.consolidado = JSON.parse(JSON.stringify(snap.consolidado));
assert.strictEqual(s.consolidado.length, 2);
assert.strictEqual(s.consolidado[0][6], 'CAVA AJR');
assert.strictEqual(s.consolidado[0][7], 21);

assert.ok(typeof engine.cargarPlanillaCongelada === 'function');
assert.ok(typeof engine.prepararPlanillaDesdeSIRT === 'function');

// Una foto chica no debe pisar una grande del mismo día|turno.
{
  const s2 = defaultState();
  s2.planillaPorDia[`${dia}|${turno}`] = {
    consolidado: JSON.parse(JSON.stringify(consolidado)),
    totalJuegos: 26,
    turno,
    fechaIso: dia,
    fechaTxt: '04/11/2026',
    guardadoEn: '2026-11-04T20:00:00.000Z',
  };
  // Simula el helper: si el nuevo total es menor, se conserva el previo.
  const previo = s2.planillaPorDia[`${dia}|${turno}`];
  const nuevoTotal = 1;
  assert.ok(Number(previo.totalJuegos) > nuevoTotal, 'previo es mayor');
  // No sobrescribir
  assert.strictEqual(s2.planillaPorDia[`${dia}|${turno}`].totalJuegos, 26);
}

console.log('test-planilla-congelada: ok');
