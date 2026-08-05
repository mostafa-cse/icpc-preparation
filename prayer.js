/*
 * Prayer times for the Routine tab.
 *
 * Times come from api.aladhan.com (CORS-open) using method 1 — Karachi, the
 * standard calculation for Bangladesh and South Asia — with school=1 (Hanafi),
 * which is what moves Asr later in the afternoon.
 *
 * Location is resolved from the browser first and an IP lookup second. Both are
 * allowed to fail: a fixed set of times keeps the schedule building rather than
 * leaving the day empty because a lookup timed out. Results are cached per day
 * so a normal visit costs no network at all.
 */
(function () {
  "use strict";

  const CACHE = "icpc_prayer";
  const METHOD = 1;   // Karachi
  const SCHOOL = 1;   // Hanafi (later Asr)

  // Bogura, Bangladesh — only used when every lookup fails.
  const FALLBACK_PLACE = { lat: 24.85, lon: 89.37, label: "Bogura, Bangladesh" };

  // Rough seasonal middle for the fallback place. Deliberately plain numbers:
  // the point is that the timetable still renders, not that these are exact.
  const FALLBACK_TIMES = {
    Fajr: "04:15", Dhuhr: "12:05", Asr: "16:30", Maghrib: "18:30", Isha: "19:50",
    estimated: true, place: FALLBACK_PLACE.label,
  };

  const ORDER = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

  // The times the schedule actually runs on are jamaat times, not astronomical
  // ones — you pray when the mosque prays, which is why Zuhr sits at 1:30pm and
  // not at the calculated 12:09. Each prayer therefore has a window it is
  // allowed to fall in; two of them do not move at all.
  const SPEC = {
    Fajr:    { label: "Fajr",    min: 5 * 60,  max: 6 * 60 },
    Dhuhr:   { label: "Zuhr",    fixed: 13 * 60 + 30 },
    Asr:     { label: "Asr",     min: 16 * 60, max: 17 * 60 },
    Maghrib: { label: "Maghrib", min: 18 * 60, max: 19 * 60 },
    Isha:    { label: "Isha",    fixed: 20 * 60 },
  };

  function toMins(s) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s || ""));
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  function toHHMM(min) {
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /*
   * The times the routine is built from.
   *
   *   fixed prayers  -> always their fixed time, whatever anyone says
   *   ranged prayers -> the user's own value if they set one, otherwise today's
   *                     calculated time pulled into the window, so Maghrib
   *                     still tracks sunset across the season without ever
   *                     leaving 6–7pm
   */
  function effective(calculated, overrides) {
    const out = {};
    ORDER.forEach(key => {
      const spec = SPEC[key];
      if (spec.fixed != null) { out[key] = toHHMM(spec.fixed); return; }

      const own = toMins(overrides && overrides[key]);
      if (own != null) { out[key] = toHHMM(clamp(own, spec.min, spec.max)); return; }

      const calc = toMins(calculated && calculated[key]);
      out[key] = toHHMM(calc != null ? clamp(calc, spec.min, spec.max)
                                     : Math.round((spec.min + spec.max) / 2));
    });
    return out;
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }

  function ddmmyyyy() {
    const d = new Date();
    return String(d.getDate()).padStart(2, "0") + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
  }

  function readCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE) || "null");
      return raw && raw.day === todayKey() ? raw.times : null;
    } catch (e) { return null; }
  }

  function writeCache(times) {
    try { localStorage.setItem(CACHE, JSON.stringify({ day: todayKey(), times })); }
    catch (e) {}
  }

  function browserLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      // Never block the schedule on a permission prompt the user ignores.
      const bail = setTimeout(() => resolve(null), 5000);
      navigator.geolocation.getCurrentPosition(
        pos => { clearTimeout(bail); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
        () => { clearTimeout(bail); resolve(null); },
        { timeout: 5000, maximumAge: 3600000 }
      );
    });
  }

  async function ipLocation() {
    try {
      const r = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (d && d.latitude) {
        return { lat: d.latitude, lon: d.longitude, label: [d.city, d.country].filter(Boolean).join(", ") };
      }
    } catch (e) {}
    return null;
  }

  async function fetchTimings(loc) {
    const url = "https://api.aladhan.com/v1/timings/" + ddmmyyyy() +
      "?latitude=" + loc.lat + "&longitude=" + loc.lon +
      "&method=" + METHOD + "&school=" + SCHOOL;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("prayer times unavailable");
    const json = await r.json();
    const t = json && json.data && json.data.timings;
    if (!t) throw new Error("prayer times unavailable");

    const out = { place: loc.label || (json.data.meta && json.data.meta.timezone) || "" };
    // Aladhan appends things like "(+06)" to some fields.
    ORDER.forEach(k => { out[k] = String(t[k] || "").trim().slice(0, 5); });
    return out;
  }

  let inflight = null;

  async function load() {
    const cached = readCache();
    if (cached) return cached;
    if (inflight) return inflight;

    inflight = (async () => {
      let loc = await browserLocation();
      if (!loc) loc = await ipLocation();
      if (!loc) loc = FALLBACK_PLACE;
      try {
        const times = await fetchTimings(loc);
        writeCache(times);
        return times;
      } catch (e) {
        return FALLBACK_TIMES;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  window.ICPCPrayer = { load, ORDER, SPEC, effective, toMins, toHHMM, FALLBACK: FALLBACK_TIMES };
})();
