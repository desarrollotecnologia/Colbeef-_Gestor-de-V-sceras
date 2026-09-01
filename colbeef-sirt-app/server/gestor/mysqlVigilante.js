/**
 * Vigilante de la conexión MySQL del gestor.
 *
 * El arranque exige base de datos, pero MySQL puede caerse con la operación en
 * marcha. Ahí matar el proceso dejaría a la planta sin programa, así que el
 * gestor sigue sobre el JSON de respaldo y este vigilante reintenta. Al volver
 * la conexión sube lo trabajado mientras estuvo caída: sin esto la jornada se
 * queda solo en el archivo local hasta que alguien lo note.
 */
import {
  initGestorMysql,
  isGestorMysqlEnabled,
  isGestorMysqlReady,
} from '../gestorDb.js';
import { ensureGestorSchema } from './mysqlSchema.js';
import { volcarEstadoEnMemoriaAMysql } from './store.js';

let timer = null;

async function recuperarConexion() {
  const r = await initGestorMysql({ silencioso: true });
  if (!r.ok) return;

  console.log('[gestor-mysql] Conexión recuperada.');
  try {
    await ensureGestorSchema();
    const res = await volcarEstadoEnMemoriaAMysql();
    if (res.imported) {
      console.log(
        `[gestor-state] Estado en curso${res.dia ? ` (${res.dia})` : ''} subido a MySQL tras la reconexión.`
      );
    }
  } catch (e) {
    console.warn('[gestor-mysql] Reconectado, pero la puesta al día falló:', e.message);
  }
}

export function iniciarVigilanteMysql({ intervaloMs = 60000 } = {}) {
  if (!isGestorMysqlEnabled() || timer) return timer;

  timer = setInterval(() => {
    if (isGestorMysqlReady()) return;
    recuperarConexion().catch((e) => {
      console.warn('[gestor-mysql] Vigilante falló:', e.message);
    });
  }, Math.max(10000, intervaloMs));

  // No debe impedir que el proceso termine cuando toque.
  timer.unref?.();
  return timer;
}

export function detenerVigilanteMysql() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
