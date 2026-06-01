import express from 'express';
import cors from 'cors';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { pool, query } from './db.js';
import { getDespachosPorPropietario, getCategoriasVw } from './services/metrics.js';
import { buildExcelBuffer, buildPdfBuffer } from './services/exportReport.js';
import { dispatchRpc } from './gestor/rpc.js';
import * as gestor from './gestor/engine.js';
import { GESTOR_BUILD } from './gestor/engine.js';
import { procesarDespachos, getDetallePuesto } from './logic/despachos.logic.js';
import { setPuestosCrudas } from './logic/crudas.logic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = Number(process.env.SERVER_PORT || 3001);
const BIND_HOST = process.env.SERVER_BIND || '0.0.0.0';
const VITE_DEV_PORT = Number(process.env.VITE_PORT || 5173);
const isProd = process.env.NODE_ENV === 'production';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '8mb' }));

app.post('/api/rpc', async (req, res) => {
  try {
    const { method, args } = req.body || {};
    if (!method) {
      return res.status(400).json({ _error: 'Falta method' });
    }
    const out = await dispatchRpc(String(method), Array.isArray(args) ? args : []);
    res.json(out);
  } catch (e) {
    res.status(500).json({ _error: e.message });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1 AS ok');
    res.json({
      ok: true,
      db: true,
      gestorBuild: GESTOR_BUILD,
      despachosFuente: process.env.SIRT_DESPACHOS_FUENTE || 'programado',
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

/** URLs para compartir en la red local (gestor + API). */
app.get('/api/info', (req, res) => {
  const lan = getLanAddresses();
  const preferred = String(process.env.LAN_SHARE_IP || '').trim();
  const ips =
    preferred && !lan.includes(preferred)
      ? [preferred, ...lan]
      : preferred
        ? [preferred, ...lan.filter((ip) => ip !== preferred)]
        : lan;
  const gestorPath = '/gestor.html';
  const share = (ip, port) => `http://${ip}:${port}${gestorPath}`;
  const shareIp = preferred || ips[0] || '127.0.0.1';
  res.json({
    success: true,
    mode: isProd ? 'production' : 'development',
    apiPort: PORT,
    vitePort: VITE_DEV_PORT,
    gestorPath,
    localhost: {
      api: `http://127.0.0.1:${PORT}`,
      gestorDev: share('127.0.0.1', VITE_DEV_PORT),
      gestorProd: share('127.0.0.1', PORT),
    },
    lan: ips.map((ip) => ({
      ip,
      api: `http://${ip}:${PORT}`,
      gestorDev: share(ip, VITE_DEV_PORT),
      gestorProd: share(ip, PORT),
    })),
    recommended: share(shareIp, PORT),
  });
});

function parseOpts(req) {
  const days = req.query.days;
  const from = req.query.from;
  const to = req.query.to;
  return {
    days: days ? Number(days) : 7,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
  };
}

function parseGestorRange(req) {
  const src = { ...(req.query || {}), ...(req.body || {}) };
  return {
    date: src.date || src.fecha || undefined,
    from: src.from || src.desde || undefined,
    to: src.to || src.hasta || undefined,
  };
}

function apiError(res, e) {
  res.status(500).json({ success: false, message: e.message || String(e) });
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await gestor.getDashboardData(parseGestorRange(req));
    res.json(data);
  } catch (e) {
    apiError(res, e);
  }
});

/** Stock en cava (Estado_Cavas) — productos que AÚN NO han salido. */
app.get('/api/en-cava', async (req, res) => {
  try {
    const range = parseGestorRange(req);
    const data = await gestor.consultarEnCavaDesdeSIRT(range);
    res.json(data);
  } catch (e) {
    apiError(res, e);
  }
});

/** Alias de /api/en-cava para compatibilidad. */
app.get('/api/stock', async (req, res) => {
  try {
    const range = parseGestorRange(req);
    const data = await gestor.consultarEnCavaDesdeSIRT(range);
    res.json(data);
  } catch (e) {
    apiError(res, e);
  }
});

/** Salidas / despachos programados (Despachos_Cavas) — fuente ERP por defecto (despacho_desposte). */
app.get('/api/salidas', async (req, res) => {
  try {
    const range = parseGestorRange(req);
    const data = await gestor.consultarSalidasCavaDesdeSIRT(range);
    res.json(data);
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/decomisos', async (_req, res) => {
  try {
    res.json(await gestor.getResumenDecomisos());
  } catch (e) {
    apiError(res, e);
  }
});

/** Detalle de decomisos SIRT (SAI) — ventana automática 7 días hasta fecha consulta. */
app.get('/api/decomisos/detalle', async (req, res) => {
  try {
    const range = parseGestorRange(req);
    res.json(await gestor.consultarDecomisosDesdeSIRT(range));
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/decomisos/resumir', async (req, res) => {
  try {
    res.json(await gestor.prepararModuloDecomisosDesdeSIRT(parseGestorRange(req)));
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/decomisos/pdf', async (_req, res) => {
  try {
    const out = await gestor.generarPDFDecomisos();
    if (!out.success) return res.status(400).json(out);
    const base64 = String(out.url || '').split(',')[1];
    const buf = Buffer.from(base64 || '', 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${out.nombre || 'decomisos.pdf'}"`);
    res.send(buf);
  } catch (e) {
    apiError(res, e);
  }
});

/** Alias de /api/salidas para compatibilidad. */
app.get('/api/despachos', async (req, res) => {
  try {
    const range = parseGestorRange(req);
    const [despachos, enCava] = await Promise.all([
      gestor.consultarSalidasCavaDesdeSIRT(range),
      gestor.consultarEnCavaDesdeSIRT(range),
    ]);
    if (!despachos.success || !enCava.success) {
      return res.status(500).json({ success: false, message: 'No se pudieron consultar datos SIRT.' });
    }
    const turnoForzado = String(req.query.turno || '').trim();
    const out = procesarDespachos(despachos.filas || [], turnoForzado || undefined);
    const puestosCrudas = [...setPuestosCrudas(enCava.filas || [], despachos.filas || [], out.turno)];
    res.json({ success: true, ...out, puestosCrudas });
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/despachos/procesar', async (req, res) => {
  try {
    const range = parseGestorRange(req);
    const turnoForzado = String(req.body?.turno || req.query.turno || '').trim();
    const out = await gestor.prepararModuloDespachosDesdeSIRT(turnoForzado, range);
    if (!out?.success) return res.status(400).json(out || { success: false, message: 'No se pudo procesar despachos.' });
    const enCava = await gestor.consultarEnCavaDesdeSIRT(range);
    const despachos = await gestor.consultarSalidasCavaDesdeSIRT(range);
    const puestosCrudas =
      enCava.success && despachos.success
        ? [...setPuestosCrudas(enCava.filas || [], despachos.filas || [], out.turno)]
        : [];
    res.json({ ...out, puestosCrudas });
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/despachos/detalle/:puesto', async (req, res) => {
  try {
    const range = parseGestorRange(req);
    const turno = String(req.query.turno || '').trim();
    const puesto = String(req.params.puesto || '').trim();
    if (!puesto) return res.status(400).json({ success: false, message: 'Falta puesto.' });
    const despachos = await gestor.consultarSalidasCavaDesdeSIRT(range);
    if (!despachos.success) return res.status(500).json({ success: false, message: 'No se pudo consultar despachos.' });
    const filas = getDetallePuesto(despachos.filas || [], puesto, turno || undefined);
    const turnoUsado = turno || despachos.turno || '';
    res.json({ success: true, puesto, turno: turnoUsado, filas });
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/opl/config', async (_req, res) => {
  try {
    res.json(await gestor.getOplConfig());
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/opl/config', async (req, res) => {
  try {
    res.json(await gestor.upsertOpl(req.body?.propietario, req.body?.opl));
  } catch (e) {
    apiError(res, e);
  }
});

app.delete('/api/opl/config/:idx', async (req, res) => {
  try {
    res.json(await gestor.eliminarOpl(req.params.idx));
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/opl/progreso', async (_req, res) => {
  try {
    res.json(await gestor.getProgresoOPL());
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/opl/calcular', async (req, res) => {
  try {
    res.json(await gestor.calcularProgresoOPL(req.body?.totalJuegos));
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/crudas', async (_req, res) => {
  try {
    await gestor.importarExcel(null, 'Estado_Cavas');
    res.json(await gestor.getCrudasDetalle());
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/planilla', async (req, res) => {
  try {
    await gestor.consolidarDatos();
    res.json(await gestor.generarPlanillaPuntos(req.query.opl || 'TODOS'));
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/adicionales', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ success: false, message: 'Falta archivo .xlsx.' });
    const uploadRes = await gestor.importarExcelAdicionales(req.file.buffer, req.file.originalname);
    if (!uploadRes.success) return res.status(400).json(uploadRes);
    res.json(await gestor.importarAdicionales(null, req.file.originalname, 'AUTO'));
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/historico/pdf', async (_req, res) => {
  try {
    res.json(await gestor.getHistorialPDF());
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/historico/opl', async (req, res) => {
  try {
    res.json(await gestor.getHistoricoResumen(req.query.limit));
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    res.json(await gestor.getKPIs(req.query.opl || 'Todos los OPLs', req.query));
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/limpiar', async (_req, res) => {
  try {
    const resumen = await gestor.limpiarResumen();
    const despachos = await gestor.limpiarDespachos();
    res.json({ success: true, resumen, despachos });
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/despachos-propietario', async (req, res) => {
  try {
    const data = await getDespachosPorPropietario({
      ...parseOpts(req),
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/categorias', async (req, res) => {
  try {
    const data = await getCategoriasVw(parseOpts(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/export/resumen.xlsx', async (req, res) => {
  try {
    const buf = await buildExcelBuffer(parseOpts(req));
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="colbeef_resumen_sirt.xlsx"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/export/resumen.pdf', async (req, res) => {
  try {
    const buf = await buildPdfBuffer(parseOpts(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="colbeef_resumen_sirt.pdf"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

const clientRoot = path.join(__dirname, '..', 'client');
const clientDir = isProd ? path.join(clientRoot, 'dist') : clientRoot;
const publicDir = path.join(clientRoot, 'public');

function noCacheGestor(_req, res, next) {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
}

/** Rutas del gestor antes de static: evita servir archivos v2 antiguos. */
app.get('/', (_req, res) => {
  res.redirect(302, '/gestor.html');
});

/** Siempre el gestor.html fuente (no la copia vieja de client/dist). */
app.get('/gestor.html', noCacheGestor, (_req, res) => {
  res.sendFile(path.join(clientRoot, 'gestor.html'));
});

app.get(['/gestor-v2.html', '/gestor-v2.js'], (_req, res) => {
  res.redirect(302, '/gestor.html');
});

/** JS/CSS del gestor (gestor-ux.js, vendor, shim) — siempre desde client/public. */
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (/gestor-ux\.js$/.test(filePath) || /google-script-shim\.js$/.test(filePath)) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);

if (isProd) {
  app.use(express.static(clientDir));
}

if (isProd) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

function getLanAddresses() {
  const ifaces = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
    }
  }
  return addrs;
}

app.listen(PORT, BIND_HOST, () => {
  const lan = getLanAddresses();
  const pref = String(process.env.LAN_SHARE_IP || '').trim();
  const primary = pref && lan.includes(pref) ? pref : lan[0];
  console.log(`Colbeef SIRT API escuchando en ${BIND_HOST}:${PORT} (${isProd ? 'producción' : 'desarrollo'})`);
  console.log(`  API  http://127.0.0.1:${PORT}/api/health`);
  console.log(`  Gestor http://127.0.0.1:${PORT}/gestor.html`);
  for (const ip of lan) console.log(`  Gestor (compartir) http://${ip}:${PORT}/gestor.html`);
  if (!isProd) {
    console.log(`  Gestor con recarga en vivo (Vite) http://127.0.0.1:${VITE_DEV_PORT}/gestor.html`);
  }
  if (primary) console.log(`  Enlace recomendado: http://${primary}:${PORT}/gestor.html`);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
