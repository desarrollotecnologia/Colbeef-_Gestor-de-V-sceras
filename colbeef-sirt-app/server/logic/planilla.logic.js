import { extraerPuesto } from './helpers.js';

export function calcularPlanilla(filasCava, mapaPlazas) {
  const pts = {};
  for (const f of filasCava) {
    const puesto = extraerPuesto(String(f.destino || ''));
    if (!puesto) continue;
    pts[puesto] = (pts[puesto] || 0) + 0.25;
  }
  const porZona = {};
  for (const [puesto, puntos] of Object.entries(pts)) {
    const zona = mapaPlazas[puesto] || 'ENTRADA A CAVA';
    if (!porZona[zona]) porZona[zona] = { total: 0, puestos: {} };
    porZona[zona].total += puntos;
    porZona[zona].puestos[puesto] = (porZona[zona].puestos[puesto] || 0) + puntos;
  }
  return Object.entries(porZona)
    .map(([zona, d]) => ({
      zona,
      total: Math.round(d.total * 100) / 100,
      puestos: Object.entries(d.puestos)
        .map(([p, pto]) => ({ puesto: p, puntos: Math.round(pto * 100) / 100 }))
        .sort((a, b) => a.puesto.localeCompare(b.puesto)),
    }))
    .sort((a, b) => b.total - a.total);
}
