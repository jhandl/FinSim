#!/usr/bin/env python3
"""Expose FinSim debug ingest on LAN and forward to local Cursor endpoint."""

import argparse
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CLIENT_DISCONNECT_ERRORS = (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)


def _cors(handler):
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-Debug-Session-Id")


def _make_handler(target_base):
    class ProxyHandler(BaseHTTPRequestHandler):
        def handle(self):
            try:
                super().handle()
            except CLIENT_DISCONNECT_ERRORS:
                return

        def do_OPTIONS(self):
            self.send_response(204)
            _cors(self)
            try:
                self.end_headers()
            except CLIENT_DISCONNECT_ERRORS:
                return

        def do_POST(self):
            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(content_length) if content_length > 0 else b""
            except CLIENT_DISCONNECT_ERRORS:
                return
            target_url = target_base.rstrip("/") + self.path

            forward_headers = {
                "Content-Type": self.headers.get("Content-Type", "application/json"),
            }
            session_id = self.headers.get("X-Debug-Session-Id")
            if session_id:
                forward_headers["X-Debug-Session-Id"] = session_id

            req = Request(target_url, data=body, headers=forward_headers, method="POST")

            try:
                with urlopen(req, timeout=10) as response:
                    data = response.read()
                    self.send_response(response.status)
                    _cors(self)
                    self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                    self.end_headers()
                    if data:
                        self.wfile.write(data)
            except CLIENT_DISCONNECT_ERRORS:
                return
            except HTTPError as err:
                data = err.read()
                self.send_response(err.code)
                _cors(self)
                self.send_header("Content-Type", err.headers.get("Content-Type", "application/json"))
                self.end_headers()
                if data:
                    self.wfile.write(data)
            except CLIENT_DISCONNECT_ERRORS:
                return
            except URLError as err:
                payload = json.dumps({
                    "error": "upstream_unreachable",
                    "details": str(err.reason),
                    "target": target_url,
                }).encode("utf-8")
                self.send_response(502)
                _cors(self)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except CLIENT_DISCONNECT_ERRORS:
                return

        def log_message(self, fmt, *args):
            return

    return ProxyHandler


class ProxyServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, CLIENT_DISCONNECT_ERRORS):
            return
        super().handle_error(request, client_address)


def main():
    parser = argparse.ArgumentParser(description="FinSim mobile debug log proxy")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=7890, help="Bind port (default: 7890)")
    parser.add_argument(
        "--target-base",
        default="http://127.0.0.1:7889",
        help="Upstream Cursor debug server base URL (default: http://127.0.0.1:7889)",
    )
    args = parser.parse_args()

    server = ProxyServer((args.host, args.port), _make_handler(args.target_base))
    print(f"[debug-log-proxy] listening on http://{args.host}:{args.port}")
    print(f"[debug-log-proxy] forwarding to {args.target_base.rstrip('/')}/...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
