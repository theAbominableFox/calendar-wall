# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page home dashboard (clock, weather, 4-week calendar with Google Calendar events), run locally on the user's Windows PC via `start-dashboard.cmd`. No build step, no dependencies beyond Python 3 stdlib and one CDN script (`ical.js@1.5.0`). There are no tests or linters.

## Commands

```
install-dashboard.cmd            # one-time PC setup: runs install-dashboard.ps1 (Python, Edge check, calendars.json, desktop shortcuts)
start-dashboard.cmd              # hidden pythonw server on :8000 (reused if running) + Edge --app window
start-dashboard-fullscreen.cmd   # same, but full screen (calls start-dashboard.cmd kiosk)
stop-dashboard.cmd               # kills whatever listens on :8000
python server.py                 # http://localhost:8000, this machine only
python server.py 8765           # [port] [host]; host defaults to 127.0.0.1
```

`.claude/launch.json` has a `dashboard` config for the preview pane. Static files and `calendars.json` are re-read per request, so reload the page instead of restarting the server (restart only after editing `server.py`).

## Architecture

- **`server.py`** — `SimpleHTTPRequestHandler` subclass with an **allowlist** (`PUBLIC_FILES`): only `index.html`, `style.css`, `app.js`, `config.js` are served; everything else 404s. This is what keeps `calendars.json` (secret Google iCal URLs) from reaching the browser. New front-end files must be added to `PUBLIC_FILES`. API:
  - `GET /api/calendars` → `[{name, color}]` (never the URLs)
  - `GET /api/ical/<index>` → proxies the feed at that index (Google feeds don't send CORS headers, hence the proxy); on failure 502 `{error}` with a readable reason (never the URL), which the page shows when the red sync status is tapped
  - `fetch_feed`: on a certificate verification error it calls `refresh_windows_roots` once and retries. Fresh Windows installs download root certificates on demand, which Edge/PowerShell (Schannel) trigger but Python's `ssl` (reading the store) doesn't; a PowerShell `Invoke-WebRequest` to the feed's origin fills the store. The installer does the same check up front.
- **`calendars.json`** — server-side list of `{name, color?, url}`; see `calendars.example.json`. Contains real secrets; gitignored. Don't print its URLs.
- **`config.js`** — browser-side settings on `window.APP_CONFIG` (fallback location, units, week start, refresh interval).
- **`app.js`** — one IIFE, sections in order: clock → weather (Open-Meteo, no key; location priority: city picked in the location picker (Open-Meteo geocoding, saved in `localStorage` key `dashboard_location`, per browser) → browser geolocation → `fallbackLocation`) → calendar feeds → rendering → popup → boot/refresh timers.
  - `parseIcs` uses ical.js to expand recurrences (RRULE/EXDATE/RECURRENCE-ID overrides, VTIMEZONE) within the visible range, skips `STATUS:CANCELLED`, and normalizes each occurrence to a Google-API-like shape: `{id, summary, location, description, start: {date}|{dateTime}, end: …, _color, _calName}`. All-day `end.date` is exclusive. The renderer only knows this shape.
  - The ‹ › arrows shift `weekOffset` (used by `rangeStart`); `loadEvents` keeps the raw feed texts in `feeds`, so `buildEvents` re-expands them for the new range without refetching. A Today button appears while shifted, and the view returns to the current weeks after 2 idle minutes.
  - `eventSpan` gives an event's first/last local day; `dayDiff` rounds to survive DST.
  - `renderCalendar` draws 4 `.week` CSS grids. Each week: 7 `.day` background cells spanning all rows, `.day-head` in row 1, then events placed into **lanes** (rows 2..) — multi-day segments first, each as one item spanning `grid-column: a / b+2`, with `cont-l`/`cont-r` when it continues from/into another week. Lanes are capped at `MAX_LANES`; overflow becomes per-day `+N more` (popup lists the day via `eventsByDay`).
- **Installer** — `install-dashboard.ps1` detects Python by running it (a fresh Windows has a Microsoft Store `python.exe` placeholder that exits 9009), installs per-user with `PrependPath=1 Include_launcher=1` via winget `Python.Python.3.14`, falling back to the python.org installer (`$pyVersion`, signature checked for the PSF). Keep the `.ps1` ASCII-only (Windows PowerShell 5.1 reads BOM-less files as ANSI) and write `calendars.json` without a BOM (`json.loads` rejects it).
- **Launchers** — `start-dashboard.cmd` uses `pythonw`, falling back to `pyw` when Python isn't on PATH, and health-checks `http://127.0.0.1:%PORT%/api/calendars` (not `localhost`: the server is IPv4-only and the IPv6 attempt makes the check time out). `server.py` redirects stderr to devnull under `pythonw`, where request logging would otherwise crash.
- **Full screen** — the `kiosk` launcher opens `/?kiosk` with `--app --start-fullscreen` and its own `--user-data-dir` (`%LOCALAPPDATA%\HomeDashboardKiosk`, needed so the flags apply when Edge is already running). Not `--kiosk`: Edge's full-screen kiosk is always InPrivate and would lose the saved city. With `?kiosk` the page shows a Close button (`window.close()`, allowed for a command-line-launched window; the only exit on touch-only PCs) instead of the Fullscreen-API toggle. Users have touch-only PCs: keep tap targets ≥ 40px and don't rely on hover or keys. The preview pane ignores `requestFullscreen`.
## Conventions

- UI uses the browser locale (`toLocaleDateString(undefined, …)`); the user's browser is Polish.
- Dark theme only; colors are CSS variables in `:root` of `style.css`.
- Layout: two columns `1fr 3fr` (left: clock + today's detailed weather + next 4 days; right: calendar); collapses to one column under 800px.
