import { PUESTOS_TEMPRANAS } from '../server/gestor/constants.js';

const SET = new Set(
  PUESTOS_TEMPRANAS.map((p) => {
    const u = String(p).trim().toUpperCase();
    return /^\d+$/.test(u) ? String(parseInt(u, 10)) : u;
  })
);

function codigoCandidatoTemprana(texto) {
  const raw = String(texto || '').trim();
  if (!raw) return '';
  const first = raw.split('/')[0].trim().toUpperCase();
  if (/^\d+$/.test(first)) return String(parseInt(first, 10));
  return first;
}

function esIndicacionTemprana(...textos) {
  return textos.some((t) => {
    const cod = codigoCandidatoTemprana(t);
    if (cod && SET.has(cod)) return true;
    const u = String(t || '').trim().toUpperCase();
    if (!u) return false;
    return PUESTOS_TEMPRANAS.some((p) => {
      const code = codigoCandidatoTemprana(p);
      if (!code) return false;
      return new RegExp(`(^|/)${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`, 'i').test(u);
    });
  });
}

function esPuestoTemprana(sucursalOrPuesto, puestoFull = '') {
  const suc = String(sucursalOrPuesto || '').trim();
  const pk = suc.includes('|') ? suc.split('|')[0] : suc;
  return esIndicacionTemprana(pk, puestoFull);
}

const cases = [
  ['NSF/SAN FRANCISCO/DxL', true],
  ['6505/PROVENZA/MxM', true],
  ['ARIR/LAGOS', true],
  ['LHMV/CENTRO', true],
  ['WMERCAN/NORTE', true],
  ['01305/TEMP1/DxL', false],
  ['SAN FRANCISCO', false],
  ['TEMP1 TEMPRANA 1', false],
  ['PROVENZA', false],
  ['NSF', true],
  ['6505', true],
];

let fail = 0;
for (const [input, expected] of cases) {
  const got = esIndicacionTemprana(input);
  const ok = got === expected;
  if (!ok) fail++;
  console.log(ok ? 'OK' : 'FAIL', input, 'expected', expected, 'got', got);
}

// Solo puesto, no zona
if (esPuestoTemprana('6505', '6505|PROVENZA') !== true) {
  fail++;
  console.log('FAIL esPuestoTemprana 6505');
} else {
  console.log('OK esPuestoTemprana 6505');
}
if (esPuestoTemprana('PROVENZA', '02012|PROVENZA') !== false) {
  fail++;
  console.log('FAIL esPuestoTemprana PROVENZA zona');
} else {
  console.log('OK esPuestoTemprana no marca zona');
}
process.exit(fail ? 1 : 0);
