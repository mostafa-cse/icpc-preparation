#!/usr/bin/env python3
"""
ICPC Preparation Development Server (Python)
Usage:
    python3 backend/server.py [port]
"""

import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8085))
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("\n=======================================================")
        print(f"🚀 ICPC Preparation Server Running (Python)")
        print(f"   Local URL:    http://localhost:{PORT}")
        print(f"   Frontend URL: http://localhost:{PORT}/frontend/")
        print(f"   Serving:      {ROOT_DIR}")
        print("=======================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer shutting down...")
