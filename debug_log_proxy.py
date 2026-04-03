#!/usr/bin/env python3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

opt = lambda name, default: sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
HOST = opt("--host", "0.0.0.0")
PORT = int(opt("--port", "7890"))
TARGET = opt("--target-base", "http://127.0.0.1:7889").rstrip("/")
ThreadingHTTPServer.allow_reuse_address = ThreadingHTTPServer.daemon_threads = True

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, type="application/json"):
        self.send_response(status)
        for key, value in (("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Methods", "POST, OPTIONS"), ("Access-Control-Allow-Headers", "Content-Type, X-Debug-Session-Id"), ("Content-Type", type)): self.send_header(key, value)
        self.end_headers()

    def do_OPTIONS(self): self.reply(204)

    def do_POST(self):
        try:
            headers = {"Content-Type": self.headers.get("Content-Type", "application/json")}
            session = self.headers.get("X-Debug-Session-Id")
            if session: headers["X-Debug-Session-Id"] = session
            try: response = urlopen(Request(TARGET + self.path, self.rfile.read(int(self.headers.get("Content-Length", 0))), headers, method="POST"), timeout=10)
            except HTTPError as error: response = error
            data = response.read()
            self.reply(getattr(response, "status", 0) or response.code, response.headers.get("Content-Type", "application/json"))
            if data: self.wfile.write(data)
        except Exception as error:
            self.reply(500, "text/plain")
            self.wfile.write(str(error).encode())

ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
