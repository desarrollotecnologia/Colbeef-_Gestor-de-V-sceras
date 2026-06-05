(function (global) {
  var STORAGE_USER = 'colbeef_usuario';
  var STORAGE_SESSION = 'colbeef_session_id';

  function newSessionId() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function getUsuarioFromUrl() {
    try {
      return new URLSearchParams(global.location.search).get('usuario');
    } catch (_) {
      return null;
    }
  }

  function send(payload) {
    try {
      fetch('/api/usability/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (_) {}
  }

  var api = {
    usuario: '',
    sessionId: '',

    init: function (opts) {
      opts = opts || {};
      var fromUrl = getUsuarioFromUrl();
      if (fromUrl) {
        global.localStorage.setItem(STORAGE_USER, String(fromUrl).trim());
      }
      this.usuario =
        String(opts.usuario || global.localStorage.getItem(STORAGE_USER) || 'anonimo').trim() ||
        'anonimo';
      global.localStorage.setItem(STORAGE_USER, this.usuario);

      this.sessionId = global.sessionStorage.getItem(STORAGE_SESSION);
      if (!this.sessionId) {
        this.sessionId = newSessionId();
        global.sessionStorage.setItem(STORAGE_SESSION, this.sessionId);
      }

      this.track('session_start', opts.page || 'gestor', 'Inicio de sesión');
      this.patchNavigation();
      this.showUserBadge();
    },

    setUsuario: function (name) {
      this.usuario = String(name || '').trim() || 'anonimo';
      global.localStorage.setItem(STORAGE_USER, this.usuario);
    },

    track: function (action, module, detail, meta) {
      send({
        usuario: this.usuario,
        action: action || 'event',
        module: module || '',
        detail: detail || '',
        sessionId: this.sessionId,
        page: global.location.pathname.replace(/^\//, ''),
        meta: meta || {},
      });
    },

    showUserBadge: function () {
      var el = global.document.getElementById('usuarioBadge');
      if (!el) return;
      el.textContent = '👤 ' + this.usuario;
      el.style.display = 'inline-flex';
    },

    patchNavigation: function () {
      var map = {
        showDecomisos: 'decomisos',
        showDespachos: 'despachos',
        showInforme: 'informe',
        showHistorial: 'historial',
        showAnalytics: 'analytics',
        showCrudas: 'crudas',
        showPlanilla: 'planilla',
        showDashboard: 'dashboard',
        abrirModalOPL: 'opl',
      };
      Object.keys(map).forEach(function (fn) {
        var orig = global[fn];
        if (typeof orig !== 'function') return;
        global[fn] = function () {
          api.track('module_open', map[fn], fn);
          return orig.apply(this, arguments);
        };
      });
    },
  };

  global.ColbeefUsage = api;
})(window);
