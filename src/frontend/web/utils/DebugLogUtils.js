/* Debug log endpoint builder from explicit caller input */
(function (global) {
  function getDebugLogEndpoint(port, ingestPath) {
    if (!global || !global.location) return '';
    var host = String(global.location.hostname || '').trim();
    var protocol = String(global.location.protocol || 'http:');
    var normalizedPath = String(ingestPath || '').trim();
    var normalizedPort = Number(port);
    if (!host || !normalizedPath || !Number.isFinite(normalizedPort) || normalizedPort <= 0) return '';
    if (normalizedPath.charAt(0) !== '/') normalizedPath = '/' + normalizedPath;
    return protocol + '//' + host + ':' + normalizedPort + normalizedPath;
  }

  global.getDebugLogEndpoint = getDebugLogEndpoint;
})(window);
