/**
 * Reetiquetado de paquetes viscerales: consulta SIRT (solo lectura) + ZPL.
 * Pistoleo por pieza (código completo) o por animal (las 4 del juego).
 */
import { query } from '../db.js';
import { TIPOS_PRODUCTO, OPL_DEFAULT, OPL_EXCEPCIONES_DEFAULT } from './constants.js';
import { detectarTurnoPorFechaISO, codigoBase } from './engineUtils.js';
import { loadState } from './store.js';
import * as etiquetas from './etiquetasVisceras.js';

const TIPOS_SQL = `('Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas')`;
const RE_CODIGO = /^(\d{4}-\d{3,6})(?:-(\d{2,6}))?$/i;

const ORDEN_TIPO = {
  Cabeza: 1,
  'Patas y Manos': 2,
  'Visceras Blancas': 3,
  'Visceras Rojas': 4,
};

const SQL_ETIQUETA = `
  SELECT
    pp.id_producto::text AS codigo_animal,
    COALESCE(NULLIF(TRIM(pp.identificacion), ''), pp.id_producto::text) AS codigo_barras,
    pp.id_tipo_parte_producto AS id_tipo,
    tpp.nombre AS tipo,
    pp.observaciones,
    pp.reetiquetado,
    mov.cava,
    mov.fecha_salida,
    prog.sucursal,
    prog.direccion_entrega,
    prog.destino_real,
    prog.fecha_prog,
    prop.propietario
  FROM trazabilidad_proceso.parte_producto pp
  JOIN trazabilidad_proceso.tipo_parte_producto tpp
    ON tpp.id = pp.id_tipo_parte_producto
   AND tpp.nombre IN ${TIPOS_SQL}
  LEFT JOIN LATERAL (
    SELECT c.nombre AS cava, m.fecha_salida
    FROM trazabilidad_proceso.parte_producto_cava_riel m
    LEFT JOIN trazabilidad_proceso.cava c ON c.id = m.id_cava
    WHERE m.id_parte_producto = pp.id
      AND m.id_producto::text = pp.id_producto::text
    ORDER BY m.fecha_ingreso DESC NULLS LAST, m.id DESC
    LIMIT 1
  ) mov ON true
  LEFT JOIN LATERAL (
    SELECT
      s.nombre AS sucursal,
      s.direccion AS direccion_entrega,
      de.nombre AS destino_real,
      ppel.fecha_programacion_despacho AS fecha_prog
    FROM trazabilidad_proceso.parte_producto_empresa ppe
    JOIN trazabilidad_proceso.parte_producto_empresa_local ppel
      ON ppel.id_parte_producto_empresa = ppe.id
    LEFT JOIN organizaciones.sucursal s ON s.id = ppel.id_local
    LEFT JOIN trazabilidad_proceso.destino de ON de.id = s.id_destino
    WHERE ppe.id_parte_producto = pp.id
      AND ppe.id_producto::text = pp.id_producto::text
    ORDER BY ppel.fecha_programacion_despacho DESC NULLS LAST, ppel.id DESC
    LIMIT 1
  ) prog ON true
  LEFT JOIN LATERAL (
    SELECT NULLIF(TRIM(e.nombre), '') AS propietario
    FROM trazabilidad_proceso.producto_empresa pe
    JOIN organizaciones.empresa e ON e.id = pe.id_empresa
    WHERE pe.id_producto::text = pp.id_producto::text
      AND pe.activo = true
    LIMIT 1
  ) prop ON true
  WHERE pp.id_producto::text = $1
  ORDER BY tpp.nombre
`;

let rolloColumnasMem = null;

function mapaOplDesdeEstado(state) {
  const mapa = {};
  OPL_EXCEPCIONES_DEFAULT.forEach(([prop, opl]) => {
    const k = String(prop || '')
      .trim()
      .toUpperCase();
    if (k) mapa[k] = String(opl || '').trim() || OPL_DEFAULT;
  });
  (state?.oplConfig || []).forEach((r) => {
    const k = String(r.propietario || '')
      .trim()
      .toUpperCase();
    if (k) mapa[k] = String(r.opl || '').trim() || OPL_DEFAULT;
  });
  return mapa;
}

function oplDePropietario(mapa, propietario) {
  const k = String(propietario || '')
    .trim()
    .toUpperCase();
  if (!k) return OPL_DEFAULT;
  return mapa[k] || OPL_DEFAULT;
}

function esCruda(obs) {
  return /cruda/i.test(String(obs || ''));
}

function fechaProgIso(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function parsearCodigo(codigo) {
  const limpio = String(codigo || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  const m = limpio.match(RE_CODIGO);
  if (!m) {
    const err = new Error(
      `Código no válido: ${codigo || ''} (ej. 2610-09188 o 2610-09188-6493)`
    );
    err.status = 400;
    throw err;
  }
  return { base: m[1], sufijo: m[2] || null };
}

function armarDatos(row, mapaOpl) {
  const tipo = String(row.tipo || '').trim();
  const animal = String(row.codigo_animal || '').trim();
  const codigoBarras = String(row.codigo_barras || animal).trim();
  const fechaProg = fechaProgIso(row.fecha_prog);
  const turno =
    (fechaProg && detectarTurnoPorFechaISO(fechaProg)) ||
    '';
  const sucursal = String(row.sucursal || '').trim();
  const puesto = sucursal;
  const cliente = String(row.propietario || '').trim();
  const destino = String(row.destino_real || '').trim();
  const zona = destino || '';
  const cava = String(row.cava || '').trim();
  const cruda = esCruda(row.observaciones);
  const datos = {
    codigoBarras,
    codigo_barras: codigoBarras,
    codigoAnimal: animal,
    codigo_animal: animal,
    idTipo: Number(row.id_tipo || 0),
    tipo,
    cam: etiquetas.tipoCorto(tipo),
    cuarto: tipo || 'Paquete Visceral',
    ubicacion: etiquetas.abreviarCava(cava),
    cava,
    puesto,
    turno,
    puestoTurno: puesto && turno ? `${puesto} /${turno}/` : puesto,
    puesto_turno: puesto && turno ? `${puesto} /${turno}/` : puesto,
    cliente,
    opl: oplDePropietario(mapaOpl, cliente),
    zona,
    destino,
    direccion: String(row.direccion_entrega || '').trim(),
    fechaProgramacion: fechaProg,
    fecha_programacion: fechaProg,
    enCava: Boolean(cava) && row.fecha_salida == null,
    en_cava: Boolean(cava) && row.fecha_salida == null,
    cruda,
    reetiquetadoSirt: Boolean(row.reetiquetado),
    reetiquetado_sirt: Boolean(row.reetiquetado),
  };
  datos.layout = etiquetas.layoutEtiqueta(datos);
  return datos;
}

function filtrarPorSufijo(rows, sufijo) {
  if (!sufijo) return rows;
  const s = String(sufijo).toUpperCase();
  const match = rows.filter((r) => {
    const cod = String(r.codigo_barras || '').toUpperCase();
    return cod.endsWith(`-${s}`) || cod.endsWith(s);
  });
  return match.length ? match : rows;
}

function ordenarTipos(rows) {
  return [...rows].sort((a, b) => {
    const ta = String(a.tipo || '').trim();
    const tb = String(b.tipo || '').trim();
    return (ORDEN_TIPO[ta] || 99) - (ORDEN_TIPO[tb] || 99);
  });
}

export async function getRolloColumnas() {
  if (rolloColumnasMem === 2 || rolloColumnasMem === 4) return rolloColumnasMem;
  try {
    const s = await loadState();
    const n = Number(s.etiquetasRolloColumnas || 4);
    rolloColumnasMem = n === 2 ? 2 : 4;
  } catch (_) {
    rolloColumnasMem = 4;
  }
  return rolloColumnasMem;
}

export async function setRolloColumnas(columnas) {
  const n = Number(columnas) === 2 ? 2 : 4;
  rolloColumnasMem = n;
  try {
    const { saveState } = await import('./store.js');
    const s = await loadState();
    s.etiquetasRolloColumnas = n;
    await saveState(s);
  } catch (_) {
    /* memoria alcanza si no hay store */
  }
  return { success: true, columnas: n };
}

etiquetas.setColumnasProvider(() => rolloColumnasMem || Number(process.env.ZEBRA_ETQ_COLUMNAS || 4) || 4);

export async function buscarEtiquetas(codigo) {
  await getRolloColumnas();
  const { base, sufijo } = parsearCodigo(codigo);
  const { rows } = await query(SQL_ETIQUETA, [base]);
  if (!rows.length) {
    const err = new Error(`No se encontró el juego visceral ${codigo} en SIRT`);
    err.status = 404;
    throw err;
  }
  const filtradas = ordenarTipos(filtrarPorSufijo(rows, sufijo));
  const state = await loadState().catch(() => null);
  const mapa = mapaOplDesdeEstado(state);
  return filtradas.map((r) => armarDatos(r, mapa));
}

function layoutsConCopias(datos, copias) {
  const n = Math.max(1, Math.min(Number(copias || 1), 20));
  return datos.flatMap((d) => Array.from({ length: n }, () => d.layout));
}

/** Muestra fija de las 4 manillas (diseño opción 1) para la vista previa. */
export function muestraCuatroManillas() {
  const base = {
    puesto: '02072',
    turno: 'LxM',
    puestoTurno: '02072 /LxM/',
    puesto_turno: '02072 /LxM/',
    codigoAnimal: '2610-09188',
    codigo_animal: '2610-09188',
    ubicacion: 'CPV2',
    zona: 'San Francisco',
    fechaProgramacion: '2026-10-23',
    fecha_programacion: '2026-10-23',
    cliente: 'LOZANO GALVIS',
    opl: 'TRANSCARNES',
    destino: 'San Francisco',
    direccion: 'San Francisco',
    enCava: true,
    en_cava: true,
  };
  const piezas = [
    { tipo: 'Cabeza', cam: 'CAB', codigoBarras: '2610-09188-60' },
    { tipo: 'Patas y Manos', cam: 'PyM', codigoBarras: '2610-09188-61' },
    { tipo: 'Visceras Blancas', cam: 'VB', codigoBarras: '2610-09188-6114' },
    { tipo: 'Visceras Rojas', cam: 'VR', codigoBarras: '2610-09188-6493' },
  ];
  return piezas.map((p) => {
    const datos = {
      ...base,
      ...p,
      codigo_barras: p.codigoBarras,
      cuarto: p.tipo,
    };
    datos.layout = etiquetas.layoutEtiqueta(datos);
    return datos;
  });
}

export async function getEtiqueta(codigo) {
  const datos = await buscarEtiquetas(codigo);
  return {
    success: true,
    etiquetas: datos,
    zpl: etiquetas.zplLote(datos.map((d) => d.layout)),
    impresora: etiquetas.configImpresora(),
  };
}

export async function getMuestraEtiquetas() {
  await getRolloColumnas();
  const datos = muestraCuatroManillas();
  return {
    success: true,
    muestra: true,
    etiquetas: datos,
    zpl: etiquetas.zplLote(datos.map((d) => d.layout)),
    impresora: etiquetas.configImpresora(),
  };
}

export async function getEtiquetaZpl(codigo, copias = 1) {
  const datos = await buscarEtiquetas(codigo);
  const zpl = etiquetas.zplLote(layoutsConCopias(datos, copias));
  const nombre = String(codigo || 'etiqueta')
    .replace(/[^\w\-]/g, '_')
    .slice(0, 60);
  return { zpl, filename: `reetiquetado_${nombre || 'etiqueta'}.zpl`, datos };
}

export async function imprimirEtiquetas({ codigos = [], copias = 1 } = {}) {
  const lista = (codigos || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (!lista.length) {
    const err = new Error('Sin códigos para imprimir');
    err.status = 400;
    throw err;
  }
  const datos = [];
  for (const c of lista.slice(0, 200)) {
    datos.push(...(await buscarEtiquetas(c)));
  }
  const nCopias = Math.max(1, Math.min(Number(copias || 1), 20));
  const layouts = layoutsConCopias(datos, nCopias);
  const zpl = etiquetas.zplLote(layouts);
  const envio = await etiquetas.enviarZpl(zpl);
  const cfg = etiquetas.configImpresora();
  return {
    success: true,
    impresas: datos.length,
    copias: nCopias,
    codigos: datos.map((d) => d.codigoBarras),
    columnas: cfg.columnas,
    ...envio,
  };
}

export async function calibrarImpresora() {
  await getRolloColumnas();
  const zpl = etiquetas.zplCalibracion();
  const envio = await etiquetas.enviarZpl(zpl);
  return { success: true, ...envio, impresora: etiquetas.configImpresora() };
}

export async function getConfigImpresora() {
  await getRolloColumnas();
  return {
    success: true,
    impresora: etiquetas.configImpresora(),
    columnas: await getRolloColumnas(),
  };
}

/** Helpers exportados para pruebas / RPC. */
export { codigoBase, TIPOS_PRODUCTO };
