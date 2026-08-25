/**
 * Punto de entrada HTTP del Gestor de Vísceras.
 *
 * Responsabilidades:
 * - exponer API REST y puente RPC para la interfaz histórica;
 * - servir portal, gestor y dashboard de usabilidad;
 * - validar conectividad con SIRT;
 * - entregar exportaciones y PDF almacenados;
 * - publicar enlaces accesibles en la red local.
 */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
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
import {
  recordEvent,
  loginAdmin,
  verifyAdminToken,
  getUsageStats,
  buildGestorLink,
  migrateUsabilityJsonToMysql,
} from './gestor/usabilityStore.js';
import {
  initGestorMysql,
  closeGestorMysql,
  getGestorMysqlStatus,
  isGestorMysqlReady,
} from './gestorDb.js';
import { ensureGestorSchema, recordAuditoria } from './gestor/mysqlSchema.js';
import {
  loginUser,
  logoutUser,
  resolveSession,
  tokenFromReq,
  isAuthRequired,
  createUser,
} from './gestor/authStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = Number(process.env.SERVER_PORT || 3001);
const BIND_HOST = process.env.SERVER_BIND || '0.0.0.0';
const VITE_DEV_PORT = Number(process.env.VITE_PORT || 5173);
const PORTAL_RETURN_URL =
  String(process.env.PORTAL_RETURN_URL || '').trim() ||
  'http://192.168.20.205:8501/?session=active';
const isProd = process.env.NODE_ENV === 'production';
/** Los archivos adicionales se procesan en memoria y se limitan a 12 MiB. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '8mb' }));

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/info',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/usability/login',
]);

function reqMeta(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
  };
}

/** Nombre de sesión autenticada (preferido) o header legacy. */
function usuarioFromReq(req) {
  if (req.auth?.usuario) return String(req.auth.usuario).slice(0, 120);
  const h = String(req.headers['x-colbeef-usuario'] || '').trim();
  if (h) return h.slice(0, 120);
  const b = String(req.body?.usuario || '').trim();
  if (b) return b.slice(0, 120);
  return 'anonimo';
}

async function requireAuth(req, res, next) {
  if (!isAuthRequired()) return next();
  const token = tokenFromReq(req);
  const session = await resolveSession(token);
  if (!session) {
    return res.status(401).json({
      success: false,
      _error: 'No autenticado. Inicie sesión en el portal.',
      message: 'No autenticado. Inicie sesión en el portal.',
    });
  }
  req.auth = session;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!isAuthRequired()) return next();
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }
    if (!roles.includes(req.auth.rol)) {
      return res.status(403).json({ success: false, message: 'Sin permiso para esta acción.' });
    }
    next();
  };
}

function auditRest(req, accion, modulo, detalle, meta = {}) {
  void recordAuditoria(
    {
      usuario: usuarioFromReq(req),
      accion,
      modulo,
      detalle: detalle || '',
      meta,
    },
    reqMeta(req)
  );
}

/** Auth desactivada por defecto: la API es abierta en LAN. */
app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  if (!isAuthRequired()) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  if (req.path === '/api/usability/stats') return next();
  return requireAuth(req, res, next);
});

/**
 * Compatibilidad con `google.script.run`: delega únicamente métodos incluidos
 * en la lista blanca de `gestor/rpc.js`.
 */
app.post('/api/rpc', async (req, res) => {
  try {
    const { method, args } = req.body || {};
    if (!method) {
      return res.status(400).json({ _error: 'Falta method' });
    }
    const meta = reqMeta(req);
    const out = await dispatchRpc(String(method), Array.isArray(args) ? args : [], {
      usuario: req.auth?.usuario || usuarioFromReq(req),
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ _error: e.message });
  }
});

// ── Auth (login real) ──────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const out = await loginUser(req.body?.usuario, req.body?.password, reqMeta(req));
    if (!out.success) return res.status(401).json(out);
    res.json(out);
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    await logoutUser(tokenFromReq(req), reqMeta(req));
    res.json({ success: true });
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/auth/me', async (req, res) => {
  res.json({
    success: true,
    usuario: req.auth.usuario,
    rol: req.auth.rol,
    expiresAt: req.auth.expiresAt,
  });
});

app.post('/api/auth/users', requireRole('admin'), async (req, res) => {
  try {
    const out = await createUser({
      nombre: req.body?.usuario || req.body?.nombre,
      password: req.body?.password,
      rol: req.body?.rol || 'operador',
    });
    auditRest(req, 'create_user', 'auth', out.usuario, { rol: out.rol });
    res.json(out);
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

function adminTokenFromReq(req) {
  const auth = String(req.headers.authorization || '');
  // Token de usabilidad admin (no confundir con sesión del gestor)
  if (auth.startsWith('Bearer ') && String(req.headers['x-usability-admin'] || '').trim()) {
    return String(req.headers['x-usability-admin']).trim();
  }
  return String(req.headers['x-usability-admin'] || '').trim() ||
    (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '');
}

function requireUsabilityAdmin(req, res, next) {
  const token = adminTokenFromReq(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ success: false, message: 'No autorizado.' });
  }
  next();
}

// ── Telemetría y dashboard administrativo ──────────────────────────────────
app.post('/api/usability/event', async (req, res) => {
  try {
    const out = await recordEvent(req.body || {}, reqMeta(req));
    res.json(out);
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/usability/login', (req, res) => {
  const token = loginAdmin(req.body?.password);
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Contraseña incorrecta o USABILITY_ADMIN_PASSWORD no configurada en .env.',
    });
  }
  res.json({ success: true, token });
});

app.get('/api/usability/stats', requireUsabilityAdmin, async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const stats = await getUsageStats(days);
    res.json(stats);
  } catch (e) {
    apiError(res, e);
  }
});

app.get('/api/usability/enlace', (req, res) => {
  const usuario = String(req.query.usuario || '').trim();
  if (!usuario) {
    return res.status(400).json({ success: false, message: 'Indique usuario.' });
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || `127.0.0.1:${PORT}`;
  const baseUrl = `${proto}://${host}`;
  res.json({
    success: true,
    usuario,
    enlace: buildGestorLink(baseUrl, usuario),
    enlacePortal: `${baseUrl}/portal.html?usuario=${encodeURIComponent(usuario)}`,
  });
});

app.get('/api/health', async (_req, res) => {
  const mysqlStatus = getGestorMysqlStatus();
  try {
    await query('SELECT 1 AS ok');
    res.json({
      ok: true,
      db: true,
      sirt: true,
      gestorMysql: {
        enabled: mysqlStatus.enabled,
        ready: mysqlStatus.ready,
        database: mysqlStatus.database,
        lastError: mysqlStatus.lastError,
      },
      gestorBuild: GESTOR_BUILD,
      despachosFuente: process.env.SIRT_DESPACHOS_FUENTE || 'programado',
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: e.message,
      gestorMysql: {
        enabled: mysqlStatus.enabled,
        ready: mysqlStatus.ready,
        lastError: mysqlStatus.lastError,
      },
    });
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
    const out = await gestor.prepararModuloDecomisosDesdeSIRT(parseGestorRange(req));
    auditRest(req, 'prepararModuloDecomisosDesdeSIRT', 'decomisos', 'REST', {
      ok: !!out?.success,
    });
    res.json(out);
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
    auditRest(req, 'prepararModuloDespachosDesdeSIRT', 'despachos', 'REST', { ok: true, turno: out.turno });
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
    const out = await gestor.upsertOpl(req.body?.propietario, req.body?.opl);
    auditRest(req, 'upsertOpl', 'opl', `${req.body?.propietario || ''} → ${req.body?.opl || ''}`, {
      ok: !!out?.success,
    });
    res.json(out);
  } catch (e) {
    apiError(res, e);
  }
});

app.delete('/api/opl/config/:idx', async (req, res) => {
  try {
    const out = await gestor.eliminarOpl(req.params.idx);
    auditRest(req, 'eliminarOpl', 'opl', `idx=${req.params.idx}`, { ok: !!out?.success });
    res.json(out);
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
    const out = await gestor.calcularProgresoOPL(req.body?.totalJuegos);
    auditRest(req, 'calcularProgresoOPL', 'opl', 'REST', { ok: !!out?.success });
    res.json(out);
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
    const range = req.query.date ? { date: String(req.query.date) } : {};
    if (range.date) await gestor.prepararPlanillaDesdeSIRT(range);
    else await gestor.consolidarDatos();
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
    const out = await gestor.importarAdicionales(null, req.file.originalname, 'AUTO');
    auditRest(req, 'importarAdicionales', 'adicionales', req.file.originalname || '', {
      ok: !!out?.success,
    });
    res.json(out);
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

app.get('/api/historial/pdf/:id', async (req, res) => {
  try {
    const out = await gestor.obtenerPdfHistorial(req.params.id);
    if (!out?.buffer?.length) {
      return res.status(404).type('text/plain').send('PDF no encontrado o archivo dañado.');
    }
    const nombre = String(out.nombre || 'documento.pdf').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]/g, '_');
    const asDownload = String(req.query.download || '') === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${asDownload ? 'attachment' : 'inline'}; filename="${nombre}"`
    );
    res.send(out.buffer);
  } catch (e) {
    apiError(res, e);
  }
});

app.post('/api/limpiar', async (req, res) => {
  try {
    const resumen = await gestor.limpiarResumen();
    const despachos = await gestor.limpiarDespachos();
    auditRest(req, 'limpiar', 'operacion', 'REST limpiar resumen+despachos', { ok: true });
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
app.get('/', noCacheGestor, (_req, res) => {
  res.redirect(302, '/portal.html');
});

app.get('/portal.html', noCacheGestor, (_req, res) => {
  res.sendFile(path.join(clientRoot, 'portal.html'));
});

app.get('/usabilidad.html', noCacheGestor, (_req, res) => {
  res.sendFile(path.join(clientRoot, 'usabilidad.html'));
});

/** Siempre el gestor.html fuente (no la copia vieja de client/dist). */
app.get('/gestor.html', noCacheGestor, async (_req, res) => {
  try {
    const filePath = path.join(clientRoot, 'gestor.html');
    const html = await fs.readFile(filePath, 'utf8');
    const inject = `<script>window.COLBEEF_PORTAL_RETURN=${JSON.stringify(PORTAL_RETURN_URL)};</script>`;
    const out = html.includes('<!--PORTAL_RETURN_INJECT-->')
      ? html.replace('<!--PORTAL_RETURN_INJECT-->', inject)
      : html;
    res.type('html').send(out);
  } catch (e) {
    res.status(500).send('Error cargando gestor.html');
  }
});

app.get(['/gestor-v2.html', '/gestor-v2.js'], (_req, res) => {
  res.redirect(302, '/gestor.html');
});

/** JS/CSS del gestor (gestor-ux.js, vendor, shim) — siempre desde client/public. */
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (/gestor-ux\.js$/.test(filePath) || /google-script-shim\.js$/.test(filePath) || /usabilidad-tracker\.js$/.test(filePath)) {
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

async function startServer() {
  await initGestorMysql();
  if (isGestorMysqlReady()) {
    await ensureGestorSchema();
    await migrateUsabilityJsonToMysql();
  }
  if (!String(process.env.USABILITY_ADMIN_PASSWORD || '').trim()) {
    console.warn(
      '[usabilidad] USABILITY_ADMIN_PASSWORD no está en .env — el login de /usabilidad.html no funcionará.'
    );
  }

  app.listen(PORT, BIND_HOST, () => {
    const lan = getLanAddresses();
    const pref = String(process.env.LAN_SHARE_IP || '').trim();
    const primary = pref && lan.includes(pref) ? pref : lan[0];
    const mysql = getGestorMysqlStatus();
    console.log(`Colbeef SIRT API escuchando en ${BIND_HOST}:${PORT} (${isProd ? 'producción' : 'desarrollo'})`);
    console.log(`  API  http://127.0.0.1:${PORT}/api/health`);
    console.log(`  Portal http://127.0.0.1:${PORT}/portal.html`);
    console.log(`  Gestor http://127.0.0.1:${PORT}/gestor.html`);
    console.log(
      `  MySQL gestor: ${mysql.ready ? `OK ${mysql.host}/${mysql.database}` : mysql.enabled ? `NO (${mysql.lastError || 'sin conexión'})` : 'deshabilitado'}`
    );
    for (const ip of lan) {
      console.log(`  Portal (compartir) http://${ip}:${PORT}/portal.html`);
      console.log(`  Gestor (compartir) http://${ip}:${PORT}/gestor.html?usuario=NOMBRE`);
    }
    if (!isProd) {
      console.log(`  Gestor con recarga en vivo (Vite) http://127.0.0.1:${VITE_DEV_PORT}/gestor.html`);
    }
    if (primary) console.log(`  Enlace recomendado: http://${primary}:${PORT}/gestor.html`);
  });
}

startServer().catch((e) => {
  console.error('[start] Error al iniciar:', e);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await closeGestorMysql();
  await pool.end();
  process.exit(0);
});
