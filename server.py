"""Serves the dashboard and proxies the secret iCal feeds listed in calendars.json.

The feed URLs stay on this machine: the browser only sees calendar names and colors,
and fetches each feed through /api/ical/<index>.

Usage: python server.py [port] [host]
  host defaults to 127.0.0.1 (this machine only); use 0.0.0.0 to serve the local network.
"""
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CALENDARS_FILE = ROOT / "calendars.json"
PUBLIC_FILES = {"/": "index.html", "/index.html": "index.html", "/style.css": "style.css",
                "/app.js": "app.js", "/config.js": "config.js"}


def load_calendars():
    try:
        return json.loads(CALENDARS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []


def refresh_windows_roots(url):
    """Make Windows download the root certificate for url's site.

    A fresh Windows install keeps only a few root certificates and fetches the rest the first
    time Windows itself checks a site. Python reads the certificate store but never triggers
    that download, so it can reject a site Edge opens fine. A request through PowerShell
    (which uses Windows' own TLS) fills the store in.
    """
    origin = "{0.scheme}://{0.netloc}/".format(urllib.parse.urlsplit(url))
    subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         f"try {{ Invoke-WebRequest '{origin}' -Method Head -UseBasicParsing -TimeoutSec 15 | Out-Null }} catch {{ }}"],
        timeout=30, capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def fetch_feed(url):
    """Returns the feed's bytes, or raises an error whose message is safe to show (no URL)."""
    req = urllib.request.Request(url, headers={"User-Agent": "home-dashboard"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return res.read()
        except urllib.error.HTTPError as err:
            raise RuntimeError(f"Google answered {err.code} {err.reason} - check the calendar address") from err
        except urllib.error.URLError as err:
            cert_problem = isinstance(err.reason, ssl.SSLCertVerificationError)
            if cert_problem and attempt == 0 and sys.platform == "win32":
                refresh_windows_roots(url)
                continue
            if cert_problem:
                raise RuntimeError(f"certificate check failed ({err.reason.verify_message})") from err
            raise RuntimeError(f"no connection ({err.reason})") from err
        except TimeoutError as err:
            raise RuntimeError("no answer within 20 seconds") from err


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        try:
            if path == "/api/calendars":
                cals = [{"name": c.get("name", f"Calendar {i + 1}"), "color": c.get("color", "")}
                        for i, c in enumerate(load_calendars())]
                return self.send_json(200, cals)
            if path.startswith("/api/ical/"):
                return self.proxy_ical(path.rsplit("/", 1)[1])
        except json.JSONDecodeError as err:
            return self.send_json(500, {"error": f"calendars.json is not valid JSON: {err}"})

        # Only the page's own files are served, so calendars.json can't be downloaded.
        if path not in PUBLIC_FILES:
            return self.send_error(404)
        self.path = "/" + PUBLIC_FILES[path]
        return super().do_GET()

    def proxy_ical(self, index):
        cals = load_calendars()
        if not index.isdigit() or int(index) >= len(cals):
            return self.send_json(404, {"error": "unknown calendar"})
        try:
            body = fetch_feed(cals[int(index)]["url"])
        except Exception as err:
            return self.send_json(502, {"error": f"Could not fetch the calendar: {err}"})
        self.send_response(200)
        self.send_header("Content-Type", "text/calendar; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    # Under pythonw (no console) there is no stderr, and request logging would crash each request.
    if sys.stderr is None:
        sys.stderr = sys.stdout = open(os.devnull, "w")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    shown = "localhost" if host == "127.0.0.1" else ("<this machine's IP>" if host == "0.0.0.0" else host)
    print(f"Dashboard running at http://{shown}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
