/* Riftborn — the real weather where you are, like Pokémon GO's weather
   boost. Every 20 minutes (or after you've travelled a few km) it asks
   Open-Meteo (free, no key) for the current weather at your GPS position.
   Each kind of weather draws out one element: more of those creatures
   appear, they give extra XP, and the map shows the rain, snow or fog.
   Without a connection there's simply no weather boost. */
window.RB = window.RB || {};
(function (RB) {
  'use strict';

  const KINDS = {
    clear: { name: 'Sunny', icon: '☀️', el: 'ember', night: { name: 'Clear night', icon: '🌙' } },
    partly: { name: 'Partly cloudy', icon: '⛅', el: 'gale', night: { icon: '☁️' } },
    cloudy: { name: 'Cloudy', icon: '☁️', el: 'stone' },
    fog: { name: 'Fog', icon: '🌫️', el: 'void' },
    rain: { name: 'Rain', icon: '🌧️', el: 'tide' },
    snow: { name: 'Snow', icon: '🌨️', el: 'tide' },
    storm: { name: 'Thunderstorm', icon: '⛈️', el: 'volt' },
    windy: { name: 'Windy', icon: '💨', el: 'gale' },
  };

  // WMO weather codes (what Open-Meteo reports) → our kinds.
  function kindOf(code, wind) {
    if (code >= 95) return 'storm';
    if (wind >= 32 && code < 51) return 'windy';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code === 45 || code === 48) return 'fog';
    if (code === 3) return 'cloudy';
    if (code === 2) return 'partly';
    return 'clear';
  }

  const EVERY = 20 * 60e3;
  let now = null;          // { kind, temp, wind, day, at, lat, lng }
  let busy = false;
  let failedAt = 0;        // after a failed check, wait 5 minutes
  const listeners = [];

  function farFrom(lat, lng) {
    if (!now) return true;
    return RB.world.distM({ lat, lng }, { lat: now.lat, lng: now.lng }) > 3000;
  }

  // Call with your position whenever it changes; it only asks when needed.
  async function update(lat, lng, force) {
    if (busy || (!force && now && Date.now() - now.at < EVERY && !farFrom(lat, lng))) return;
    if (!force && Date.now() - failedAt < 5 * 60e3) return;
    busy = true;
    try {
      // Rounded to about 1 km: the weather service never gets your exact spot.
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&current=weather_code,temperature_2m,wind_speed_10m,is_day&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`weather ${res.status}`);
      const c = (await res.json()).current;
      if (!c || c.weather_code == null) throw new Error('no weather');
      const before = now && now.kind;
      now = {
        kind: kindOf(c.weather_code, c.wind_speed_10m || 0),
        temp: Math.round(c.temperature_2m), wind: Math.round(c.wind_speed_10m || 0),
        day: c.is_day !== 0, at: Date.now(), lat, lng,
      };
      if (now.kind !== before) for (const fn of listeners) fn(now);
    } catch (e) {
      failedAt = Date.now();   // try again in a few minutes
    } finally {
      busy = false;
    }
  }

  // Name and icon, allowing for night (a clear night shows a moon).
  function look(w) {
    const k = KINDS[w.kind];
    const n = !w.day && k.night ? k.night : {};
    return { name: n.name || k.name, icon: n.icon || k.icon };
  }

  RB.weather = {
    KINDS, kindOf, update, look,
    get now() { return now; },
    // The element the weather draws out right now, or null.
    get boost() { return now ? KINDS[now.kind].el : null; },
    onChange(fn) { listeners.push(fn); },
    // For tests and the offline case.
    set(w) { now = w; for (const fn of listeners) fn(now); },
  };
})(window.RB);
