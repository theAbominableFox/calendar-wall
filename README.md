# Home Dashboard

A page that shows the current time, the weather (Open-Meteo, no key needed) and a 4-week calendar with your Google Calendar events.

## Install (once per PC)

Copy this folder to the PC and double-click **`install-dashboard.cmd`**. It:

- installs Python for the current user if it's missing (via winget, or from python.org if winget isn't available) — no admin rights needed
- checks that Python can download calendars from Google (a fresh Windows may first need to fetch Google's security certificate; the installer does that for you)
- checks that Microsoft Edge is installed
- creates an empty `calendars.json` if there is none
- clears Windows' "downloaded from the internet" warning on the project files
- adds **Home Dashboard** and **Home Dashboard (full screen)** shortcuts to the desktop

It's safe to run again; anything already in place is left as is.

## Run

Use the desktop shortcuts, or double-click **`start-dashboard.cmd`**. It starts the server in the background (no console window) and opens the dashboard in its own Edge window. Running it again just opens another window on the same server. To stop the background server, double-click **`stop-dashboard.cmd`** (closing the Edge window doesn't stop it).

**Full screen** (no browser bars, no taskbar):

- Double-click **`start-dashboard-fullscreen.cmd`** to always open it full screen. Tap **✕ Close** on the page (or press Alt+F4) to close it. This window has its own browser profile, so pick the weather city once inside it.
- Or, in a normal window, tap **⛶ Full screen** next to Refresh; tap **✕ Exit full screen** (or press Esc) to go back.

Or run it manually with logs in the console:

```
python server.py
```

Then open http://localhost:8000. Requires only Python 3 — no packages to install. Use `python server.py 9000` for another port.

## Add your Google calendars

No Google sign-in or Cloud project is needed; the page reads each calendar's secret iCal address.

1. Open Google Calendar on the web → **Settings** (gear icon).
2. Under **Settings for my calendars** on the left, click a calendar → **Integrate calendar**.
3. Copy **Secret address in iCal format**.
4. Add it to `calendars.json`, one entry per calendar (see `calendars.example.json`):

   ```json
   [
     { "name": "Personal", "color": "#6ea8fe", "url": "https://calendar.google.com/calendar/ical/.../basic.ics" }
   ]
   ```

   `color` is optional. Reload the page — no server restart needed.

For calendars shared with you or public ones (holidays), use **Public address in iCal format** if the secret one isn't shown.

**Keep the secret address private:** anyone with it can read that calendar. `server.py` only serves the page's own files, so `calendars.json` never reaches the browser; the feeds are fetched by the server. If an address leaks, use **Reset** next to it in Google Calendar settings.

**Delay:** Google updates iCal feeds on its own schedule, so new or changed events can take a few hours to appear. The page itself reloads feeds every 5 minutes.

## Weather location

Click the location name (📍) in the weather panel to search for a city. The choice is remembered by that browser, so each PC can have its own. **Use this device's location** goes back to automatic location.

## Settings (`config.js`)

- `fallbackLocation` — used if no city was picked and the browser can't share its location
- `temperatureUnit` — `"celsius"` or `"fahrenheit"`
- `weekStartsOn` — `1` Monday, `0` Sunday
- `refreshMinutes` — how often weather and events reload
