#!/usr/bin/env node
/**
 * Contrato del conteo de beneficio (sin BD): animales únicos + fecha Bogotá.
 * node scripts/test-beneficio-sql.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../server/gestor/sirtSync.js'), 'utf8');

assert.match(src, /COUNT\s*\(\s*DISTINCT\s+NULLIF\s*\(\s*TRIM\s*\(\s*pfp\.id_producto/i);
assert.match(src, /America\/Bogota/);
assert.doesNotMatch(
  src,
  /Animales beneficiados del día — plan de faena \(cabecera \+ detalle producto\)\.\s*\n \* Equivale a: COUNT\(\*\)/
);
assert.ok(src.includes('fetchAnimalesBeneficiadosDiaDetalle'));

console.log('test-beneficio-sql: ok');
