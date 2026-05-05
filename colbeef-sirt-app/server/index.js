import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { pool, query } from './db.js';
import { getDashboard, getDespachosPorPropietario, getCategoriasVw } from './services/metrics.js';
import { buildExcelBuffer, buildPdfBuffer } from './services/exportReport.js';
import { dispatchRpc } from './gestor/rpc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = Number(process.env.SERVER_PORT || 3001);
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
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
    res.json({ ok: true, db: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
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

app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await getDashboard(parseOpts(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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

if (isProd) {
  const clientDir = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Colbeef SIRT API http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
