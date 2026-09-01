/**
 * Sonda de arranque: sale con código 0 si MySQL acepta consultas.
 *
 * Comprueba con las credenciales y el driver reales del gestor, no con un
 * simple test de puerto: al encender, el 3306 puede estar en escucha mientras
 * MySQL todavía no autentica.
 *
 * Silenciosa a propósito, porque el arranque la ejecuta en bucle.
 */
const SERVER = new URL('../server/', import.meta.url).href;
await import(SERVER + 'loadEnv.js');
const db = await import(SERVER + 'gestorDb.js');

const r = await db.initGestorMysql({ silencioso: true });

// Con GESTOR_MYSQL_ENABLED=false no hay nada que esperar.
if (r.skipped) process.exit(0);

if (!r.ok) {
  console.log('sonda: ' + (r.error || 'sin conexión'));
  process.exit(1);
}

try {
  await db.gestorQuery('SELECT 1 AS ok', []);
} catch (e) {
  console.log('sonda: ' + e.message);
  process.exit(1);
}

await db.closeGestorMysql();
process.exit(0);
