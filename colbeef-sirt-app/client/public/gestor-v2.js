/**
 * Colbeef Gestor v2 — UI por flujo operativo (no por hojas Excel).
 */
(function () {
  var TURNO_POR_DIA = { 0: 'DxL', 1: 'LxM', 2: 'MxM', 3: 'MxJ', 4: 'JxV', 5: 'VxS', 6: 'SxD' };
  var TURNOS = ['DxL', 'LxM', 'MxM', 'MxJ', 'JxV', 'VxS', 'SxD'];
  var COLS_DESP = ['Cabeza', 'Patas y Manos', 'Visceras Blancas', 'Visceras Rojas'];
  var PREVIEW_MAX = 300;

  var state = {
    modo: 'consulta',
    turno: TURNO_POR_DIA[new Date().getDay()] || 'SxD',
    dashboard: null,
    stock: [],
    decomisosPeriodo: [],
    decomisosVinculados: [],
    despachos: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function fechaHoyISO() {
    var d = new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function fechaISOaTexto(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function leerFecha() {
    var el = $('fechaOperacion');
    var v = el && el.value;
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fechaHoyISO();
  }

  function leerFiltro() {
    return { date: leerFecha() };
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setStatus(msg, type) {
    var el = $('v2Status');
    if (!el) return;
    el.className = 'v2-status v2-status-' + (type || 'info');
    el.textContent = msg;
  }

  function setSpinner(on, text) {
    var el = $('v2Spinner');
    if (!el) return;
    el.hidden = !on;
    if (text) el.textContent = text;
  }

  function rpc(method, args) {
    return fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: method, args: args || [] }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data._error) throw new Error(data._error);
        return data;
      });
  }

  function actualizarReglasFecha() {
    var iso = leerFecha();
    var el = $('v2Reglas');
    if (!el) return;
    el.innerHTML =
      '<strong>Fecha de trabajo:</strong> ' +
      escapeHtml(fechaISOaTexto(iso)) +
      ' · <strong>En cava:</strong> stock a esa fecha · <strong>Decomisos:</strong> últimos 7 días hasta esa fecha · <strong>Despachos:</strong> salidas del día (turno <strong>' +
      escapeHtml(state.turno) +
      '</strong>)';
  }

  function initTurnos() {
    var box = $('v2TurnoChips');
    if (!box) return;
    box.innerHTML = TURNOS.map(function (t) {
      return (
        '<button type="button" class="v2-chip-turno' +
        (t === state.turno ? ' active' : '') +
        '" data-turno="' +
        t +
        '">' +
        t +
        '</button>'
      );
    }).join('');
    box.querySelectorAll('[data-turno]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.turno = btn.getAttribute('data-turno');
        initTurnos();
        actualizarReglasFecha();
        if ($('tab-despachos').classList.contains('active')) cargarDespachos();
      });
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.v2-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.v2-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + tabId);
    });
    if (tabId === 'stock') cargarStock();
    if (tabId === 'decomisos') cargarDecomisos();
    if (tabId === 'despachos') cargarDespachos();
    actualizarReglasFecha();
  }

  function renderTablero(data) {
    state.dashboard = data;
    if (!data || !data.success) {
      setStatus(data && data.message ? data.message : 'No se pudo cargar el tablero.', 'error');
      return;
    }

    var juegos = Number(data.totalSalidas || 0);
    var subprod = Number(data.filasEnCava != null ? data.filasEnCava : data.filasEstadoCavas || 0);
    var vinc = Number(
      data.totalDecomisosVinculadosCava != null ? data.totalDecomisosVinculadosCava : data.totalDecomisos || 0
    );
    var periodo = Number(data.totalDecomisosEnRango || 0);
    var pend = Number(data.totalJuegosDespachar || 0);
    var turno = data.turnoDespacho || state.turno;

    $('kpiCavaJuegos').textContent = juegos > 0 ? juegos : subprod > 0 ? '0' : '—';
    $('kpiCavaSub').textContent = subprod + ' subproductos en stock';
    $('kpiDecVinc').textContent = vinc > 0 ? vinc : periodo > 0 ? '0' : '—';
    $('kpiDecSub').textContent =
      periodo > 0 ? vinc + ' vinculados · ' + periodo + ' en período (7 d)' : 'Sin registros en período';
    $('kpiDesp').textContent = pend;
    $('kpiDespSub').textContent = turno ? 'Turno ' + turno : 'Seleccione turno en Despachos';

    var prog = Number(data.progreso || 0);
    $('v2ProgPct').textContent = prog + '%';
    $('v2ProgBar').style.width = prog + '%';
    var jtot = Number(data.juegosTotalesOperacion || Math.max(juegos, pend));
    var desp = Number(data.despachados != null ? data.despachados : Math.max(0, jtot - pend));
    $('v2ProgMeta').textContent =
      desp + ' despachados de ' + jtot + ' juegos · ' + pend + ' pendientes' +
      (data.consultaSIRT ? ' · Vista: consulta en vivo a SIRT' : ' · Vista: operación guardada en servidor');

    var opl = $('v2OplResumen');
    if (data.operacionOPLFinalizada && !data.consultaSIRT) {
      opl.innerHTML = '<span class="v2-ok">✅ Operación cerrada — todos los OPL al día</span>';
    } else if (data.oplPreviewMessage) {
      opl.innerHTML = '<span class="v2-warn">' + escapeHtml(data.oplPreviewMessage) + '</span>';
    } else if (data.progresoOPL && data.progresoOPL.length) {
      opl.innerHTML = data.progresoOPL
        .slice(0, 3)
        .map(function (p) {
          return (
            '<div class="v2-opl-line"><span>' +
            escapeHtml(p.opl) +
            '</span><span>' +
            p.progreso +
            '%</span></div>'
          );
        })
        .join('');
    } else {
      opl.innerHTML =
        '<span class="v2-muted">OPL: procese despachos del turno para ver avance (o abra módulos avanzados en versión clásica).</span>';
    }

    setStatus(
      'Tablero actualizado · ' +
        (data.consultaSIRT ? 'consulta SIRT' : 'sesión guardada') +
        ' · ' +
        new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      'ok'
    );
  }

  function cargarTablero() {
    var chain = state.modo === 'consulta' ? rpc('getDashboardData', [leerFiltro()]) : rpc('getDashboardData', []);
    return chain.then(renderTablero).catch(function (e) {
      setStatus('Error tablero: ' + e.message, 'error');
    });
  }

  function renderTabla(tbodyId, rows, cols, emptyMsg) {
    var tbody = $(tbodyId);
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="' + cols.length + '" class="v2-empty">' + escapeHtml(emptyMsg) + '</td></tr>';
      return;
    }
    var slice = rows.slice(0, PREVIEW_MAX);
    tbody.innerHTML = slice
      .map(function (r) {
        return '<tr>' + cols.map(function (c) { return '<td>' + escapeHtml(r[c.key]) + '</td>'; }).join('') + '</tr>';
      })
      .join('');
    if (rows.length > slice.length) {
      tbody.innerHTML +=
        '<tr><td colspan="' +
        cols.length +
        '" class="v2-empty">Mostrando ' +
        slice.length +
        ' de ' +
        rows.length +
        ' filas.</td></tr>';
    }
  }

  function cargarStock() {
    $('stockMeta').textContent = 'Cargando…';
    return rpc('consultarEnCavaDesdeSIRT', [leerFiltro()])
      .then(function (res) {
        if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Error');
        state.stock = res.filas || [];
        $('stockMeta').textContent =
          (res.modo === 'rango' ? 'Día ' + res.desde : 'Lookback ' + res.lookbackDias + ' d') +
          ' · ' +
          res.totalFilas +
          ' filas · ' +
          (res.totalJuegos || 0) +
          ' juegos viscerales';
        renderTabla(
          'stockTbody',
          state.stock.map(function (f) {
            return {
              ingreso: f.ingresoCava,
              codigo: f.codigo,
              sub: f.descripcion,
              prop: f.propietario,
              dest: f.destino,
              riel: f.riel,
            };
          }),
          [
            { key: 'ingreso' },
            { key: 'codigo' },
            { key: 'sub' },
            { key: 'prop' },
            { key: 'dest' },
            { key: 'riel' },
          ],
          'Sin productos en cava para esta fecha.'
        );
      })
      .catch(function (e) {
        $('stockMeta').textContent = e.message;
      });
  }

  function cargarDecomisos() {
    $('decMeta').textContent = 'Cargando…';
    var p1 = rpc('consultarDecomisosDesdeSIRT', [leerFiltro()]).then(function (res) {
      if (!res || !res.success) throw new Error(res && res.message ? res.message : 'Error período');
      state.decomisosPeriodo = res.filas || [];
      $('decPeriodoMeta').textContent =
        (res.desde || '') + ' → ' + (res.hasta || '') + ' · ' + (res.totalFilas || 0) + ' en período';
      renderTabla(
        'decPeriodoTbody',
        state.decomisosPeriodo.map(function (f) {
          return {
            fecha: f.fecha,
            codigo: f.codigo,
            prod: f.producto,
            puesto: f.puesto,
            causa: f.causa,
          };
        }),
        [{ key: 'fecha' }, { key: 'codigo' }, { key: 'prod' }, { key: 'puesto' }, { key: 'causa' }],
        'Sin decomisos en el período.'
      );
    });
    var p2 =
      state.modo === 'guardada'
        ? rpc('getResumenDecomisos', [])
        : rpc('consultarCruceDecomisosPreview', [leerFiltro()]);
    return Promise.all([p1, p2])
      .then(function (arr) {
        var cruce = arr[1];
        state.decomisosVinculados = (cruce && cruce.resultados) || [];
        $('decVincMeta').textContent =
          (cruce && cruce.totalProductos != null ? cruce.totalProductos : state.decomisosVinculados.length) +
          ' productos en cava con decomiso (cruce operativo)';
        renderTabla(
          'decVincTbody',
          state.decomisosVinculados.map(function (r, i) {
            return { n: i + 1, id: r.id, dest: r.destino, prod: r.producto };
          }),
          [{ key: 'n' }, { key: 'id' }, { key: 'dest' }, { key: 'prod' }],
          'Sin cruces con stock en cava. Revise que los códigos coincidan entre decomiso y cava.'
        );
        $('decMeta').textContent = 'Listo';
      })
      .catch(function (e) {
        $('decMeta').textContent = e.message;
      });
  }

  function renderDespachos(res) {
    state.despachos = res;
    var tbody = $('despTbody');
    if (!res || !res.success) {
      $('despMeta').textContent = res && res.message ? res.message : 'Error';
      tbody.innerHTML = '<tr><td colspan="6" class="v2-empty">No se pudo cargar despachos.</td></tr>';
      return;
    }
    if (res.turno) state.turno = res.turno;
    initTurnos();
    $('despMeta').textContent =
      'Turno ' + res.turno + ' · ' + res.totalPuestos + ' puestos · ' + res.totalJuegos + ' juegos a despachar';
    var datos = res.resultado || [];
    if (!datos.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="v2-empty">Sin despachos para este turno y fecha.</td></tr>';
      return;
    }
    tbody.innerHTML = datos
      .map(function (r) {
        var inc =
          COLS_DESP.some(function (c) {
            var vals = COLS_DESP.map(function (x) { return r[x] || 0; });
            return Math.min.apply(null, vals) !== Math.max.apply(null, vals);
          });
        return (
          '<tr' +
          (inc ? ' class="v2-row-warn"' : '') +
          '><td>' +
          escapeHtml(r.puesto) +
          (inc ? ' <small>incompleto</small>' : '') +
          '</td><td class="num">' +
          (r.Juegos || 0) +
          '</td>' +
          COLS_DESP.map(function (c) {
            return '<td class="num">' + (r[c] || 0) + '</td>';
          }).join('') +
          '</tr>'
        );
      })
      .join('');
  }

  function cargarDespachos() {
    $('despMeta').textContent = 'Cargando…';
    var method =
      state.modo === 'guardada' ? 'prepararModuloDespachosDesdeSIRT' : 'consultarDespachosPreview';
    return rpc(method, [state.turno, leerFiltro()])
      .then(renderDespachos)
      .catch(function (e) {
        $('despMeta').textContent = e.message;
      });
  }

  function actualizarOperacionDia() {
    setSpinner(true, 'Sincronizando día completo desde SIRT…');
    setStatus('Importando stock, decomisos y despachos…', 'info');
    return rpc('sincronizarSesionDesdeSirtPorFecha', [leerFiltro()])
      .then(function (res) {
        setSpinner(false);
        if (!res || !res.success) {
          setStatus(res && res.message ? res.message : 'Error al sincronizar', 'error');
          return;
        }
        state.modo = 'guardada';
        $('btnModoConsulta').classList.remove('active');
        $('btnModoGuardada').classList.add('active');
        if (res.turno) state.turno = res.turno;
        initTurnos();
        setStatus(
          'Operación del día guardada · Turno ' +
            (res.turno || state.turno) +
            (res.avisoDespachos ? ' · ' + res.avisoDespachos : ''),
          'ok'
        );
        return cargarTablero().then(function () {
          switchTab('tablero');
        });
      })
      .catch(function (e) {
        setSpinner(false);
        setStatus('Error: ' + e.message, 'error');
      });
  }

  function setModoConsulta() {
    state.modo = 'consulta';
    $('btnModoConsulta').classList.add('active');
    $('btnModoGuardada').classList.remove('active');
    cargarTablero();
  }

  function setModoGuardada() {
    state.modo = 'guardada';
    $('btnModoGuardada').classList.add('active');
    $('btnModoConsulta').classList.remove('active');
    cargarTablero();
  }

  function pollHealth() {
    fetch('/api/health')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var dot = $('v2ConnDot');
        if (dot) dot.className = 'v2-dot ' + (d && d.ok && d.db ? 'ok' : 'bad');
      })
      .catch(function () {
        var dot = $('v2ConnDot');
        if (dot) dot.className = 'v2-dot bad';
      });
  }

  function boot() {
    var df = $('fechaOperacion');
    if (df && !df.value) df.value = fechaHoyISO();
    df.addEventListener('change', function () {
      actualizarReglasFecha();
      cargarTablero();
      var active = document.querySelector('.v2-tab.active');
      if (active) switchTab(active.getAttribute('data-tab'));
    });
    $('btnActualizarDia').addEventListener('click', actualizarOperacionDia);
    $('btnRefrescar').addEventListener('click', function () {
      cargarTablero();
      var active = document.querySelector('.v2-tab.active');
      if (active) switchTab(active.getAttribute('data-tab'));
    });
    $('btnModoConsulta').addEventListener('click', setModoConsulta);
    $('btnModoGuardada').addEventListener('click', setModoGuardada);
    $('btnFechaHoy').addEventListener('click', function () {
      $('fechaOperacion').value = fechaHoyISO();
      $('fechaOperacion').dispatchEvent(new Event('change'));
    });
    document.querySelectorAll('.v2-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-tab'));
      });
    });
    initTurnos();
    actualizarReglasFecha();
    pollHealth();
    setInterval(pollHealth, 45000);
    rpc('initializeSheets', []).catch(function () {});
    cargarTablero();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
