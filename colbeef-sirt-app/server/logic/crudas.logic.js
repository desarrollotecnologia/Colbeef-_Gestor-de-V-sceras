import { codigoBase, extraerPuesto } from './helpers.js';

function esCruda(val) {
  const v = String(val || '').trim().toUpperCase();
  return v === 'CRUDAS' || v.startsWith('CRUDAS');
}

export function detectarCrudas(filasCava) {
  const codigosUnicos = new Set();
  const porPuesto = {};
  for (const f of filasCava) {
    if (String(f.descripcion || '').trim() !== 'Visceras Blancas') continue;
    if (!esCruda(f.observacion)) continue;
    const base = codigoBase(f.codigo);
    if (!base || codigosUnicos.has(base)) continue;
    codigosUnicos.add(base);
    const puesto = extraerPuesto(f.destino);
    if (!porPuesto[puesto]) porPuesto[puesto] = { cantidad: 0, codigos: [] };
    porPuesto[puesto].cantidad++;
    porPuesto[puesto].codigos.push(base);
  }
  return {
    total: codigosUnicos.size,
    codigos: [...codigosUnicos],
    porPuesto: Object.entries(porPuesto).map(([puesto, d]) => ({ puesto, ...d })),
  };
}

export function setPuestosCrudas(filasCava, filasDespachos, turno) {
  const { codigos } = detectarCrudas(filasCava);
  const setCodigos = new Set(codigos);
  const puestos = new Set();
  for (const f of filasDespachos) {
    if (String(f.tipoProducto || '').trim() !== 'Visceras Blancas') continue;
    if (turno && !String(f.puesto || '').includes(turno)) continue;
    if (setCodigos.has(codigoBase(f.codigo))) puestos.add(String(f.puesto || ''));
  }
  return puestos;
}
