/* Debug log endpoint builder from explicit caller input */
(function (global) {
  global.getDebugLogEndpoint = function (port, ingestPath) {
    var location = global && global.location;
    var host = String((location && location.hostname) || '').trim();
    var protocol = String((location && location.protocol) || 'http:');
    var path = String(ingestPath || '').trim();
    port = Number(port);
    if (!host || !path || !Number.isFinite(port) || port <= 0) return '';
    return protocol + '//' + host + ':' + port + (path.charAt(0) === '/' ? path : '/' + path);
  };
})(window);
