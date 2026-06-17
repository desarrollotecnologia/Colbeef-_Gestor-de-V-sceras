/**
 * Fórmula informe cavas (planta / Excel).
 * node scripts/test-informe-cavas.mjs
 */
import assert from 'assert';
import { calcularTotalesCavas, calcularJuegosEquivalentes } from '../server/gestor/informeCavasUtils.js';

const cavasPlanta = [
  { grupo: 'V. Rojas & Blancas (V.Rojas)', carros: 20, capPorCarro: 40, inventario: 639 },
  { grupo: 'V. Rojas & Blancas (V.Blancas)', carros: 25, capPorCarro: 22, inventario: 147 },
  { grupo: 'V. Acondicionamiento', carros: 25, capPorCarro: 22, inventario: 492 },
  { grupo: 'Patas & Manos', carros: 9, capPorCarro: 80, inventario: 639 },
  { grupo: 'Cabezas', carros: 9, capPorCarro: 80, inventario: 638 },
];

const t1 = calcularTotalesCavas(cavasPlanta);
assert.strictEqual(t1.juegosEquivalentes, 638.75, 'juegos equiv. 16/06 escenario 1');
assert.strictEqual(t1.ocupacionPct, 76, 'ocupación ponderada');
assert.strictEqual(t1.inventarioPiezas, 2555, 'suma piezas');

const cavas2 = cavasPlanta.map((c) =>
  c.grupo === 'Patas & Manos' ? { ...c, inventario: 693 } : c
);
const t2 = calcularTotalesCavas(cavas2);
assert.strictEqual(t2.juegosEquivalentes, 652.25, 'juegos equiv. con patas 693');

const eq = calcularJuegosEquivalentes(cavasPlanta);
assert.deepStrictEqual(eq.partes, [639, 639, 639, 638]);

console.log('test-informe-cavas: ok');
