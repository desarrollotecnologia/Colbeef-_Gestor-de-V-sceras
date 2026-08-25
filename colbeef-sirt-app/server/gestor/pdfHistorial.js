/**
 * Persistencia de PDF generados.
 *
 * Binarios en disco (`pdf-historial/`). Metadatos en MySQL (`pdf_historial`)
 * cuando está disponible; si no, en `gestor-state.json` (historialPdf).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { gestorQuery, isGestorMysqlReady } from '../gestorDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PDF_HISTORIAL_DIR = path.join(__dirname, '..', 'data', 'pdf-historial');

function nombreArchivoSeguro(nombre) {
  return String(nombre || 'documento.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Guarda el PDF en disco; devuelve id y fileName (sin base64 en estado). */
export async function guardarPdfHistorial(buffer, meta = {}) {
  await fs.mkdir(PDF_HISTORIAL_DIR, { recursive: true });
  const id = crypto.randomBytes(8).toString('hex');
  const fileName = `${id}_${nombreArchivoSeguro(meta.nombre)}`;
  await fs.writeFile(path.join(PDF_HISTORIAL_DIR, fileName), buffer);
  return { id, fileName };
}

/** Lee el archivo indicado; la validación del ID corresponde al motor/API. */
export async function leerPdfHistorial(fileName) {
  return fs.readFile(path.join(PDF_HISTORIAL_DIR, fileName));
}

/** URL pública relativa para abrir o descargar un PDF desde Express. */
export function urlAbrirPdfHistorial(id) {
  return `/api/historial/pdf/${encodeURIComponent(id)}`;
}

export async function ensurePdfHistorialTable() {
  if (!isGestorMysqlReady()) return;
  await gestorQuery(`
    CREATE TABLE IF NOT EXISTS pdf_historial (
      id VARCHAR(32) NOT NULL PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      tipo VARCHAR(80) NULL,
      registros INT UNSIGNED NOT NULL DEFAULT 0,
      usuario VARCHAR(120) NOT NULL DEFAULT 'SISTEMA',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_pdf_historial_created (created_at),
      KEY idx_pdf_historial_usuario (usuario)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * El historial guarda la fecha como `dd/MM/yyyy HH:mm` (fmtNow), formato que
 * `new Date()` no interpreta y que MySQL rechazaría como created_at nulo.
 */
function parseFechaMeta(raw) {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? new Date() : raw;
  const texto = String(raw || '').trim();
  if (!texto) return new Date();
  const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] || 0),
      Number(m[5] || 0)
    );
  }
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function insertPdfMetaMysql(row) {
  if (!isGestorMysqlReady()) return { ok: false, skipped: true };
  await ensurePdfHistorialTable();
  await gestorQuery(
    `INSERT INTO pdf_historial (id, file_name, nombre, tipo, registros, usuario, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       file_name = VALUES(file_name),
       nombre = VALUES(nombre),
       tipo = VALUES(tipo),
       registros = VALUES(registros),
       usuario = VALUES(usuario)`,
    [
      row.id,
      row.fileName,
      row.nombre || 'documento.pdf',
      row.tipo || null,
      Number(row.registros || 0),
      row.usuario || 'SISTEMA',
      parseFechaMeta(row.fecha),
    ]
  );
  return { ok: true };
}

/**
 * @param {{ from?: string, to?: string, date?: string }} [filtro]
 * from/to/date en formato YYYY-MM-DD
 */
export async function listPdfMetaMysql(filtro = {}) {
  if (!isGestorMysqlReady()) return null;
  await ensurePdfHistorialTable();

  let from = String(filtro.from || '').trim().slice(0, 10);
  let to = String(filtro.to || '').trim().slice(0, 10);
  const date = String(filtro.date || '').trim().slice(0, 10);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    from = date;
    to = date;
  }
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) from = '';
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) to = from || '';

  const params = [];
  let where = '';
  if (from && to) {
    where = 'WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(from, to);
  } else if (from) {
    where = 'WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(from, from);
  }

  const rows = await gestorQuery(
    `SELECT id, file_name AS fileName, nombre, tipo, registros, usuario, created_at AS fecha
     FROM pdf_historial
     ${where}
     ORDER BY created_at DESC
     LIMIT 500`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    nombre: r.nombre,
    tipo: r.tipo || '—',
    registros: Number(r.registros || 0),
    usuario: r.usuario || 'SISTEMA',
    fecha:
      r.fecha instanceof Date
        ? r.fecha.toLocaleString('es-CO')
        : String(r.fecha || ''),
  }));
}

export async function findPdfMetaMysql(idParam) {
  if (!isGestorMysqlReady()) return null;
  const id = String(idParam || '').trim();
  if (!id) return null;
  await ensurePdfHistorialTable();
  const rows = await gestorQuery(
    `SELECT id, file_name AS fileName, nombre, tipo, registros, usuario, created_at AS fecha
     FROM pdf_historial
     WHERE id = ? OR file_name = ? OR file_name LIKE ?
     LIMIT 1`,
    [id, id, `${id}_%`]
  );
  return rows[0] || null;
}

/** Copia metadatos del JSON local a MySQL (idempotente por id). */
export async function migratePdfHistorialJsonToMysql(items) {
  if (!isGestorMysqlReady() || !items?.length) return { imported: 0 };
  await ensurePdfHistorialTable();
  let imported = 0;
  for (const it of items) {
    if (!it.id || !it.fileName) continue;
    try {
      await insertPdfMetaMysql(it);
      imported += 1;
    } catch (_) {
      /* ignore */
    }
  }
  return { imported };
}
