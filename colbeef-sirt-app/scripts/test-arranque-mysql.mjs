/**
 * Comprueba las dos garantías del arranque:
 *   1. El gestor espera a MySQL en vez de rendirse en el primer intento.
 *   2. Nunca sirve la jornada de otro día.
 *
 * No toca la base de datos real: apunta a un puerto muerto y usa estados
 * sintéticos. Ejecutar con: node scripts/test-arranque-mysql.mjs
 */

// Antes de importar: cfg se lee al cargar el módulo y dotenv no sobreescribe
// lo que ya está en el entorno.
process.env.GESTOR_MYSQL_HOST = '127.0.0.1';
process.env.GESTOR_MYSQL_PORT = '3399';
process.env.GESTOR_MYSQL_ENABLED = 'true';

const { initGestorMysqlConEspera, isGestorMysqlReady } = await import('../server/gestorDb.js');
const { descartarJornadaDeOtroDia, defaultState } = await import('../server/gestor/store.js');

let fallos = 0;
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    console.log(`  OK   ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${nombre}${detalle ? ' → ' + detalle : ''}`);
  }
}

function estadoDeJornada(dia) {
  const s = defaultState();
  s.diaGuardado = dia;
  s.lastSyncRange = { from: dia, to: dia };
  s.oplBaselineFecha = dia;
  s.oplBaselineTurno = 'MxM';
  s.oplBaselineBuild = 'build-x';
  s.despachosCavas = [['fila'], ['fila']];
  s.consolidado = [{ puesto: '6505' }];
  s.resumenDespachos = { turno: 'MxM', fechaStr: dia, totalJuegos: 400, resultado: [{}] };
  s.oplTotalsJuego = { 'CAVA WO': 40 };
  s.oplTotalsJuegoCompleto = { 'CAVA WO': 38 };
  s.oplProgreso = [{ opl: 'CAVA WO' }];
  s.informe = { algo: true };
  s.fechaInicioOperacion = dia;
  // Configuración e histórico: deben sobrevivir al cambio de día.
  s.oplConfig = [{ propietario: 'CAVA WO', opl: 'OPL 1', total: 40 }];
  s.plazasMap = { 6505: 'ZONA X' };
  s.historicoOpl = [{ fecha: dia }];
  s.historialPdf = [{ id: 'pdf-1' }];
  return s;
}

console.log('=== 1) guarda de día: jornada de ayer ===');
{
  const s = estadoDeJornada('2026-08-31');
  const r = descartarJornadaDeOtroDia(s, '2026-09-01');
  comprobar('informa del descarte', r && r.descartado === '2026-08-31', JSON.stringify(r));
  comprobar('borra la programación', s.despachosCavas.length === 0);
  comprobar('borra el consolidado', s.consolidado.length === 0);
  comprobar('borra el resumen', (s.resumenDespachos.resultado || []).length === 0);
  comprobar('borra la meta congelada', Object.keys(s.oplTotalsJuegoCompleto).length === 0);
  comprobar('borra el progreso OPL', s.oplProgreso.length === 0);
  comprobar('borra el informe', s.informe === null);
  comprobar('borra la fecha guardada', s.lastSyncRange === undefined);
  comprobar('reinicia los baselines', s.oplBaselineFecha === '' && s.oplBaselineTurno === '');
  comprobar('pone los totales OPL a cero', s.oplConfig[0].total === 0);
  comprobar('conserva los OPL configurados', s.oplConfig.length === 1);
  comprobar('conserva las plazas', Object.keys(s.plazasMap).length === 1);
  comprobar('conserva el histórico', s.historicoOpl.length === 1);
  comprobar('conserva el historial de PDF', s.historialPdf.length === 1);
}

console.log('');
console.log('=== 2) guarda de día: misma jornada (reinicio a media operación) ===');
{
  const s = estadoDeJornada('2026-09-01');
  const r = descartarJornadaDeOtroDia(s, '2026-09-01');
  comprobar('no descarta nada', r === null);
  comprobar('mantiene la programación', s.despachosCavas.length === 2);
  comprobar('mantiene la meta congelada', s.oplTotalsJuegoCompleto['CAVA WO'] === 38);
  comprobar('mantiene los totales OPL', s.oplConfig[0].total === 40);
  comprobar('mantiene la fecha guardada', s.lastSyncRange.from === '2026-09-01');
}

console.log('');
console.log('=== 3) guarda de día: consultar un día pasado NO borra la jornada de hoy ===');
{
  // El operador revisa la planilla de ayer: lastSyncRange queda en ayer, pero
  // el estado se sigue guardando hoy. Borrar aquí costaría la operación en curso.
  const s = estadoDeJornada('2026-09-01');
  s.lastSyncRange = { from: '2026-08-25', to: '2026-08-25' };
  const r = descartarJornadaDeOtroDia(s, '2026-09-01');
  comprobar('no descarta nada', r === null, JSON.stringify(r));
  comprobar('mantiene la programación de hoy', s.despachosCavas.length === 2);
  comprobar('mantiene la meta congelada', s.oplTotalsJuegoCompleto['CAVA WO'] === 38);
}

console.log('');
console.log('=== 4) guarda de día: estados sin marca de día ===');
{
  const s = defaultState();
  comprobar('no toca un estado vacío', descartarJornadaDeOtroDia(s, '2026-09-01') === null);

  // Estado anterior a diaGuardado: se aproxima con la última sincronización.
  const viejo = defaultState();
  viejo.lastSyncRange = { from: '2026-08-31', to: '2026-08-31' };
  const r1 = descartarJornadaDeOtroDia(viejo, '2026-09-01');
  comprobar('cae a lastSyncRange si no hay diaGuardado', r1 && r1.descartado === '2026-08-31');

  const soloBaseline = defaultState();
  soloBaseline.oplBaselineFecha = '2026-08-30';
  const r2 = descartarJornadaDeOtroDia(soloBaseline, '2026-09-01');
  comprobar('cae a oplBaselineFecha como último recurso', r2 && r2.descartado === '2026-08-30');
}

console.log('');
console.log('=== 5) espera de MySQL contra un puerto muerto (ventana 12s) ===');
{
  const t0 = Date.now();
  const r = await initGestorMysqlConEspera({ ventanaMs: 12000, esperaMs: 4000 });
  const seg = (Date.now() - t0) / 1000;
  console.log(`  duracion: ${seg.toFixed(1)}s | intentos: ${r.intentos}`);
  comprobar('reintenta mas de una vez', r.intentos >= 2, `intentos=${r.intentos}`);
  comprobar('respeta la ventana', seg >= 11 && seg <= 30, `${seg.toFixed(1)}s`);
  comprobar('informa que se agoto', r.agotado === true);
  comprobar('no queda listo', isGestorMysqlReady() === false);
}

console.log('');
if (fallos) {
  console.log(`RESULTADO: ${fallos} comprobacion(es) fallidas`);
  process.exit(1);
}
console.log('RESULTADO: todo OK');
process.exit(0);
