"""Lightweight HTTP trigger service for Docker environments.

Listens for POST /run requests from the web service on the internal Docker network,
running the Python arXiv digest pipeline for the specified user and date.
"""

import json
import logging
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger("pipeline_server")


class PipelineHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/run":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            user_id = data.get("user_id")
            run_date = data.get("run_date")

            if not user_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"error":"user_id is required"}')
                return

            def worker():
                try:
                    log.info("Triggering pipeline for user %s on %s", user_id, run_date)
                    os.environ["PIPELINE_USER_ID"] = str(user_id)
                    if run_date:
                        os.environ["PIPELINE_RUN_DATE"] = str(run_date)
                    os.environ["PIPELINE_SKIP_TIME_FILTER"] = "true"
                    pipeline.main()
                    log.info("Pipeline run finished for user %s", user_id)
                except Exception as exc:
                    log.exception("Pipeline run failed for user %s: %s", user_id, exc)

            threading.Thread(target=worker, daemon=True).start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"accepted"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"healthy"}')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Delegate to standard logging
        log.info("%s - %s", self.address_string(), format % args)


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = HTTPServer(("0.0.0.0", port), PipelineHandler)
    log.info("Pipeline trigger server listening on 0.0.0.0:%d", port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Pipeline server shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
