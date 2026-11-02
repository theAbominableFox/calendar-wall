(() => {
  const CFG = window.APP_CONFIG || {};
  const DAYS = 28;
  const $ = (id) => document.getElementById(id);

  // ---------- Date helpers ----------
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const dayKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseDateOnly = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  // Weeks the view is moved from the current one with the arrows (0 = starts this week).
  let weekOffset = 0;

  function rangeStart() {
    const today = startOfDay(new Date());
    const ws = CFG.weekStartsOn ?? 1;
    return addDays(today, -((today.getDay() - ws + 7) % 7) + 7 * weekOffset);
  }

  // ---------- Clock ----------
  function tickClock() {
    const now = new Date();
    const hm = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const s = String(now.getSeconds()).padStart(2, "0");
    $("time").innerHTML = `${hm}<span class="sec">${s}</span>`;
  }

  // ---------- Weather (Open-Meteo, no API key) ----------
  const WMO = {
    0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
    45: ["🌫️", "Fog"], 48: ["🌫️", "Rime fog"],
    51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌧️", "Dense drizzle"],
    56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"],
    61: ["🌦️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
    66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
    71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["🌨️", "Snow grains"],
    80: ["🌦️", "Rain showers"], 81: ["🌧️", "Rain showers"], 82: ["⛈️", "Violent showers"],
    85: ["🌨️", "Snow showers"], 86: ["❄️", "Snow showers"],
    95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm, hail"], 99: ["⛈️", "Thunderstorm, hail"],
  };
  const wmo = (code) => WMO[code] || ["🌡️", "Unknown"];

  const LOC_KEY = "dashboard_location";
  let location = null;
  let dailyWeather = {}; // dayKey -> { code, max, min }

  // A location picked by hand is remembered per browser and wins over geolocation.
  const savedLocation = () => {
    try { return JSON.parse(localStorage.getItem(LOC_KEY)); } catch { return null; }
  };
  const saveLocation = (loc) => {
    try { loc ? localStorage.setItem(LOC_KEY, JSON.stringify(loc)) : localStorage.removeItem(LOC_KEY); } catch {}
  };

  function getLocation() {
    const fb = CFG.fallbackLocation || { name: "Warsaw", latitude: 52.2297, longitude: 21.0122 };
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(fb);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          let name = "Your location";
          try {
            const r = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            );
            const j = await r.json();
            name = j.city || j.locality || j.principalSubdivision || name;
          } catch { /* keep generic name */ }
          resolve({ name, latitude, longitude });
        },
        () => resolve(fb),
        { timeout: 8000, maximumAge: 30 * 60 * 1000 }
      );
    });
  }

  async function loadWeather() {
    try {
      if (!location) location = savedLocation() || await getLocation();
      const unit = CFG.temperatureUnit === "fahrenheit" ? "fahrenheit" : "celsius";
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: location.latitude,
        longitude: location.longitude,
        current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset",
        timezone: "auto",
        forecast_days: 16,
        temperature_unit: unit,
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const w = await res.json();

      const c = w.current;
      const [icon, desc] = wmo(c.weather_code);
      $("weather-icon").textContent = icon;
      $("weather-temp").textContent = `${Math.round(c.temperature_2m)}°`;
      $("weather-desc").textContent = desc;
      $("weather-loc").textContent = `📍 ${location.name} ▾`;

      const dl = w.daily;
      const hm = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      const details = [
        ["High / Low", `${Math.round(dl.temperature_2m_max[0])}° / ${Math.round(dl.temperature_2m_min[0])}°`],
        ["Feels like", `${Math.round(c.apparent_temperature)}°`],
        ["Rain", `${dl.precipitation_probability_max?.[0] ?? "–"}% · ${dl.precipitation_sum?.[0] ?? 0} mm`],
        ["Humidity", `${c.relative_humidity_2m}%`],
        ["Wind", `${Math.round(c.wind_speed_10m)} km/h`],
        ["Sunrise / Sunset", `🌅&nbsp;${hm(dl.sunrise[0])} 🌇&nbsp;${hm(dl.sunset[0])}`],
      ];
      $("weather-details").innerHTML = details
        .map(([k, v]) => `<div><span class="muted small">${k}</span><b>${v}</b></div>`).join("");

      dailyWeather = {};
      w.daily.time.forEach((t, i) => {
        dailyWeather[t] = {
          code: w.daily.weather_code[i],
          max: Math.round(w.daily.temperature_2m_max[i]),
          min: Math.round(w.daily.temperature_2m_min[i]),
          rain: w.daily.precipitation_probability_max?.[i],
        };
      });

      $("weather-days").innerHTML = w.daily.time.slice(1, 5).map((t) => {
        const label = parseDateOnly(t).toLocaleDateString(undefined, { weekday: "long" });
        const dw = dailyWeather[t];
        return `<div class="wday" title="${wmo(dw.code)[1]}">
          <span class="wday-name">${label}</span><span class="ico">${wmo(dw.code)[0]}</span>
          <span class="rain">💧${dw.rain ?? "–"}%</span>
          <span class="temps">${dw.max}° <span class="lo">${dw.min}°</span></span></div>`;
      }).join("");
    } catch (err) {
      console.error(err);
      $("weather-desc").textContent = "Weather unavailable";
    }
  }

  // ---------- Calendar feeds (secret iCal addresses, proxied by server.py) ----------
  const PALETTE = ["#6ea8fe", "#f28b82", "#81c995", "#fdd663", "#c58af9", "#78d9ec", "#fcad70"];
  let events = [];

  function setStatus(text) { $("sync-status").textContent = text; }

  const isCancelled = (comp) => String(comp.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED";

  // ICAL.Time -> the { date } / { dateTime } shape the renderer uses.
  const toEventTime = (t) =>
    t.isDate ? { date: dayKey(t.toJSDate()) } : { dateTime: t.toJSDate().toISOString() };

  // Parses one .ics feed and returns the occurrences that overlap [start, end).
  function parseIcs(text, start, end, cal) {
    const root = new ICAL.Component(ICAL.parse(text));
    root.getAllSubcomponents("vtimezone").forEach((tz) => ICAL.TimezoneService.register(tz));

    const all = root.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
    const byUid = {};
    all.filter((e) => !e.isRecurrenceException()).forEach((e) => { byUid[e.uid] = e; });
    all.filter((e) => e.isRecurrenceException()).forEach((ex) => byUid[ex.uid]?.relateException(ex));

    const out = [];
    const push = (item, s, e) => {
      if (isCancelled(item.component)) return;
      const sj = s.toJSDate();
      const ej = (e || s).toJSDate();
      if (ej <= start || sj >= end) return;
      out.push({
        id: `${item.uid}|${sj.getTime()}`,
        summary: item.summary,
        location: item.location,
        description: item.description,
        start: toEventTime(s),
        end: toEventTime(e || s),
        _color: cal.color,
        _calName: cal.name,
      });
    };

    for (const ev of Object.values(byUid)) {
      if (!ev.isRecurring()) { push(ev, ev.startDate, ev.endDate); continue; }
      const it = ev.iterator();
      for (let next, n = 0; (next = it.next()) && n < 50000; n++) {
        if (next.toJSDate() >= end) break;
        const occ = ev.getOccurrenceDetails(next);
        push(occ.item, occ.startDate, occ.endDate);
      }
    }
    return out;
  }

  async function loadEvents() {
    let cals;
    try {
      const res = await fetch("/api/calendars");
      cals = await res.json();
      if (!res.ok) throw new Error(cals.error || `HTTP ${res.status}`);
    } catch (err) {
      console.error(err);
      setStatus(`Calendar setup error: ${err.message}`);
      return;
    }
    if (!cals.length) {
      $("refresh-btn").hidden = true;
      setStatus("Add your secret iCal addresses to calendars.json");
      return;
    }
    $("refresh-btn").hidden = false;
    setStatus("Syncing…");

    const failed = [];
    const perCal = await Promise.all(cals.map(async (c, i) => {
      const cal = { name: c.name, color: c.color || PALETTE[i % PALETTE.length] };
      try {
        const res = await fetch(`/api/ical/${i}`);
        if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
        return { cal, text: await res.text() };
      } catch (err) {
        console.error(`${cal.name}:`, err);
        failed.push({ name: cal.name, reason: err.message });
        return null;
      }
    }));

    feeds = perCal.filter(Boolean);
    failed.push(...buildEvents());
    syncErrors = failed;
    const time = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    setStatus(failed.length
      ? `Couldn't load: ${failed.map((f) => f.name).join(", ")} · ${time} · tap for details`
      : `Synced ${time}`);
    $("sync-status").classList.toggle("has-errors", failed.length > 0);
  }

  // Feed texts from the last sync, so moving between weeks re-expands them without refetching.
  let feeds = [];

  // Expands the feeds for the visible range and redraws; returns the feeds that failed to parse.
  function buildEvents() {
    const start = rangeStart();
    const end = addDays(start, DAYS);
    const failed = [];
    events = feeds.flatMap(({ cal, text }) => {
      try {
        return parseIcs(text, start, end, cal);
      } catch (err) {
        console.error(`${cal.name}:`, err);
        failed.push({ name: cal.name, reason: err.message });
        return [];
      }
    });
    renderCalendar();
    return failed;
  }

  // Arrows move the view a week at a time; it returns to the current weeks after 2 idle minutes,
  // so a wall display doesn't stay on another month.
  let weekResetTimer;
  function setWeekOffset(n) {
    const dir = Math.sign(n - weekOffset);
    const old = [...$("grid").querySelectorAll(".week:not(.week-ghost)")];
    const outgoing = dir > 0 ? old[0] : old[old.length - 1];
    const outHeight = outgoing?.offsetHeight;
    weekOffset = n;
    $("today-btn").hidden = n === 0;
    clearTimeout(weekResetTimer);
    if (n !== 0) weekResetTimer = setTimeout(() => setWeekOffset(0), 2 * 60 * 1000);
    buildEvents();
    if (dir && outgoing) slideWeeks(dir, outgoing, outHeight);
  }

  // Slides the rows up (forward) or down (back) by one week: the new rows start one row
  // away from their place, and a copy of the week that left slides out past the edge.
  function slideWeeks(dir, outgoing, outHeight) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const grid = $("grid");
    const weeks = [...grid.querySelectorAll(".week")];
    if (weeks.length < 2) return;
    const step = weeks[1].offsetTop - weeks[0].offsetTop;
    const ghost = outgoing.cloneNode(true);
    ghost.classList.add("week-ghost");
    ghost.style.height = `${outHeight}px`;
    ghost.style.top = `${dir > 0 ? weeks[0].offsetTop - step : weeks[weeks.length - 1].offsetTop + step}px`;
    grid.append(ghost);
    const frames = [{ transform: `translateY(${dir * step}px)` }, { transform: "none" }];
    const opts = { duration: 350, easing: "cubic-bezier(.2, .7, .3, 1)" };
    for (const w of weeks) w.animate(frames, opts);
    ghost.animate(frames, opts).finished.then(() => ghost.remove(), () => ghost.remove());
  }
  $("prev-week").addEventListener("click", () => setWeekOffset(weekOffset - 1));
  $("next-week").addEventListener("click", () => setWeekOffset(weekOffset + 1));
  $("today-btn").addEventListener("click", () => setWeekOffset(0));

  // Tapping the status after a failed sync shows why each calendar failed.
  let syncErrors = [];
  $("sync-status").addEventListener("click", (ev) => {
    if (!syncErrors.length) return;
    ev.stopPropagation();
    showPopup(`<h3>Couldn't load calendars</h3>` +
      syncErrors.map((f) => `<p><b>${esc(f.name)}</b><br>${esc(f.reason)}</p>`).join(""), $("sync-status"));
  });

  // ---------- Calendar rendering ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Whole days between two local midnights (rounded, so DST changes don't matter).
  const dayDiff = (a, b) => Math.round((b - a) / 86400000);

  // First and last calendar day an event occupies.
  function eventSpan(e) {
    const allDay = !!e.start.date;
    const s = allDay ? parseDateOnly(e.start.date) : new Date(e.start.dateTime);
    const first = startOfDay(s);
    // All-day end dates are exclusive; timed events ending exactly at midnight don't spill over.
    const last = allDay ? addDays(parseDateOnly(e.end.date), -1)
      : startOfDay(new Date(new Date(e.end.dateTime).getTime() - 1));
    return { allDay, s, first, last: last < first ? first : last };
  }

  function eventsByDay(start) {
    const map = {};
    const end = addDays(start, DAYS);
    for (const e of events) {
      const { allDay, s, first, last } = eventSpan(e);
      let d = first < start ? start : first;
      while (d <= last && d < end) {
        (map[dayKey(d)] ||= []).push({ e, allDay, s });
        d = addDays(d, 1);
      }
    }
    for (const k in map) {
      map[k].sort((a, b) => (b.allDay - a.allDay) || (a.s - b.s));
    }
    return map;
  }

  function renderCalendar() {
    const start = rangeStart();
    const today = startOfDay(new Date());
    const end = addDays(start, DAYS - 1);
    const fmt = { day: "numeric", month: "short" };
    $("range-label").textContent =
      `${start.toLocaleDateString(undefined, fmt)} – ${end.toLocaleDateString(undefined, fmt)}`;

    const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
    $("weekdays").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return `<div${isWeekend(d) ? ' class="weekend"' : ""}>${d.toLocaleDateString(undefined, { weekday: "short" })}</div>`;
    }).join("");

    const spans = events.map((e) => ({ e, ...eventSpan(e) }));
    const MAX_LANES = 4;
    let html = "";

    // Each week is its own grid: day backgrounds fill every row, events sit in lanes on top,
    // and an event lasting several days is one item spanning those columns.
    for (let w = 0; w < DAYS / 7; w++) {
      const ws = addDays(start, w * 7);

      const segs = [];
      for (const sp of spans) {
        const a = Math.max(0, dayDiff(ws, sp.first));
        const b = Math.min(6, dayDiff(ws, sp.last));
        if (a > b) continue;
        segs.push({ ...sp, a, b, multi: +sp.first !== +sp.last,
          contL: sp.first < ws, contR: dayDiff(ws, sp.last) > 6 });
      }
      // Multi-day bars first (longest first) so they get the top lanes, then by start time.
      segs.sort((x, y) => (y.multi - x.multi) || (x.a - y.a) || ((y.b - y.a) - (x.b - x.a)) ||
        (y.allDay - x.allDay) || (x.s - y.s));

      const lanes = [];
      const hidden = Array(7).fill(0);
      for (const seg of segs) {
        let lane = 0;
        while (lane < lanes.length && lanes[lane].slice(seg.a, seg.b + 1).some(Boolean)) lane++;
        if (lane >= MAX_LANES) {
          for (let c = seg.a; c <= seg.b; c++) hidden[c]++;
          continue;
        }
        (lanes[lane] ||= Array(7).fill(false)).fill(true, seg.a, seg.b + 1);
        seg.lane = lane;
      }

      let cells = "";
      for (let c = 0; c < 7; c++) {
        const d = addDays(ws, c);
        const state = [];
        if (isWeekend(d)) state.push("weekend");
        if (d < today) state.push("past");
        if (+d === +today) state.push("today");
        const i = w * 7 + c;
        const num = i === 0 || d.getDate() === 1 ? d.toLocaleDateString(undefined, fmt) : d.getDate();
        cells += `<div class="day ${state.join(" ")}" style="grid-column:${c + 1};grid-row:1/-1"></div>` +
          `<div class="day-head ${state.join(" ")}" style="grid-column:${c + 1};grid-row:1"><span class="day-num">${num}</span></div>`;
        if (hidden[c]) {
          cells += `<div class="more" style="grid-column:${c + 1};grid-row:${lanes.length + 2}" data-day="${dayKey(d)}">+${hidden[c]} more</div>`;
        }
      }

      const items = segs.filter((s) => s.lane !== undefined).map((s) => {
        const cls = ["event"];
        if (s.allDay || s.multi) cls.push("allday");
        if (s.contL) cls.push("cont-l");
        if (s.contR) cls.push("cont-r");
        if (s.last < today) cls.push("past");
        const time = s.allDay || s.contL ? "" :
          `<span class="t">${s.s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>`;
        return `<div class="${cls.join(" ")}" style="grid-column:${s.a + 1}/${s.b + 2};grid-row:${s.lane + 2};--ev:${esc(s.e._color || "")}" data-id="${esc(s.e.id)}">${time}${esc(s.e.summary || "(No title)")}</div>`;
      }).join("");

      const rows = ["auto", ...lanes.map(() => "auto"), "auto", "minmax(4px, 1fr)"].join(" ");
      html += `<div class="week" style="grid-template-rows:${rows}">${cells}${items}</div>`;
    }
    $("grid").innerHTML = html;
  }

  // ---------- Event popup ----------
  function fmtEventTime(e) {
    if (e.start.date) {
      const s = parseDateOnly(e.start.date);
      const last = addDays(parseDateOnly(e.end.date), -1);
      const f = { weekday: "short", day: "numeric", month: "short" };
      return +s === +last ? `${s.toLocaleDateString(undefined, f)} · All day`
        : `${s.toLocaleDateString(undefined, f)} – ${last.toLocaleDateString(undefined, f)}`;
    }
    const s = new Date(e.start.dateTime), en = new Date(e.end.dateTime);
    const t = { hour: "2-digit", minute: "2-digit" };
    return `${s.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ` +
      `${s.toLocaleTimeString(undefined, t)} – ${en.toLocaleTimeString(undefined, t)}`;
  }

  function showPopup(html, anchor) {
    const p = $("event-popup");
    p.innerHTML = html;
    p.hidden = false;
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    p.style.left = `${Math.max(8, Math.min(r.left, innerWidth - pw - 8))}px`;
    p.style.top = `${r.bottom + ph + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - ph - 4)}px`;
  }

  document.addEventListener("click", (ev) => {
    const evEl = ev.target.closest(".event");
    const moreEl = ev.target.closest(".more");
    if (evEl) {
      const e = events.find((x) => x.id === evEl.dataset.id);
      if (!e) return;
      showPopup(`<h3>${esc(e.summary || "(No title)")}</h3>
        <p class="muted">${esc(fmtEventTime(e))}</p>
        ${e.location ? `<p>📍 ${esc(e.location)}</p>` : ""}
        ${e.description ? `<p>${esc(e.description.replace(/<[^>]+>/g, " ").slice(0, 400))}</p>` : ""}
        <p class="muted small">${esc(e._calName)}</p>`, evEl);
    } else if (moreEl) {
      const list = eventsByDay(rangeStart())[moreEl.dataset.day] || [];
      showPopup(`<h3>${esc(parseDateOnly(moreEl.dataset.day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }))}</h3>` +
        list.map(({ e, allDay, s }) => `<p>${allDay ? "All day" : s.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · ${esc(e.summary || "(No title)")}</p>`).join(""), moreEl);
    } else if (!ev.target.closest("#event-popup")) {
      $("event-popup").hidden = true;
    }
  });

  // ---------- Buttons ----------
  $("refresh-btn").addEventListener("click", () => { loadEvents(); loadWeather(); });

  // Opened by start-dashboard-fullscreen.cmd (Edge kiosk): it's already full screen and has no
  // way out on a touch-only PC, so offer Close. A window launched from the command line may close itself.
  const kiosk = new URLSearchParams(window.location.search).has("kiosk");
  if (kiosk) {
    $("close-btn").hidden = false;
    $("close-btn").addEventListener("click", () => window.close());
  }

  // Fullscreen API hides the browser and the taskbar; exit with the same button or Esc.
  if (document.fullscreenEnabled && !kiosk) {
    const fsBtn = $("fullscreen-btn");
    fsBtn.hidden = false;
    fsBtn.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch((err) => console.error(err));
    });
    document.addEventListener("fullscreenchange", () => {
      fsBtn.textContent = document.fullscreenElement ? "✕ Exit full screen" : "⛶ Full screen";
    });
  }

  // ---------- Location picker (Open-Meteo geocoding, no key) ----------
  let locResults = [];
  let searchTimer;

  function setPickerOpen(open) {
    $("loc-picker").hidden = !open;
    if (open) {
      $("loc-input").value = "";
      $("loc-results").innerHTML = "";
      $("loc-input").focus();
    }
  }

  function chooseLocation(loc) {
    saveLocation(loc);
    location = loc;
    setPickerOpen(false);
    $("weather-loc").textContent = "📍 …";
    loadWeather();
  }

  async function searchCities(q) {
    if (q.length < 2) { $("loc-results").innerHTML = ""; return; }
    try {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.search = new URLSearchParams({
        name: q, count: 6, format: "json", language: (navigator.language || "en").slice(0, 2),
      });
      const j = await (await fetch(url)).json();
      if ($("loc-input").value.trim() !== q) return; // a newer search is on its way
      locResults = j.results || [];
      $("loc-results").innerHTML = locResults.length
        ? locResults.map((r, i) => `<button class="loc-result" data-i="${i}">${esc(r.name)}<span class="muted small">${esc([r.admin1, r.country].filter(Boolean).join(", "))}</span></button>`).join("")
        : `<div class="muted small">No matches</div>`;
    } catch (err) {
      console.error(err);
      $("loc-results").innerHTML = `<div class="muted small">Search failed</div>`;
    }
  }

  $("weather-loc").addEventListener("click", () => setPickerOpen($("loc-picker").hidden));
  $("loc-input").addEventListener("input", (ev) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchCities(ev.target.value.trim()), 300);
  });
  $("loc-input").addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") setPickerOpen(false);
    if (ev.key === "Enter" && locResults.length) $("loc-results").querySelector(".loc-result")?.click();
  });
  $("loc-results").addEventListener("click", (ev) => {
    const r = locResults[ev.target.closest(".loc-result")?.dataset.i];
    if (r) chooseLocation({ name: r.name, latitude: r.latitude, longitude: r.longitude });
  });
  $("loc-device").addEventListener("click", () => chooseLocation(null));
  $("loc-close").addEventListener("click", () => setPickerOpen(false));
  // Tapping anywhere outside the picker closes it.
  document.addEventListener("pointerdown", (ev) => {
    if (!$("loc-picker").hidden && !ev.target.closest("#loc-picker, #weather-loc")) setPickerOpen(false);
  });

  // ---------- Boot ----------
  tickClock();
  setInterval(tickClock, 1000);
  renderCalendar();
  loadWeather();
  loadEvents();

  const refreshMs = (CFG.refreshMinutes || 5) * 60 * 1000;
  setInterval(() => { loadWeather(); loadEvents(); }, refreshMs);

  // Re-render at midnight so "today" and the 4-week window roll forward.
  let lastDay = dayKey(new Date());
  setInterval(() => {
    const k = dayKey(new Date());
    if (k !== lastDay) { lastDay = k; renderCalendar(); loadEvents(); }
  }, 60 * 1000);
})();
