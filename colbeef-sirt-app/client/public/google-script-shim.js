(function () {
  function createGoogleScriptRun() {
    var success = function () {};
    var failure = function (e) {
      console.error('RPC error:', e);
    };
    var proxy;
    var api = {
      withSuccessHandler: function (fn) {
        success = fn;
        return proxy;
      },
      withFailureHandler: function (fn) {
        failure = fn;
        return proxy;
      },
    };
    proxy = new Proxy(api, {
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
    return proxy;
  }

  var g = window.google || (window.google = {});
  var s = g.script || (g.script = {});
  Object.defineProperty(s, 'run', {
    configurable: true,
    enumerable: true,
    get: function () {
      return createGoogleScriptRun();
    },
  });
})();
