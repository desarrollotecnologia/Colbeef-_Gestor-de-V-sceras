#!/usr/bin/env node
/**
 * Prueba conexión MySQL del gestor y aplica el esquema.
 * Uso en el servidor 205:
 *   node scripts/mysql-init.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { initGestorMysql, closeGestorMysql, getGestorMysqlStatus, gestorQuery } =
  await import('../server/gestorDb.js');
const { ensureGestorSchema } = await import('../server/gestor/mysqlSchema.js');

const init = await initGestorMysql();
if (!init.ok) {
  console.error('Falló la conexión. Revise GESTOR_MYSQL_* en .env y que MySQL esté corriendo.');
  console.error(getGestorMysqlStatus());
  process.exit(1);
}

const schema = await ensureGestorSchema();
const tables = await gestorQuery('SHOW TABLES');
console.log('Tablas:', tables.map((r) => Object.values(r)[0]).join(', '));
console.log('Estado:', getGestorMysqlStatus());
console.log(schema.ok ? 'Listo.' : 'Esquema no aplicado.');
await closeGestorMysql();
process.exit(schema.ok ? 0 : 1);
