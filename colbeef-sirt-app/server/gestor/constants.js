/** Catálogo central de reglas configurables compartidas por el motor. */

/** OPL aplicado a propietarios que no tienen una excepción explícita. */
export const OPL_DEFAULT = 'TRANSCARNES';

/** Asignaciones de negocio propietario → operador logístico. */
export const OPL_EXCEPCIONES_DEFAULT = [
  ['AVILA MONSALVE REINALDO', 'DRA CAVA'],
  ['BENITEZ GARNICA CEFERINO', 'EDGAR AM'],
  ['CALIXTO ARDILA JAIME', 'DRA CAVA'],
  ['CARNES SANTACRUZ S.A.S', 'CSZ B/GA'],
  ['CRUZ LEONIDAS', 'CAVA WO'],
  ['DRISTRIBUDORA DE CARNES AJR S.A.S', 'CAVA AJR'],
  ['INVERSIONES ZULUAGA RUEDA S.A.S.', 'MLT. GUARIN'],
  ['JAIMES BERMUDEZ JOSE MARIA', 'MLT. GUARIN'],
  ['SANCHEZ CALDERON MIREYA', 'CAVA MIREYA'],
  ['SUPERMERCADOS MAS POR MENOS S.A.S.', 'MLT. GUARIN'],
  ['TECNOLOGÍAS AGROPECUARIAS DE COLOMBIA S.A.S.', 'CAVA T.A'],
  ['ROMERO OSORIO JOHN IGNACIO', 'SMOYA'],
  ['VARGAS BLANCO REINALDO', 'CAVA CAMILO'],
  ['VARGAS NIÑO YERSON REYNALDO', 'CAVA YERSON'],
  ['COLBEEF S.A.S', 'MLT. GUARIN'],
];

/** Modelo de progreso OPL en el gestor (SIRT en vivo, no Excel/App Script). */
export const OPL_MODELO = {
  id: 'sirt-juego-completo',
  unidad: 'juegos-completos',
  flujo: ['Sincronizar SIRT', 'Procesar Despachos', 'Recalcular OPL'],
  validacion:
    'Los porcentajes usan juegos completos (4 subproductos) y fecha_salida real en SIRT. No coinciden con el Excel histórico.',
};

/** Destinos administrativos o especiales excluidos del despacho operativo. */
export const PUESTOS_EXCLUIDOS_DESP = [
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

/** Cuatro componentes necesarios para considerar completo un juego visceral. */
export const TIPOS_PRODUCTO = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];

/** Turno logístico esperado por día de semana de JavaScript (0 = domingo). */
export const TURNO_POR_DIA = { 0: 'DxL', 1: 'LxM', 2: 'MxM', 3: 'MxJ', 4: 'JxV', 5: 'VxS', 6: 'SxD' };

export const PREFIJOS_TURNO = [
  '/LxM/', '/MxM/', '/MxJ/', '/JxV/', '/VxS/', '/SxD/', '/DxL/',
  '/LXM/', '/MXM/', '/MXJ/', '/JXV/', '/VXS/', '/SXD/', '/DXL/',
];

export const ESTADO_COMPLETO = 'Completo';
export const ESTADO_PENDIENTE = 'Cerrado con pendientes';

/** Textos históricos de observación que identifican una VB como cruda. */
export const CRUDAS_VALORES = [
  'CRUDAS',
  'CRUDAS\nRETIRAR LIBRILLOS ASURCARNES',
  'CRUDAS\nRETIRAR LIBRILLOS ASURCARNESCOL',
  'CRUDAS\nRETIRAR LIBRILLOS DERIVADOS CARNICOS',
  'CRUDAS\nRETIRAR LIBRILLOS RUTH CACUA \nLENGUAS COMPLETAS SIN PELAR\nTRANSPORTA MULTICARNES',
  'CRUDAS\nRETIRAR LIBRILLOS SALOMON',
];
