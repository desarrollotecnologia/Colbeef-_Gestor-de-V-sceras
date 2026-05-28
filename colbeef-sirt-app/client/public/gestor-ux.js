/**
 * Mejoras de experiencia de usuario — Gestor Colbeef
 */
(function () {
  var LS_FECHA = 'colbeef_gestor_fecha';
  var LS_VISTA = 'colbeef_gestor_vista';
  var LS_VIEW = 'colbeef_gestor_modulo';
  var HEALTH_MS = 45000;

  window._uxPreviewCache = window._uxPreviewCache || {};

  function isoAddDays(iso, n) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function friendlyError(msg) {
    var s = String(msg || '');
    if (/ECONNREFUSED|Failed to fetch|NetworkError/i.test(s)) {
      return 'No se pudo conectar con el servidor. Verifique que la aplicación esté en ejecución.';
    }
    if (/RPC|\/api\/rpc/i.test(s)) {
      return 'Error de comunicación con el servidor. Recargue la página o contacte soporte.';
    }
    if (/id_producto|PostgreSQL|SELECT/i.test(s)) {
      return 'No se pudieron leer los datos de la base. Revise la fecha o intente de nuevo.';
    }
    return s || 'Ocurrió un error inesperado.';
  }

  window.uxFriendlyError = friendlyError;

  function updateVistaBadge() {
    var el = document.getElementById('uxVistaBadge');
    if (!el || typeof state === 'undefined') return;
    var sirt = state.dashboardVista === 'sirt';
    el.className = 'ux-vista-badge ' + (sirt ? 'ux-vista-sirt' : 'ux-vista-sesion');
    el.textContent = sirt ? '● Consultando SIRT en vivo' : '● Vista sesión guardada';
    el.title = sirt
      ? 'Lee la base de datos según la fecha del encabezado.'
      : 'Muestra la última operación guardada en este servidor (no consulta SIRT al cambiar fecha).';
    var bS = document.getElementById('btnVistaSirt');
    var bE = document.getElementById('btnVistaSesion');
    if (bS) bS.setAttribute('aria-pressed', sirt ? 'true' : 'false');
    if (bE) bE.setAttribute('aria-pressed', sirt ? 'false' : 'true');
  }

  function updateFechaChips() {
    var box = document.getElementById('uxFechaChips');
    if (!box || typeof getFechaGlobalISO !== 'function') return;
    var iso = getFechaGlobalISO();
    var txt = typeof fechaISOaTexto === 'function' ? fechaISOaTexto(iso) : iso;
    var d7 = isoAddDays(iso, -7);
    box.innerHTML =
      '<span class="ux-chip" title="Productos aún en cava">📦 En cava: día ' +
      txt +
      '</span>' +
      '<span class="ux-chip" title="Salidas registradas en cava">📤 Salidas: día ' +
      txt +
      '</span>' +
      '<span class="ux-chip ux-chip-warn" title="Calculado automáticamente">🏷️ Decomisos: ' +
      (typeof fechaISOaTexto === 'function' ? fechaISOaTexto(d7) : d7) +
      ' → ' +
      txt +
      ' (7 días auto)</span>';
  }

  function setConnectionStatus(ok, label, detail) {
    var dot = document.getElementById('uxConnDot');
    var lbl = document.getElementById('uxConnLabel');
    if (!dot || !lbl) return;
    dot.className = 'ux-conn-dot ' + (ok ? 'ux-conn-ok' : 'ux-conn-bad');
    lbl.textContent = label || (ok ? 'SIRT conectado' : 'Sin conexión');
    lbl.title = detail || '';
  }

  function pollHealth() {
    fetch('/api/health', { method: 'GET' })
      .then(function (r) {
        return r.json().then(function (d) {
          return { httpOk: r.ok, data: d };
        });
      })
      .then(function (res) {
        var d = res.data;
        if (d && d.ok && d.db) {
          setConnectionStatus(true, 'SIRT conectado', 'Base de datos OK');
          return;
        }
        if (d && d.ok && !d.db) {
          setConnectionStatus(false, 'BD sin conexión', d.message || 'No se pudo leer PostgreSQL');
          return;
        }
        setConnectionStatus(
          false,
          'BD sin conexión',
          (d && d.message) || 'Revise POSTGRES_* en .env y que el servidor SIRT esté accesible'
        );
      })
      .catch(function (e) {
        setConnectionStatus(
          false,
          'Servidor apagado',
          'Inicie la aplicación (start.bat) en el PC ' +
            (window.location.hostname || 'del servidor') +
            '. ' +
            String(e.message || e)
        );
      });
  }

  window.uxPollHealth = pollHealth;

  var _shareUrl = '';

  function pickShareUrl(info) {
    if (!info) return '';
    if (info.recommended) return info.recommended;
    var loc = window.location;
    if (loc.hostname && loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1') {
      return loc.origin + (info.gestorPath || '/gestor.html');
    }
    if (info.lan && info.lan.length) {
      return info.mode === 'production' ? info.lan[0].gestorProd : info.lan[0].gestorDev;
    }
    return info.localhost
      ? info.mode === 'production'
        ? info.localhost.gestorProd
        : info.localhost.gestorDev
      : '';
  }

  function updateShareLink(info) {
    var wrap = document.getElementById('uxShareWrap');
    var urlEl = document.getElementById('uxShareUrl');
    var btn = document.getElementById('uxShareCopy');
    _shareUrl = pickShareUrl(info);
    if (!wrap || !_shareUrl) return;
    wrap.hidden = false;
    if (urlEl) {
      urlEl.textContent = _shareUrl;
      urlEl.title = _shareUrl;
    }
    if (btn && !btn._uxBound) {
      btn._uxBound = true;
      btn.addEventListener('click', function () {
        var url = _shareUrl;
        function done(ok) {
          if (typeof showAlert === 'function') {
            showAlert(
              'decAlert',
              ok ? 'ok' : 'warn',
              ok ? 'Enlace copiado. Compártalo en la misma red Wi‑Fi/LAN.' : 'Enlace: ' + url,
              ok ? {} : { persistent: true }
            );
          }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(url)
            .then(function () {
              done(true);
            })
            .catch(function () {
              done(false);
            });
        } else {
          done(false);
        }
      });
    }
  }

  function pollShareInfo() {
    fetch('/api/info', { method: 'GET' })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.success) updateShareLink(d);
      })
      .catch(function () {});
  }

  window.uxPollShareInfo = pollShareInfo;

  function showInlineLoader(show, text) {
    var el = document.getElementById('uxInlineLoader');
    if (!el) return;
    if (show) {
      el.classList.add('show');
      el.textContent = text || 'Cargando…';
    } else {
      el.classList.remove('show');
    }
  }

  var _spinDepth = 0;
  var _origShowSpinner = typeof showSpinner === 'function' ? showSpinner : null;
  var _origHideSpinner = typeof hideSpinner === 'function' ? hideSpinner : null;

  window.showSpinner = function (text, opts) {
    opts = opts || {};
    if (opts.light) {
      showInlineLoader(true, text);
      return;
    }
    _spinDepth++;
    if (_origShowSpinner) _origShowSpinner(text);
  };

  window.hideSpinner = function (opts) {
    opts = opts || {};
    if (opts.light) {
      showInlineLoader(false);
      return;
    }
    _spinDepth = Math.max(0, _spinDepth - 1);
    if (_spinDepth === 0) {
      showInlineLoader(false);
      if (_origHideSpinner) _origHideSpinner();
    }
  };

  var _origShowAlert = typeof showAlert === 'function' ? showAlert : null;

  window.showAlert = function (id, type, msg, opts) {
    opts = opts || {};
    var friendly = friendlyError(
      String(msg || '')
        .replace(/<[^>]+>/g, ' ')
        .trim()
    );
    var body = opts.rawHtml ? String(msg || '') : escapeHtml(friendly);
    if (opts.technical && opts.technical !== friendly) {
      body +=
        ' <button type="button" class="ux-tech-toggle" onclick="this.nextElementSibling.classList.toggle(\'show\')">Ver detalle técnico</button>' +
        '<pre class="ux-tech-detail">' +
        escapeHtml(String(opts.technical)) +
        '</pre>';
    }
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'alert alert-' + type + ' show';
    if (type === 'error' || type === 'warn' || opts.persistent) {
      body =
        body +
        ' <button type="button" class="ux-alert-close" onclick="hideAlert(\'' +
        id +
        '\')" aria-label="Cerrar">✕</button>';
    }
    el.innerHTML = body;
    if (type !== 'error' && type !== 'warn' && !opts.persistent) {
      setTimeout(function () {
        el.classList.remove('show');
      }, opts.timeout || 8000);
    }
  };

  window.exportRowsToCsv = function (filename, headers, rows) {
    if (!rows || !rows.length) {
      if (typeof showAlert === 'function') showAlert('decAlert', 'warn', 'No hay filas para exportar.', { persistent: true });
      return;
    }
    var lines = [headers.join(';')];
    rows.forEach(function (r) {
      lines.push(
        r
          .map(function (c) {
            var v = String(c ?? '').replace(/"/g, '""');
            return '"' + v + '"';
          })
          .join(';')
      );
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window.uxFilterTable = function (tbodyId, query, cellIndexes) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return 0;
    var q = String(query || '')
      .trim()
      .toLowerCase();
    var shown = 0;
    tbody.querySelectorAll('tr').forEach(function (tr) {
      if (tr.querySelector('.empty-state')) return;
      var text = '';
      (cellIndexes || [0, 1, 2, 3, 4, 5]).forEach(function (i) {
        var td = tr.cells[i];
        if (td) text += ' ' + td.textContent;
      });
      var match = !q || text.toLowerCase().indexOf(q) >= 0;
      tr.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    return shown;
  };

  window.usarTurnoHoy = function () {
    if (typeof TURNO_POR_DIA === 'undefined' || typeof seleccionarTurno !== 'function') return;
    var t = TURNO_POR_DIA[new Date().getDay()] || 'SxD';
    seleccionarTurno(t);
    document.querySelectorAll('.turno-btn').forEach(function (btn) {
      btn.classList.toggle('sugerido', btn.dataset.turno === t);
    });
  };

  function savePrefs() {
    try {
      var df = document.getElementById('fechaGlobal');
      if (df && df.value) localStorage.setItem(LS_FECHA, df.value);
      if (typeof state !== 'undefined') localStorage.setItem(LS_VISTA, state.dashboardVista || 'sirt');
    } catch (e) {}
  }

  function loadPrefs() {
    try {
      var f = localStorage.getItem(LS_FECHA);
      var df = document.getElementById('fechaGlobal');
      if (f && df && /^\d{4}-\d{2}-\d{2}$/.test(f)) df.value = f;
      var v = localStorage.getItem(LS_VISTA);
      if (v === 'sesion' && typeof setDashboardVistaSesion === 'function') setDashboardVistaSesion();
    } catch (e) {}
  }

  function restoreLastView() {
    try {
      var v = localStorage.getItem(LS_VIEW);
      var map = {
        decomisos: showDecomisos,
        despachos: showDespachos,
        informe: showInforme,
        historial: showHistorial,
        analytics: showAnalytics,
        crudas: showCrudas,
        planilla: showPlanilla,
      };
      if (v && map[v]) setTimeout(map[v], 300);
    } catch (e) {}
  }

  function patchNavigation() {
    var views = [
      ['showDecomisos', 'decomisos'],
      ['showDespachos', 'despachos'],
      ['showInforme', 'informe'],
      ['showHistorial', 'historial'],
      ['showAnalytics', 'analytics'],
      ['showCrudas', 'crudas'],
      ['showPlanilla', 'planilla'],
      ['showDashboard', 'dashboard'],
    ];
    views.forEach(function (pair) {
      var name = pair[0];
      var key = pair[1];
      var orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = function () {
        try {
          localStorage.setItem(LS_VIEW, key);
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
  }

  function patchVistaHandlers() {
    if (typeof setDashboardVistaSirt === 'function') {
      var o1 = setDashboardVistaSirt;
      window.setDashboardVistaSirt = function () {
        o1.apply(this, arguments);
        updateVistaBadge();
        savePrefs();
      };
    }
    if (typeof setDashboardVistaSesion === 'function') {
      var o2 = setDashboardVistaSesion;
      window.setDashboardVistaSesion = function () {
        o2.apply(this, arguments);
        updateVistaBadge();
        savePrefs();
      };
    }
    if (typeof syncFechaGlobalAModulos === 'function') {
      var o3 = syncFechaGlobalAModulos;
      window.syncFechaGlobalAModulos = function () {
        o3.apply(this, arguments);
        updateVistaBadge();
        updateFechaChips();
        savePrefs();
      };
    }
    if (typeof onDashboardFechaChange === 'function') {
      var o4 = onDashboardFechaChange;
      window.onDashboardFechaChange = function () {
        o4.apply(this, arguments);
        savePrefs();
      };
    }
  }

  function patchFailureHandlers() {
    if (typeof google === 'undefined' || !google.script) return;
    // Shim already handles errors; wrap global failure messages in procesar flows via showAlert patches in HTML handlers
  }

  function setupKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      ['modalDetalle', 'modalOPL', 'modalPlazas'].forEach(function (id) {
        var m = document.getElementById(id);
        if (m && m.classList.contains('show')) {
          m.classList.remove('show');
        }
      });
    });
  }

  function initModalsA11y() {
    document.querySelectorAll('.modal-close').forEach(function (btn) {
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Cerrar ventana');
    });
  }

  function boot() {
    loadPrefs();
    patchNavigation();
    patchVistaHandlers();
    updateVistaBadge();
    updateFechaChips();
    pollHealth();
    pollShareInfo();
    setInterval(pollHealth, HEALTH_MS);
    setupKeyboard();
    initModalsA11y();
    restoreLastView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }

  var _onload = window.onload;
  window.onload = function (e) {
    if (typeof _onload === 'function') _onload(e);
    updateVistaBadge();
    updateFechaChips();
    savePrefs();
  };
})();
