// Edit these settings, then reload the page.
// Calendars are configured in calendars.json (kept server-side, see README).
window.APP_CONFIG = {
  // Used when the browser denies geolocation.
  fallbackLocation: { name: "Warsaw", latitude: 52.2297, longitude: 21.0122 },

  // "celsius" or "fahrenheit"
  temperatureUnit: "celsius",

  // 1 = Monday, 0 = Sunday
  weekStartsOn: 1,

  // How often to re-fetch calendar events and weather (minutes).
  refreshMinutes: 5,
};
