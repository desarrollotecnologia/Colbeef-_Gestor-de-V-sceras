import { codigoBase, detectarTurno } from './helpers.js';

const PUESTOS_EXCLUIDOS = [
  '01305/TEMP1 /DxL///CALLE 23# 6-52 PLACITA GIRARDOT',
  '03105/Guarin //Cra 33a # 32-109',
  '05200/TEMP1 /DxL///CARRERA 3#61-39 LOS NARANJOS',
  '12157/Giron /DxL///CARRERA 22 # 13a-10 barrio EL CONSUELO',
  '379P/Piedecuesta /VxS/',
  'CAVA AJR/CAVA //CAVA AJR',
  'CAVA FORTUNATO/CAVA //CAVA',
  'CAVA MIREYA/CAVA //CAVA',
  'CAVA./CAVA ///',
  'CCARNES CAVA/CARNES Y CARNES //Cra 34 W #71-100 Bdga 46',
  'OLIMPICA/Barranquilla //6ta Entrada Km 2-701 via Caracoli-Malambo',
  'OLIMPICA/Barranquilla //6ta Entrada Km 2-701 vía Caracolí-Malambo',
  'RH32/Temp 2 Giron /DxL///CRA 29 # 33-70 LLANITO PARTE BAJA',
  'RH32/Temp 2 Girón /DxL///CRA 29 # 33-70 LLANITO PARTE BAJA',
];

const TIPOS = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];

export function procesarDespachos(filasDespachos, turnoForzado) {
  const turno = turnoForzado || detectarTurno(filasDespachos.map((f) => String(f.puesto || '')));
  const mapaPuestos = {};
  const vrUnicas = new Set();

  for (const fila of filasDespachos) {
    const id = String(fila.codigo || '').trim();
    const tipo = String(fila.tipoProducto || '').trim();
    const puesto = String(fila.puesto || '').trim();

    if (!id || !tipo || !puesto) continue;
    if (!puesto.includes(turno)) continue;
    if (PUESTOS_EXCLUIDOS.includes(puesto)) continue;
    if (!TIPOS.includes(tipo)) continue;

    if (!mapaPuestos[puesto]) {
      mapaPuestos[puesto] = {
        puesto,
        Cabeza: 0,
        'Patas y Manos': 0,
        'Visceras Blancas': 0,
        'Visceras Rojas': 0,
      };
    }
    mapaPuestos[puesto][tipo]++;

    if (tipo === 'Visceras Rojas') vrUnicas.add(codigoBase(id));
  }

  const resultado = Object.values(mapaPuestos).sort((a, b) => a.puesto.localeCompare(b.puesto));

  return {
    turno,
    totalJuegos: vrUnicas.size,
    totalPuestos: resultado.length,
    tipos: TIPOS,
    resultado,
  };
}

export function getDetallePuesto(filasDespachos, puesto, turno) {
  return filasDespachos
    .filter((f) => f.puesto === puesto && (!turno || String(f.puesto || '').includes(turno)))
    .map((f) => ({
      id: String(f.codigo || '').trim(),
      codigoBase: codigoBase(f.codigo),
      propietario: String(f.propietario || '').trim(),
      tipo: String(f.tipoProducto || '').trim(),
    }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.id.localeCompare(b.id));
}
