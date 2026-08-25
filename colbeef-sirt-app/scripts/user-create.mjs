#!/usr/bin/env node
/**
 * Crea o actualiza un usuario del gestor en MySQL.
 *
 *   node scripts/user-create.mjs --user=jperez --pass=secreto123 --rol=operador
 *   node scripts/user-create.mjs --user=admin --pass=AdminSeguro1 --rol=admin
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function arg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : '';
}

const usuario = arg('user') || arg('usuario');
const password = arg('pass') || arg('password');
const rol = arg('rol') || 'operador';

if (!usuario || !password) {
  console.error('Uso: node scripts/user-create.mjs --user=NOMBRE --pass=CLAVE [--rol=operador|supervisor|admin]');
  process.exit(1);
}

const { initGestorMysql, closeGestorMysql } = await import('../server/gestorDb.js');
const { ensureGestorSchema } = await import('../server/gestor/mysqlSchema.js');
const { ensureAuthSessionsTable, hashPassword, createUser } = await import(
  '../server/gestor/authStore.js'
);
const { gestorQuery } = await import('../server/gestorDb.js');

const init = await initGestorMysql();
if (!init.ok) {
  console.error('No hay conexión MySQL. Revise GESTOR_MYSQL_* en .env');
  process.exit(1);
}
await ensureGestorSchema();
await ensureAuthSessionsTable();

const existing = await gestorQuery('SELECT id FROM usuarios WHERE nombre = ? LIMIT 1', [usuario]);
if (existing.length) {
  await gestorQuery(
    `UPDATE usuarios SET password_hash = ?, rol = ?, activo = 1 WHERE nombre = ?`,
    [hashPassword(password), ['operador', 'supervisor', 'admin'].includes(rol) ? rol : 'operador', usuario]
  );
  console.log(`Usuario actualizado: ${usuario} (${rol})`);
} else {
  await createUser({ nombre: usuario, password, rol });
  console.log(`Usuario creado: ${usuario} (${rol})`);
}

await closeGestorMysql();
