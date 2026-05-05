(function () {
  function createGoogleScriptRun() {
    var success = function () {};
    var failure = function (e) {
      console.error('RPC error:', e);
    };
    var api = {
      withSuccessHandler: function (fn) {
        success = fn;
        return api;
      },
      withFailureHandler: function (fn) {
        failure = fn;
        return api;
      },
    };
    return new Proxy(api, {
      get: function (target, prop) {
        if (prop === 'withSuccessHandler' || prop === 'withFailureHandler') {
          return target[prop];
        }
        if (typeof prop === 'symbol') return target[prop];
        return function rpcMethod() {
          var args = Array.prototype.slice.call(arguments);
          fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: String(prop), args: args }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (data) {
              if (data && data._error) failure(new Error(data._error));
              else success(data);
            })
            .catch(function (e) {
              failure(e);
            });
        };
      },
    });
  }
  window.google = {
    script: {
      get run() {
        return createGoogleScriptRun();
      },
    },
  };
})();
