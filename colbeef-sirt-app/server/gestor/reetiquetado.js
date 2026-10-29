/**
 * Reetiquetado de paquetes viscerales: consulta SIRT (solo lectura) + ZPL.
 * Pistoleo por pieza (código completo) o por animal (las 4 del juego).
 */
import { query } from '../db.js';
import {
  TIPOS_PRODUCTO,
  OPL_DEFAULT,
  OPL_EXCEPCIONES_DEFAULT,
  PUESTOS_TEMPRANAS,
} from './constants.js';
import {
  detectarTurnoPorFechaISO,
  codigoBase,
  parsePuestoOperacion,
  formatearCodigoSucursal,
} from './engineUtils.js';
import { loadState, saveState } from './store.js';
import * as etiquetas from './etiquetasVisceras.js';
import { consultarJuegosAsignadosDelDia } from './engine.js';

const ETIQUETAS_DIAS_GUARDADOS = 15;

function fechaKey(fecha) {
  return String(fecha || '').trim().slice(0, 10);
}

export async function getEtiquetasImpresas(fecha) {
  const s = await loadState().catch(() => null);
  const bag = (s && s.etiquetasImpresas) || {};
  return { ...(bag[fechaKey(fecha)] || {}) };
}

export async function marcarEtiquetasImpresas(fecha, codigos = []) {
  const key = fechaKey(fecha);
  if (!key) {
    const err = new Error('Fecha requerida para marcar impresas');
    err.status = 400;
    throw err;
  }
  const s = await loadState();
  if (!s.etiquetasImpresas || typeof s.etiquetasImpresas !== 'object') s.etiquetasImpresas = {};
  const dia = { ...(s.etiquetasImpresas[key] || {}) };
  const ahora = new Date().toISOString();
  let n = 0;
  for (const c of codigos || []) {
    const cod = String(c || '').trim().toUpperCase();
    if (!cod) continue;
    dia[cod] = ahora;
    n += 1;
  }
  s.etiquetasImpresas[key] = dia;
  const keys = Object.keys(s.etiquetasImpresas).sort();
  while (keys.length > ETIQUETAS_DIAS_GUARDADOS) {
    delete s.etiquetasImpresas[keys.shift()];
  }
  await saveState(s);
  return { success: true, fecha: key, marcadas: n, total: Object.keys(dia).length };
}

export async function limpiarEtiquetasImpresas(fecha, codigos = null) {
  const key = fechaKey(fecha);
  if (!key) {
    const err = new Error('Fecha requerida para limpiar marcas');
    err.status = 400;
    throw err;
  }
  const s = await loadState();
  if (!s.etiquetasImpresas || typeof s.etiquetasImpresas !== 'object') s.etiquetasImpresas = {};
  const dia = { ...(s.etiquetasImpresas[key] || {}) };
  let limpiadas = 0;
  if (!codigos || !codigos.length) {
    limpiadas = Object.keys(dia).length;
    delete s.etiquetasImpresas[key];
  } else {
    for (const c of codigos) {
      const cod = String(c || '').trim().toUpperCase();
      if (cod && dia[cod]) {
        delete dia[cod];
        limpiadas += 1;
      }
    }
    if (Object.keys(dia).length) s.etiquetasImpresas[key] = dia;
    else delete s.etiquetasImpresas[key];
  }
  await saveState(s);
  return {
    success: true,
    fecha: key,
    limpiadas,
    quedan: Object.keys(s.etiquetasImpresas[key] || {}).length,
  };
}

function cmpCodigoAnimal(a, b) {
  return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', {
    numeric: true,
    sensitivity: 'base',
  });
}

function ordenarFilasEtiqueta(filas, orden) {
  const modo = String(orden || 'codigo').toLowerCase();
  return [...filas].sort((a, b) => {
    if (modo === 'cliente') {
      return (
        String(a.propietario || '').localeCompare(String(b.propietario || ''), 'es') ||
        String(a.puesto || '').localeCompare(String(b.puesto || ''), 'es') ||
        cmpCodigoAnimal(a, b)
      );
    }
    if (modo === 'puesto') {
      return (
        String(a.puesto || '').localeCompare(String(b.puesto || ''), 'es') ||
        String(a.propietario || '').localeCompare(String(b.propietario || ''), 'es') ||
        cmpCodigoAnimal(a, b)
      );
    }
    // codigo (default): menor → mayor
    return cmpCodigoAnimal(a, b);
  });
}

const TIPOS_SQL = `('Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas')`;
const RE_CODIGO = /^(\d{4}-\d{3,6})(?:-(\d{2,6}))?$/i;

const ORDEN_TIPO = {
  Cabeza: 1,
  'Patas y Manos': 2,
  'Visceras Blancas': 3,
  'Visceras Rojas': 4,
};

/** Columnas fijas de producto + plan_faena (sexo/peso conocidos; GSMI se resuelve aparte). */
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
    prop.propietario,
    anim.sexo,
    anim.peso_pie,
    anim.identificacion_animal,
    faena.lote,
    faena.fecha_beneficio
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
  LEFT JOIN LATERAL (
    SELECT
      NULLIF(TRIM(p.sexo::text), '') AS sexo,
      p.peso_animal_pie AS peso_pie,
      NULLIF(TRIM(p.identificacion::text), '') AS identificacion_animal
    FROM trazabilidad_proceso.producto p
    WHERE p.id::text = pp.id_producto::text
    LIMIT 1
  ) anim ON true
  LEFT JOIN LATERAL (
    SELECT
      pf.id::text AS lote,
      DATE(timezone('America/Bogota', pf.fecha_plan)) AS fecha_beneficio
    FROM trazabilidad_proceso.plan_faena_producto pfp
    JOIN trazabilidad_proceso.plan_faena pf ON pf.id = pfp.id_plan_faena
    WHERE pfp.id_producto::text = pp.id_producto::text
    ORDER BY pf.fecha_plan DESC NULLS LAST, pf.id DESC
    LIMIT 1
  ) faena ON true
  WHERE pp.id_producto::text = $1
  ORDER BY tpp.nombre
`;

let rolloColumnasMem = null;
let gsmiColProducto = undefined; // null = no hay; string = nombre columna; undefined = aún no explorado

async function resolverColumnaGsmiProducto() {
  if (gsmiColProducto !== undefined) return gsmiColProducto;
  try {
    const { rows } = await query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'trazabilidad_proceso'
        AND table_name = 'producto'
        AND (
          column_name ILIKE '%gsmi%'
          OR column_name ILIKE '%guia_sanitaria%'
          OR column_name ILIKE '%guia_moviliz%'
          OR column_name ILIKE 'numero_guia%'
        )
      ORDER BY
        CASE
          WHEN column_name ILIKE 'gsmi' THEN 0
          WHEN column_name ILIKE 'codigo_gsmi' THEN 1
          ELSE 2
        END
      LIMIT 1
      `
    );
    gsmiColProducto = rows[0]?.column_name || null;
  } catch (_) {
    gsmiColProducto = null;
  }
  return gsmiColProducto;
}

async function buscarGsmiAnimal(codigoAnimal) {
  const col = await resolverColumnaGsmiProducto();
  if (!col || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) return '';
  try {
    const { rows } = await query(
      `SELECT NULLIF(TRIM(${col}::text), '') AS gsmi
       FROM trazabilidad_proceso.producto
       WHERE id::text = $1
       LIMIT 1`,
      [codigoAnimal]
    );
    return String(rows[0]?.gsmi || '').trim();
  } catch (_) {
    return '';
  }
}

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

function fechaDmy(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function sumarDiasIso(iso, dias) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + Number(dias || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function diasVencimientoEtiqueta() {
  const n = Number(process.env.GESTOR_ETQ_DIAS_VENCIMIENTO ?? 4);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4;
}

/** Sexo del QR: M / H (como sale al escanear la etiqueta SIRT). */
function sexoQr(sexo) {
  const s = String(sexo || '').trim().toLowerCase();
  if (!s) return '';
  if (/^h|hembra|vaca|female/.test(s)) return 'H';
  if (/^m|macho|novillo|toro|male/.test(s)) return 'M';
  return s.charAt(0).toUpperCase();
}

function pesoPieQr(peso) {
  if (peso == null || peso === '') return '';
  const n = Number(peso);
  if (!Number.isFinite(n) || n <= 0) {
    const t = String(peso).trim();
    return /kg/i.test(t) ? t.replace(/\s+/g, '') : t ? `${t}Kg` : '';
  }
  const entero = Math.round(n);
  return `${entero}Kg`;
}

/**
 * Contenido exacto del QR de la etiqueta SIRT de vísceras, p. ej.:
 * 2610-09188-6493
 * Patas y Manos
 * Bovino
 * GSMI: 26-B-68655-0000779608
 * Pie: 503Kg
 * Sexo: M
 * Lote: 38833
 * F.B: 23-10-2026
 * F.V: 27-10-2026
 */
export function armarPayloadQr(et) {
  const codigo = String(et.codigoBarras || et.codigo_barras || '').trim();
  const tipo = String(et.tipo || '').trim();
  const especie = String(et.especie || 'Bovino').trim() || 'Bovino';
  const gsmi = String(et.gsmi || '').trim();
  const pie = String(et.pie || et.pesoPie || '').trim();
  const sexo = String(et.sexoQr || et.sexo || '').trim();
  const lote = String(et.lote || '').trim();
  const fb = String(et.fechaBeneficioDmy || '').trim();
  const fv = String(et.fechaVencimientoDmy || '').trim();
  return [
    codigo,
    tipo,
    especie,
    `GSMI: ${gsmi || '-'}`,
    `Pie: ${pie || '-'}`,
    `Sexo: ${sexo || '-'}`,
    `Lote: ${lote || '-'}`,
    `F.B: ${fb || '-'}`,
    `F.V: ${fv || '-'}`,
  ].join('\n');
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

function armarDatos(row, mapaOpl, extras = {}) {
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
  const fechaBeneficio = fechaProgIso(row.fecha_beneficio);
  const fechaVencimiento = fechaBeneficio
    ? sumarDiasIso(fechaBeneficio, diasVencimientoEtiqueta())
    : '';
  // GSMI suele verse como 26-B-68655-0000779608; no usar arete/identificación genérica.
  const gsmiCandidato = String(extras.gsmi || row.gsmi || row.identificacion_animal || '').trim();
  const gsmi = /^\d{2}-[A-Za-z0-9]+-\d+/.test(gsmiCandidato) ? gsmiCandidato : String(extras.gsmi || row.gsmi || '').trim();
  const pie = pesoPieQr(row.peso_pie);
  const sexo = sexoQr(row.sexo);
  const lote = String(row.lote || '').trim();
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
    especie: 'Bovino',
    gsmi,
    pie,
    pesoPie: pie,
    sexo,
    sexoQr: sexo,
    lote,
    fechaBeneficio,
    fechaBeneficioDmy: fechaDmy(fechaBeneficio),
    fechaVencimiento,
    fechaVencimientoDmy: fechaDmy(fechaVencimiento),
  };
  datos.qrPayload = armarPayloadQr(datos);
  datos.qr_payload = datos.qrPayload;
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
  return {
    success: true,
    columnas: n,
    impresora: etiquetas.configImpresora(),
  };
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
  const gsmi = await buscarGsmiAnimal(base);
  return filtradas.map((r) => armarDatos(r, mapa, { gsmi }));
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
    direccion: 'Cll 58 # 12-104 Barrio Reposo',
    enCava: true,
    en_cava: true,
    especie: 'Bovino',
    gsmi: '26-B-68655-0000779608',
    pie: '503Kg',
    sexo: 'M',
    sexoQr: 'M',
    lote: '38833',
    fechaBeneficioDmy: '23-10-2026',
    fechaVencimientoDmy: '27-10-2026',
  };
  const piezas = [
    { tipo: 'Cabeza', cam: 'CAB', codigoBarras: '2610-09188-60' },
    { tipo: 'Patas y Manos', cam: 'PyM', codigoBarras: '2610-09188-6493' },
    { tipo: 'Visceras Blancas', cam: 'VB', codigoBarras: '2610-09188-6114' },
    { tipo: 'Visceras Rojas', cam: 'VR', codigoBarras: '2610-09188-61' },
  ];
  return piezas.map((p) => {
    const datos = {
      ...base,
      ...p,
      codigo_barras: p.codigoBarras,
      cuarto: p.tipo,
    };
    datos.qrPayload = armarPayloadQr(datos);
    datos.qr_payload = datos.qrPayload;
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

export async function imprimirEtiquetas({
  codigos = [],
  copias = 1,
  soloZpl = false,
  fecha = '',
  marcar = true,
} = {}) {
  const lista = (codigos || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (!lista.length) {
    const err = new Error('Sin códigos para imprimir');
    err.status = 400;
    throw err;
  }
  const datos = [];
  const slotsAnimal = [];
  for (const c of lista.slice(0, 200)) {
    const piezas = await buscarEtiquetas(c);
    datos.push(...piezas);
    const animal = codigoBase(c) || String(c).trim().toUpperCase();
    for (const p of piezas) {
      slotsAnimal.push(codigoBase(p.codigoAnimal || p.codigo_animal || animal) || animal);
    }
  }
  const nCopias = Math.max(1, Math.min(Number(copias || 1), 20));
  const layouts = layoutsConCopias(datos, nCopias);
  const slotsConCopias = slotsAnimal.flatMap((s) => Array.from({ length: nCopias }, () => s));
  const zpl = etiquetas.zplLote(layouts);
  const fechaMark = fechaKey(fecha) || fechaKey(new Date().toISOString());
  const pasadas = etiquetas.metaPasadas(slotsConCopias, fechaMark);
  const cfg = etiquetas.configImpresora();
  const animales = [...new Set(slotsAnimal.map((c) => String(c || '').toUpperCase()).filter(Boolean))];
  const base = {
    success: true,
    impresas: datos.length,
    juegos: animales.length,
    copias: nCopias,
    codigos: datos.map((d) => d.codigoBarras),
    codigosAnimales: animales,
    columnas: cfg.columnas,
    impresora: cfg,
    zpl,
    pasadas,
    fecha: fechaMark,
  };
  if (soloZpl) {
    return { ...base, modo: 'solo_zpl', destino: 'cliente' };
  }
  const envio = await etiquetas.enviarZpl(zpl);
  if (marcar && animales.length) {
    await marcarEtiquetasImpresas(fechaMark, animales).catch(() => null);
  }
  return { ...base, ...envio };
}

export async function calibrarImpresora({ soloZpl = false } = {}) {
  await getRolloColumnas();
  const zpl = etiquetas.zplCalibracion();
  const cfg = etiquetas.configImpresora();
  if (soloZpl) {
    return {
      success: true,
      modo: 'solo_zpl',
      destino: 'cliente',
      zpl,
      impresora: cfg,
    };
  }
  const envio = await etiquetas.enviarZpl(zpl);
  return { success: true, ...envio, impresora: cfg };
}

export async function getConfigImpresora() {
  await getRolloColumnas();
  return {
    success: true,
    impresora: etiquetas.configImpresora(),
    columnas: await getRolloColumnas(),
  };
}

const TEMPRANAS_SET = new Set(
  PUESTOS_TEMPRANAS.map((p) => {
    const u = String(p || '').trim().toUpperCase();
    if (/^\d+$/.test(u)) return String(parseInt(u, 10));
    return u;
  })
);

/** Marcador operativo TEMP1 / TEMP 1 / temp 1 en ruta o puesto SIRT. */
function tieneMarcadorTemp1(texto) {
  return /\bTEMP\s*1\b/i.test(String(texto || ''));
}

/**
 * Temprana para imprimir:
 * - puestos del catálogo PUESTOS_TEMPRANAS (NSF, 6505, ARIR, LHMV, WMERCAN), o
 * - únicamente rutas/puestos que traen TEMP1 / temp 1 (no TEMP2 ni TEMP genérico).
 */
function esTempranaPuesto(puesto) {
  const po = parsePuestoOperacion(puesto);
  const cod = formatearCodigoSucursal(po.codigo || String(puesto || '').split('/')[0] || '');
  const key = /^\d+$/.test(cod) ? String(parseInt(cod, 10)) : String(cod).toUpperCase();
  if (key && TEMPRANAS_SET.has(key)) return true;
  const u = String(puesto || '').toUpperCase();
  if (TEMPRANAS_SET.has(u)) return true;
  return tieneMarcadorTemp1(puesto);
}

/**
 * Pendientes en cava para imprimir por OPL.
 * modo: normal | tempranas | adicionales
 * orden: codigo (default) | puesto | cliente
 * soloNuevas: excluye ya marcadas como impresas ese día
 */
export async function listarPendientesEtiquetas({
  fecha = '',
  modo = 'normal',
  opls = null,
  orden = 'codigo',
  soloNuevas = false,
} = {}) {
  const out = await consultarJuegosAsignadosDelDia(fecha ? { date: fecha, from: fecha, to: fecha } : {});
  if (!out.success) return out;
  const modoNorm = String(modo || 'normal').toLowerCase();
  if (!['normal', 'tempranas', 'adicionales'].includes(modoNorm)) {
    const err = new Error('modo debe ser normal, tempranas o adicionales');
    err.status = 400;
    throw err;
  }
  const oplFiltro = Array.isArray(opls) && opls.length
    ? new Set(opls.map((o) => String(o || '').trim().toUpperCase()).filter(Boolean))
    : null;
  const impresasMap = await getEtiquetasImpresas(out.fecha);
  const o = String(orden || 'codigo').toLowerCase();
  const ordenNorm = o === 'cliente' || o === 'puesto' ? o : 'codigo';

  let enCava = (out.filas || [])
    .filter((f) => String(f.estado || '') === 'En cava')
    .map((f) => {
      const temprana = esTempranaPuesto(f.puesto);
      const adicional = Boolean(f.adicional);
      const cod = String(f.codigo || '').trim().toUpperCase();
      return {
        codigo: f.codigo,
        propietario: f.propietario,
        opl: f.opl || OPL_DEFAULT,
        puesto: f.puesto,
        horaAsignacion: f.horaAsignacion || '',
        adicional,
        temprana,
        yaImpresa: Boolean(impresasMap[cod]),
        tipoSalida: adicional ? 'adicional' : temprana ? 'temprana' : 'normal',
      };
    });

  if (modoNorm === 'tempranas') {
    enCava = enCava.filter((f) => f.temprana && !f.adicional);
  } else if (modoNorm === 'adicionales') {
    enCava = enCava.filter((f) => f.adicional);
  } else {
    enCava = enCava.filter((f) => !f.temprana && !f.adicional);
  }
  if (oplFiltro) {
    enCava = enCava.filter((f) => oplFiltro.has(String(f.opl || '').toUpperCase()));
  }
  const totalConImpresas = enCava.length;
  const yaImpresas = enCava.filter((f) => f.yaImpresa).length;
  let filtradas = soloNuevas ? enCava.filter((f) => !f.yaImpresa) : enCava;
  filtradas = ordenarFilasEtiqueta(filtradas, ordenNorm);

  const porOpl = new Map();
  filtradas.forEach((f) => {
    const opl = f.opl || OPL_DEFAULT;
    if (!porOpl.has(opl)) {
      porOpl.set(opl, {
        opl,
        total: 0,
        tempranas: 0,
        adicionales: 0,
        yaImpresas: 0,
        codigos: [],
        clientes: new Map(),
      });
    }
    const g = porOpl.get(opl);
    g.total += 1;
    if (f.temprana) g.tempranas += 1;
    if (f.adicional) g.adicionales += 1;
    if (f.yaImpresa) g.yaImpresas += 1;
    g.codigos.push(f.codigo);
    const cli = f.propietario || 'SIN CLIENTE';
    if (!g.clientes.has(cli)) {
      g.clientes.set(cli, { cliente: cli, total: 0, puestos: new Set(), codigos: [] });
    }
    const c = g.clientes.get(cli);
    c.total += 1;
    if (f.puesto) c.puestos.add(String(f.puesto).split('/')[0] || f.puesto);
    c.codigos.push(f.codigo);
  });

  const oplsOut = [...porOpl.values()]
    .map((g) => ({
      opl: g.opl,
      total: g.total,
      tempranas: g.tempranas,
      adicionales: g.adicionales,
      yaImpresas: g.yaImpresas,
      codigos: g.codigos,
      clientes: [...g.clientes.values()].map((c) => ({
        cliente: c.cliente,
        total: c.total,
        puestos: [...c.puestos],
        codigos: c.codigos,
      })),
    }))
    .sort((a, b) => a.opl.localeCompare(b.opl, 'es'));

  const totalJuegos = filtradas.length;
  return {
    success: true,
    fecha: out.fecha,
    modo: modoNorm,
    orden: ordenNorm,
    soloNuevas: Boolean(soloNuevas),
    corteAdicional: out.corteAdicional,
    puestosTempranas: [...PUESTOS_TEMPRANAS],
    totalJuegos,
    totalConImpresas,
    yaImpresas,
    totalEtiquetasEstimadas: totalJuegos * 4,
    totalPasadas: totalJuegos,
    opls: oplsOut,
    codigos: filtradas.map((f) => f.codigo),
    mensaje:
      modoNorm === 'tempranas'
        ? `Tempranas en cava: ${totalJuegos} juego(s)`
        : modoNorm === 'adicionales'
          ? `Adicionales (≥ ${out.corteAdicional}) en cava: ${totalJuegos} juego(s)`
          : `Lote normal en cava (sin tempranas ni adicionales): ${totalJuegos} juego(s)`,
  };
}

export async function imprimirPendientesEtiquetas(payload = {}) {
  const lista = await listarPendientesEtiquetas(payload);
  const oplsSel = Array.isArray(payload.opls) && payload.opls.length
    ? new Set(payload.opls.map((o) => String(o || '').trim().toUpperCase()))
    : null;
  // Mantener el orden de lista.codigos (p. ej. por código de animal), no reordenar por OPL
  let codigos = lista.codigos || [];
  if (oplsSel) {
    const permitidos = new Set(
      (lista.opls || [])
        .filter((o) => oplsSel.has(String(o.opl || '').toUpperCase()))
        .flatMap((o) => o.codigos || [])
    );
    codigos = codigos.filter((c) => permitidos.has(c));
  }
  if (!codigos.length) {
    const err = new Error(
      lista.modo === 'tempranas'
        ? 'No hay tempranas pendientes en cava para imprimir'
        : lista.modo === 'adicionales'
          ? `No hay adicionales (≥ ${lista.corteAdicional}) pendientes en cava`
          : payload.soloNuevas || payload.solo_nuevas
            ? 'No hay juegos nuevos pendientes (todas ya están marcadas como impresas)'
            : 'No hay juegos del lote normal pendientes en cava'
    );
    err.status = 400;
    throw err;
  }
  const max = Number(process.env.GESTOR_ETQ_MAX_JUEGOS_LOTE || 80);
  if (codigos.length > max) {
    const err = new Error(
      `Son ${codigos.length} juegos (${codigos.length * 4} etiquetas). Máximo ${max} por envío: imprime por partes.`
    );
    err.status = 400;
    throw err;
  }
  const soloZpl = Boolean(payload.soloZpl || payload.solo_zpl);
  const print = await imprimirEtiquetas({
    codigos,
    copias: payload.copias || 1,
    soloZpl,
    fecha: lista.fecha,
    // Con Browser Print se marca pasada a pasada desde el cliente
    marcar: !soloZpl,
  });
  return {
    ...print,
    modo: lista.modo,
    orden: lista.orden,
    fecha: lista.fecha,
    juegos: codigos.length,
    codigosAnimales: codigos,
  };
}

/** Helpers exportados para pruebas / RPC. */
export { codigoBase, TIPOS_PRODUCTO };
