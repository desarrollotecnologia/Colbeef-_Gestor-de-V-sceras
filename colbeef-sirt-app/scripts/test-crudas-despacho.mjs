/**
 * Crudas en despacho del turno (mismo criterio que tablero Despachos).
 * node scripts/test-crudas-despacho.mjs
 */
import assert from 'assert';
import { contarCrudasProgramadasSync, getCrudasDetalle } from '../server/gestor/engine.js';
import { saveState, defaultState } from '../server/gestor/store.js';

const animal = '2606-12001';
const puesto = '01028/BUCA/CALLE/';
const turno = 'JxV';

const s = {
  lastSyncRange: { from: '2026-06-11' },
  estadoFromRow12: [
    [`${animal}-3`, 'Visceras Blancas', '', 'PROP', '', '', '', '', '', '', '', '', '', 'CRUDAS'],
  ],
  despachosCavas: [
    ['', '', '', `${animal}-3`, 'PROP', '', '', 'Visceras Blancas', '', `${puesto}${turno}/`],
    ['', '', '', `${animal}-1`, 'PROP', '', '', 'Cabeza', '', `${puesto}${turno}/`],
  ],
};

const cr = contarCrudasProgramadasSync(s, turno);
assert.strictEqual(cr.total, 1, 'cuenta VB cruda del turno aunque puesto venga sin sufijo en estado');

const sObs = {
  lastSyncRange: { from: '2026-06-11' },
  estadoFromRow12: [],
  despachosCavas: [
    ['', '', '', `${animal}-3`, 'PROP', '', '', 'Visceras Blancas', '', puesto, '', '', 'CRUDAS'],
  ],
};

const crObs = contarCrudasProgramadasSync(sObs, turno);
assert.strictEqual(crObs.total, 1, 'detecta cruda por observación en fila de despacho');

const puestoFull = '01009/Bucaramanga/MxJ/';
const sDet = {
  ...defaultState(),
  lastSyncRange: { from: '2026-06-17' },
  estadoFromRow12: [
    ['2606-05863-61', 'Visceras Blancas', '', 'PROP TEST', '', '01009', '', '', 'Bucaramanga', '', '', '', '', 'CRUDAS'],
  ],
  despachosCavas: [
    ['', '', '', '2606-05863-61', 'PROP TEST', '', '', 'Visceras Blancas', 'Bucaramanga', puestoFull],
  ],
  oplConfig: defaultState().oplConfig,
};
await saveState(sDet);
const det = await getCrudasDetalle();
assert.ok(det.success && det.filas.length === 1, 'detalle crudas');
assert.strictEqual(det.filas[0].puesto, '01009', 'solo código de puesto, no ruta completa');

console.log('test-crudas-despacho: ok');
