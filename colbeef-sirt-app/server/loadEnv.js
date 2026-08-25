/**
 * Carga .env antes que el resto de módulos (necesario con ESM).
 * Importar siempre primero en index.js: `import './loadEnv.js'`
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const roots = [
  path.join(here, '..', '.env'), // colbeef-sirt-app/.env
  path.join(process.cwd(), '.env'),
];

for (const envPath of roots) {
  dotenv.config({ path: envPath });
}
