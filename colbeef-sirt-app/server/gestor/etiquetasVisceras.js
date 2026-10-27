/**
 * Reetiquetado de paquete visceral — Zebra ZT231 203 dpi (ZPL).
 *
 * Misma tira física que Despacho Canales / etiqueta SIRT:
 * 2.5 × 26.35 cm = 197 × 2106 dots, texto rotado 90°.
 * Rollo de 4 manillas por pasada (o 2 para rollos viejos).
 *
 * Opción 1 (despacho corto): puesto/turno, barras, animal, tipo,
 * cava abreviada (sin riel), zona, cliente, OPL, destino + QR
 * con el código de la pieza (igual que la etiqueta SIRT).
 * Logo preimpreso en el rollo.
 */
import net from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

export const LARGO_DOTS = 2106;
export const ANCHO_DOTS = 197;
export const IMPRESORA_DEFAULT = 'ZDesigner ZT231-203dpi ZPL';

const ROLLO_PRESETS = {
  4: {
    columnas: 4,
    margen: 53,
    paso: 188,
    tiras: '53,241,429,632',
    envTiras: 'ZEBRA_ETQ_TIRAS',
    invertirOrden: true,
    anchoTotal: 832,
  },
  2: {
    columnas: 2,
    margen: 241,
    paso: 188,
    tiras: '241,429',
    envTiras: 'ZEBRA_ETQ_TIRAS_2',
    invertirOrden: true,
    anchoTotal: 429 + 197,
  },
};

let columnasProvider = null;

export function setColumnasProvider(fn) {
  columnasProvider = typeof fn === 'function' ? fn : null;
}

export function columnasRolloActivas() {
  if (columnasProvider) {
    try {
      const n = Number(columnasProvider() || 4);
      if (ROLLO_PRESETS[n]) return n;
    } catch (_) {
      /* ignore */
    }
  }
  const n = Number(process.env.ZEBRA_ETQ_COLUMNAS || 4);
  return ROLLO_PRESETS[n] ? n : 4;
}

function truthyEnv(name, def = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  return ['1', 'true', 'si', 'sí', 'yes'].includes(String(raw).trim().toLowerCase());
}

export function configImpresora() {
  const host = String(process.env.ZEBRA_HOST || '').trim();
  const cols = columnasRolloActivas();
  const preset = ROLLO_PRESETS[cols];
  const tirasTxt = String(process.env[preset.envTiras] || '').trim() || preset.tiras;
  const tiras = (tirasTxt.match(/-?\d+/g) || []).map((v) => Number(v));
  return {
    impresora: String(process.env.ZEBRA_PRINTER || IMPRESORA_DEFAULT).trim(),
    host,
    puerto: Number(process.env.ZEBRA_PORT || 9100) || 9100,
    modo: host ? 'red' : 'windows',
    velocidad: Number(process.env.ZEBRA_VELOCIDAD || 4) || 4,
    oscuridad: Number(process.env.ZEBRA_OSCURIDAD || 25) || 25,
    invertir: truthyEnv('ZEBRA_ETQ_INVERTIR', true),
    ajusteLargo: Number(process.env.ZEBRA_ETQ_AJUSTE_LARGO || 0) || 0,
    ajusteAncho: Number(process.env.ZEBRA_ETQ_AJUSTE_ANCHO || 0) || 0,
    anchoTotal:
      cols === 4
        ? Number(process.env.ZEBRA_ETQ_ANCHO_TOTAL || 832) || 832
        : Number(preset.anchoTotal || 626),
    columnas: preset.columnas,
    margen:
      cols === 4 ? Number(process.env.ZEBRA_ETQ_MARGEN || 53) || 53 : preset.margen,
    paso: cols === 4 ? Number(process.env.ZEBRA_ETQ_PASO || 188) || 188 : preset.paso,
    tiras: tiras.length ? tiras : preset.tiras.split(',').map(Number),
    invertirOrden: Boolean(preset.invertirOrden),
  };
}

/** Cava Paquete Visceral 2 → CPV2 · Recepción… → RCP · sin riel. */
export function abreviarCava(cava) {
  const txt = String(cava || '').trim();
  if (!txt) return '';
  const cpv = txt.match(/paquete\s+visceral\s*([0-9]+[a-z]?)/i);
  if (cpv) return `CPV${cpv[1].toUpperCase()}`;
  const cont = txt.match(/contenedor\s+paquete\s+visceral\s*([0-9]+[a-z]?)/i);
  if (cont) return `CONT${cont[1].toUpperCase()}`;
  if (/recepci[oó]n/i.test(txt) && /blancas|rojas/i.test(txt)) return 'RCP-VR';
  if (/recepci[oó]n/i.test(txt) && /cabeza|patas|manos/i.test(txt)) return 'RCP-PM';
  if (/recepci[oó]n/i.test(txt)) return 'RCP';
  const cavaN = txt.match(/cava\s*([0-9]+[a-z]?)/i);
  if (cavaN) return `C${cavaN[1].toUpperCase()}`;
  return txt.slice(0, 12).toUpperCase();
}

export function tipoCorto(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  if (t.includes('cabeza')) return 'CAB';
  if (t.includes('patas')) return 'PyM';
  if (t.includes('blancas')) return 'VB';
  if (t.includes('rojas')) return 'VR';
  return (tipo || '').slice(0, 6).toUpperCase() || '—';
}

function zplTxt(valor) {
  return String(valor || '')
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ')
    .trim();
}

function corto(valor, maxChars) {
  const txt = zplTxt(valor);
  return txt.length <= maxChars ? txt : txt.slice(0, maxChars).trimEnd();
}

function fechaDmy(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/**
 * Elementos de la tira en coordenadas a lo largo (x=largo, y=ancho).
 *
 * Orden real (como SIRT / hueco de la manilla):
 * bloque 1 (puesto + barras + animal) → QR en el espacio después del
 * código de barras → cava/zona → cliente → logo.
 * El texto ^A0R crece a lo largo: w del puesto/animal se mantiene
 * parecido al largo del barcode para no tapar el QR.
 */
export function layoutEtiqueta(et) {
  const codigo = zplTxt(et.codigoBarras || et.codigo_barras);
  const qrTexto = String(et.qrPayload || et.qr_payload || codigo || '')
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ')
    .trim();
  // Canales: b1=520, b3=920 (hueco vacío). Aquí el QR llena ese hueco.
  const b1 = 400;
  const bQr = 780;
  const b3 = 1000;
  const b4 = 1420;
  const c4 = 40;
  const tipoLabel = et.cruda
    ? `${zplTxt(et.tipo)} CRUDAS`
    : zplTxt(et.tipo);
  const elementos = [
    {
      tipo: 'texto',
      x: b1,
      y: 4,
      h: 40,
      w: 32,
      texto: corto(et.puestoTurno || et.puesto_turno || 'SIN PUESTO', 16),
    },
    { tipo: 'barras', x: b1, y: 52, h: 44, modulo: 2, texto: codigo },
    {
      tipo: 'texto',
      x: b1,
      y: 102,
      h: 36,
      w: 30,
      texto: zplTxt(et.codigoAnimal || et.codigo_animal),
    },
    { tipo: 'texto', x: b1, y: 148, h: 16, texto: corto(tipoLabel, 20) },
    // QR justo después del código de barras (espacio libre antes de cava)
    ...(qrTexto
      ? [{ tipo: 'qr', x: bQr, y: 22, h: 150, mag: 3, texto: qrTexto }]
      : []),
    {
      tipo: 'texto',
      x: b3,
      y: 8,
      h: 24,
      texto: corto(et.cuarto || et.tipo || 'Paquete Visceral', 22),
    },
    {
      tipo: 'texto',
      x: b3 + 280,
      y: 6,
      h: 28,
      texto: zplTxt(et.cam || tipoCorto(et.tipo)),
    },
    {
      tipo: 'texto',
      x: b3,
      y: 42,
      h: 40,
      w: 50,
      texto: `Cava: ${zplTxt(et.ubicacion) || '-'}`,
    },
    {
      tipo: 'texto',
      x: b3,
      y: 96,
      h: 24,
      texto: `Zona: ${corto(et.zona || '-', 24)}`,
    },
    {
      tipo: 'texto',
      x: b3,
      y: 132,
      h: 22,
      texto: `Despacho: ${fechaDmy(et.fechaProgramacion || et.fecha_programacion) || '-'}`,
    },
    {
      tipo: 'texto',
      x: b4,
      y: 6,
      h: 17,
      texto: corto(`Cliente ${et.cliente || '-'}`, c4),
    },
    {
      tipo: 'texto',
      x: b4,
      y: 29,
      h: 17,
      texto: corto(`Puesto ${et.puesto || '-'}`, c4),
    },
    {
      tipo: 'texto',
      x: b4,
      y: 52,
      h: 17,
      texto: corto(`Turno ${et.turno || '-'}`, c4),
    },
    {
      tipo: 'texto',
      x: b4,
      y: 75,
      h: 17,
      texto: corto(`OPL ${et.opl || '-'}`, c4),
    },
    {
      tipo: 'texto',
      x: b4,
      y: 98,
      h: 17,
      texto: corto(`Destino ${et.destino || '-'}`, c4),
    },
    {
      tipo: 'texto',
      x: b4,
      y: 121,
      h: 17,
      texto: corto(et.direccion || '', c4),
    },
    { tipo: 'texto', x: b4, y: 144, h: 17, texto: 'Especie Bovino' },
  ];
  return elementos.filter((e) => e.texto);
}

function encabezado(cfg) {
  return [
    '^XA',
    '^CI28',
    `^PW${cfg.anchoTotal}`,
    `^LL${LARGO_DOTS}`,
    '^LH0,0',
    cfg.invertir ? '^POI' : '^PON',
    `^PR${cfg.velocidad}`,
    `~SD${String(cfg.oscuridad).padStart(2, '0')}`,
  ];
}

function inicioTira(cfg, pos) {
  const tiras = cfg.tiras || [];
  if (tiras.length >= cfg.columnas) return tiras[pos];
  return cfg.margen + pos * cfg.paso;
}

function campos(layout, xTira, cfg) {
  const out = [];
  for (const e of layout) {
    const h = e.h;
    const foX = Math.max(0, xTira + ANCHO_DOTS - (e.y + cfg.ajusteAncho) - h);
    const foY = Math.max(0, e.x + cfg.ajusteLargo);
    if (e.tipo === 'linea') {
      out.push(`^FO${foX},${foY}^GB${h},${e.largo},${h}^FS`);
    } else if (e.tipo === 'barras') {
      out.push(
        `^FO${foX},${foY}^BY${e.modulo},3,${h}^BCR,${h},N,N,N,A^FD${e.texto}^FS`
      );
    } else if (e.tipo === 'qr') {
      const mag = Math.max(2, Math.min(Number(e.mag || 4), 10));
      // ^BQR = QR rotado 90° (misma orientación que el texto de la tira)
      out.push(`^FO${foX},${foY}^BQR,2,${mag}^FDQA,${e.texto}^FS`);
    } else {
      const w = Number(e.w || h);
      out.push(`^FO${foX},${foY}^A0R,${h},${w}^FD${e.texto}^FS`);
    }
  }
  return out;
}

/** Reparte layouts en las tiras del rollo (4 o 2 por pasada). */
export function zplLote(layouts) {
  const cfg = configImpresora();
  const n = cfg.columnas;
  const rev = Boolean(cfg.invertir) && Boolean(cfg.invertirOrden);
  const formatos = [];
  for (let i = 0; i < layouts.length; i += n) {
    const lineas = encabezado(cfg);
    const chunk = layouts.slice(i, i + n);
    chunk.forEach((layout, col) => {
      const pos = rev ? n - 1 - col : col;
      lineas.push(...campos(layout, inicioTira(cfg, pos), cfg));
    });
    lineas.push('^PQ1,0,1,Y', '^XZ');
    formatos.push(lineas.join('\n'));
  }
  return formatos.join('\n');
}

export function zplCalibracion() {
  const cfg = configImpresora();
  const lineas = encabezado(cfg);
  for (const y0 of [300, 1000, 1700]) {
    for (let x = 0; x <= cfg.anchoTotal; x += 10) {
      const largo = x % 50 === 0 ? 50 : 20;
      lineas.push(`^FO${x},${y0}^GB2,${largo},2^FS`);
      if (x % 50 === 0) {
        lineas.push(`^FO${x + 3},${y0 + 55}^A0R,18,16^FD${x}^FS`);
      }
    }
  }
  for (let x = 20; x < cfg.anchoTotal; x += 100) {
    for (let y = 0; y < LARGO_DOTS; y += 200) {
      if (y === 300 || y === 1000 || y === 1700) continue;
      lineas.push(`^FO${x},${y}^A0R,22,20^FDL${y}^FS`);
    }
  }
  lineas.push('^PQ1,0,1,Y', '^XZ');
  return lineas.join('\n');
}

function enviarPorRed(zpl, cfg) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(
      { host: cfg.host, port: cfg.puerto, timeout: 8000 },
      () => {
        socket.write(zpl, 'utf8', () => {
          socket.end();
          resolve({
            modo: 'red',
            destino: `${cfg.host}:${cfg.puerto}`,
          });
        });
      }
    );
    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout al conectar con la Zebra'));
    });
  });
}

function enviarPorWindows(zpl, cfg) {
  const tmp = path.join(os.tmpdir(), `reetiquetado-visceras-${Date.now()}.zpl`);
  fs.writeFileSync(tmp, zpl, 'utf8');
  try {
    const destino = `\\\\localhost\\${cfg.impresora}`;
    execFileSync('cmd.exe', ['/c', `copy /b "${tmp}" "${destino}"`], {
      windowsHide: true,
      timeout: 15000,
    });
    return { modo: 'windows', destino: cfg.impresora };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(
      `No se pudo enviar a la impresora «${cfg.impresora}». ` +
        `Defina ZEBRA_HOST en .env o instale la cola en Windows. (${msg})`
    );
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {
      /* ignore */
    }
  }
}

export async function enviarZpl(zpl) {
  const cfg = configImpresora();
  if (cfg.host) return enviarPorRed(zpl, cfg);
  return enviarPorWindows(zpl, cfg);
}
