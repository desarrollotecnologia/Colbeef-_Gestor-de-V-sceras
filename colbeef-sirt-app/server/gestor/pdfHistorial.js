import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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

export async function leerPdfHistorial(fileName) {
  return fs.readFile(path.join(PDF_HISTORIAL_DIR, fileName));
}

export function urlAbrirPdfHistorial(id) {
  return `/api/historial/pdf/${encodeURIComponent(id)}`;
}
