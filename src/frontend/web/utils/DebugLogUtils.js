/* Debug log endpoint resolver for desktop/mobile runs */
(function (global) {
  var INGEST_PATH = '/ingest/5904e893-8fba-4499-8669-e2e4464b3ad7';
  var LOCAL_ENDPOINT = 'http://127.0.0.1:7889' + INGEST_PATH;
  var PROXY_PORT = '7890';
  var STORAGE_KEY = 'finsim.debugLogEndpoint';
  var QUERY_KEY = 'debugLogEndpoint';

  function _isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
  }

  function getDebugLogEndpoint() {
    if (!global || !global.location) {
      return LOCAL_ENDPOINT;
    }

    var queryOverride = new URLSearchParams(global.location.search).get(QUERY_KEY);
    if (queryOverride) {
      return queryOverride;
    }

    if (global.localStorage) {
      var storedOverride = global.localStorage.getItem(STORAGE_KEY);
      if (storedOverride) {
        return storedOverride;
      }
    }

    if (global.__FINSIM_DEBUG_LOG_ENDPOINT) {
      return String(global.__FINSIM_DEBUG_LOG_ENDPOINT);
    }

    var host = global.location.hostname || '';
    if (_isLocalHost(host)) {
      return LOCAL_ENDPOINT;
    }

    return 'http://' + host + ':' + PROXY_PORT + INGEST_PATH;
  }

  function setDebugLogEndpoint(endpoint) {
    global.localStorage.setItem(STORAGE_KEY, endpoint);
  }

  function clearDebugLogEndpoint() {
    global.localStorage.removeItem(STORAGE_KEY);
  }

  global.getDebugLogEndpoint = getDebugLogEndpoint;
  global.setDebugLogEndpoint = setDebugLogEndpoint;
  global.clearDebugLogEndpoint = clearDebugLogEndpoint;
})(window);
