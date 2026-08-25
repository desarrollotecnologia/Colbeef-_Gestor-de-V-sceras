/**
 * Fuentes TTF con acentos (á, é, í, ó, ú, ñ) para PDFKit.
 * Helvetica solo soporta WinAnsi y corrompe texto en español.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function exists(p) {
  try {
    return Boolean(p && fs.existsSync(p));
  } catch {
    return false;
  }
}

/** Busca Arial / Calibri en Windows o TTF locales en server/assets/fonts. */
export function resolvePdfFontPaths() {
  const win = os.platform() === 'win32' ? process.env.WINDIR || 'C:\\Windows' : null;
  const localDir = path.join(__dirname, '..', 'assets', 'fonts');

  const candidates = [
    {
      regular: path.join(localDir, 'DejaVuSans.ttf'),
      bold: path.join(localDir, 'DejaVuSans-Bold.ttf'),
    },
    {
      regular: path.join(localDir, 'NotoSans-Regular.ttf'),
      bold: path.join(localDir, 'NotoSans-Bold.ttf'),
    },
    win && {
      regular: path.join(win, 'Fonts', 'arial.ttf'),
      bold: path.join(win, 'Fonts', 'arialbd.ttf'),
    },
    win && {
      regular: path.join(win, 'Fonts', 'calibri.ttf'),
      bold: path.join(win, 'Fonts', 'calibrib.ttf'),
    },
    win && {
      regular: path.join(win, 'Fonts', 'segoeui.ttf'),
      bold: path.join(win, 'Fonts', 'segoeuib.ttf'),
    },
  ].filter(Boolean);

  for (const c of candidates) {
    if (exists(c.regular) && exists(c.bold)) return c;
    if (exists(c.regular)) return { regular: c.regular, bold: c.regular };
  }
  return null;
}

/**
 * Registra fuentes Unicode en el documento PDFKit.
 * @returns {{ regular: string, bold: string }}
 */
export function registerPdfFonts(doc) {
  const paths = resolvePdfFontPaths();
  if (!paths) {
    console.warn(
      '[pdf] No hay fuente TTF con acentos. Instale Arial en Windows o copie DejaVuSans en server/assets/fonts/'
    );
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  }
  try {
    doc.registerFont('Colbeef', paths.regular);
    doc.registerFont('Colbeef-Bold', paths.bold);
    return { regular: 'Colbeef', bold: 'Colbeef-Bold' };
  } catch (e) {
    console.warn('[pdf] No se pudo registrar fuente:', e.message);
    return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  }
}
