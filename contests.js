(function () {
  "use strict";

  const REMIND_STORE = "icpc_contest_reminders";
  const LEAD_STORE = "icpc_contest_lead";
  const CLIST_STORE = "icpc_clist_key";

  const PLATFORMS = {
    cf: { label: "Codeforces", short: "CF" },
    cc: { label: "CodeChef", short: "CC" },
    ac: { label: "AtCoder", short: "AC" },
    lc: { label: "LeetCode", short: "LC" },
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let reminders = new Set();
  try { reminders = new Set(JSON.parse(localStorage.getItem(REMIND_STORE) || "[]")); } catch (e) {}
  function persistReminders() { localStorage.setItem(REMIND_STORE, JSON.stringify([...reminders])); }

  let leadMinutes = parseInt(localStorage.getItem(LEAD_STORE) || "30", 10);
  if (!Number.isFinite(leadMinutes)) leadMinutes = 30;

  let contests = [];
  let timers = [];

  const listEl = document.getElementById("contestList");
  const statusEl = document.getElementById("contestStatus");
  const leadEl = document.getElementById("contestLead");
  const notifyBtn = document.getElementById("contestNotifyBtn");

  // ---------- Fetching ----------
  // Codeforces serves CORS headers, so it is queried directly. CodeChef's API does not,
  // so it goes through a public read-only CORS proxy. AtCoder and LeetCode block both
  // direct and proxied browser requests, so their fixed weekly rounds are generated
  // locally and flagged as scheduled rather than fetched.
  const PROXY = "https://api.allorigins.win/raw?url=";

  async function fetchJson(url, timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || 12000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      throw new Error(err.name === "AbortError" ? "timed out" : err.message);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCodeforces() {
    const json = await fetchJson("https://codeforces.com/api/contest.list?gym=false");
    if (json.status !== "OK") throw new Error(json.comment || "API error");
    return json.result
      .filter(c => c.phase === "BEFORE" && c.startTimeSeconds)
      .map(c => ({
        id: "cf-" + c.id,
        platform: "cf",
        name: c.name,
        url: "https://codeforces.com/contest/" + c.id,
        start: new Date(c.startTimeSeconds * 1000),
        durationSec: c.durationSeconds,
      }));
  }

  async function fetchCodeChef() {
    const target = "https://www.codechef.com/api/list/contests/all";
    const json = await fetchJson(PROXY + encodeURIComponent(target), 20000);
    const future = (json && json.future_contests) || [];
    return future
      .map(c => {
        const start = new Date(c.contest_start_date_iso);
        const end = new Date(c.contest_end_date_iso);
        if (isNaN(start)) return null;
        return {
          id: "cc-" + c.contest_code,
          platform: "cc",
          name: c.contest_name,
          url: "https://www.codechef.com/" + c.contest_code,
          start,
          durationSec: isNaN(end) ? 0 : Math.round((end - start) / 1000),
        };
      })
      .filter(Boolean);
  }

  // clist.by mirrors every platform and allows browser access (it returns
  // Access-Control-Allow-Origin: *), so one authenticated call covers all four.
  // Optional: without credentials we fall back to the per-platform sources below.
  const CLIST_RESOURCE = {
    "codeforces.com": "cf",
    "codechef.com": "cc",
    "atcoder.jp": "ac",
    "leetcode.com": "lc",
  };

  // Personal clist.by credentials, used unless overridden in the Contests tab.
  // Clearing the field stores "" and disables clist entirely (null !== "").
  const CLIST_DEFAULT = "Depressed_C0der:21e4a9df3c1dba2d885570b175d9ad4ac1d864bc";

  function clistCred() {
    const stored = localStorage.getItem(CLIST_STORE);
    const raw = (stored === null ? CLIST_DEFAULT : stored).trim();
    const i = raw.indexOf(":");
    if (i < 1) return null;
    return { user: raw.slice(0, i).trim(), key: raw.slice(i + 1).trim() };
  }

  function clistPlatform(resource) {
    // v4 returns `resource` as a host string on some plans and an object on others.
    const host = typeof resource === "string" ? resource : (resource && (resource.name || resource.host)) || "";
    return CLIST_RESOURCE[host] || null;
  }

  async function fetchClist(cred) {
    const from = new Date(Date.now() - 3600000).toISOString().slice(0, 19);
    const url = "https://clist.by/api/v4/contest/?" + [
      "resource__in=" + encodeURIComponent(Object.keys(CLIST_RESOURCE).join(",")),
      "start__gte=" + encodeURIComponent(from),
      "order_by=start",
      "limit=60",
      "format=json",
      "username=" + encodeURIComponent(cred.user),
      "api_key=" + encodeURIComponent(cred.key),
    ].join("&");

    const json = await fetchJson(url, 15000);
    const rows = json.objects || json.results || [];
    return rows
      .map(c => {
        const platform = clistPlatform(c.resource);
        if (!platform) return null;
        // clist timestamps are UTC but carry no timezone marker.
        const start = new Date(/[Z+]/.test(c.start) ? c.start : c.start + "Z");
        const end = new Date(/[Z+]/.test(c.end) ? c.end : c.end + "Z");
        if (isNaN(start)) return null;
        return {
          id: platform + "-clist-" + (c.id || c.href || c.event),
          platform,
          name: c.event,
          url: c.href,
          start,
          durationSec: isNaN(end) ? 0 : Math.round((end - start) / 1000),
        };
      })
      .filter(Boolean);
  }

  // Fixed weekly rounds, generated locally. Times are the platforms' long-standing slots.
  function weeklyRounds(opts) {
    const out = [];
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), opts.hourUTC, opts.minuteUTC, 0, 0));
    while (next.getUTCDay() !== opts.weekdayUTC) next.setUTCDate(next.getUTCDate() + 1);
    if (next.getTime() < Date.now()) next.setUTCDate(next.getUTCDate() + 7);
    for (let i = 0; i < (opts.count || 6); i++) {
      const start = new Date(next.getTime() + i * 7 * 86400000);
      out.push({
        id: opts.platform + "-sched-" + start.toISOString().slice(0, 10),
        platform: opts.platform,
        name: opts.name,
        url: opts.url,
        start,
        durationSec: opts.durationSec,
        scheduled: true,
      });
    }
    return out;
  }

  const SCHEDULES = {
    cc: {
      platform: "cc", name: "CodeChef Starters (weekly slot)",
      url: "https://www.codechef.com/contests",
      weekdayUTC: 3, hourUTC: 14, minuteUTC: 30, durationSec: 120 * 60,
    },
    ac: {
      platform: "ac", name: "AtCoder Beginner Contest (weekly slot)",
      url: "https://atcoder.jp/contests/",
      weekdayUTC: 6, hourUTC: 12, minuteUTC: 0, durationSec: 100 * 60,
    },
    lc: {
      platform: "lc", name: "LeetCode Weekly Contest (weekly slot)",
      url: "https://leetcode.com/contest/",
      weekdayUTC: 0, hourUTC: 2, minuteUTC: 30, durationSec: 90 * 60,
    },
  };

  // Fill in only the platforms we could not fetch live.
  function generatedRounds(livePlatforms) {
    return Object.keys(SCHEDULES)
      .filter(p => !livePlatforms.has(p))
      .reduce((acc, p) => acc.concat(weeklyRounds(SCHEDULES[p])), []);
  }

  function applyAndRender(live, livePlatforms) {
    const seen = new Set();
    contests = live
      .concat(generatedRounds(livePlatforms))
      .filter(c => c.start.getTime() > Date.now())
      .filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)))
      .sort((a, b) => a.start - b.start);
    render();
    scheduleAll();
  }

  async function loadContests() {
    statusEl.textContent = "Fetching upcoming contests…";
    statusEl.className = "contest-status loading";
    listEl.innerHTML = "";

    const failed = [];
    const livePlatforms = new Set();
    let live = [];

    // With a clist.by key one call covers all four platforms, so prefer it outright.
    const cred = clistCred();
    if (cred) {
      try {
        const rows = await fetchClist(cred);
        rows.forEach(c => livePlatforms.add(c.platform));
        live = live.concat(rows);
        applyAndRender(live, livePlatforms);
      } catch (e) {
        failed.push("clist.by (" + e.message + ")");
      }
    }

    // Start both, but paint as soon as Codeforces lands so a slow proxy never blocks the UI.
    const cfPromise = livePlatforms.has("cf") ? null : fetchCodeforces();
    const ccPromise = livePlatforms.has("cc") ? null : fetchCodeChef();
    if (ccPromise) ccPromise.catch(() => {});

    if (!cfPromise && !ccPromise) {
      applyAndRender(live, livePlatforms);
      finishStatus(live, livePlatforms, failed);
      return;
    }

    if (cfPromise) {
      try {
        live = live.concat(await cfPromise);
        livePlatforms.add("cf");
      } catch (e) {
        failed.push("Codeforces (" + e.message + ")");
      }
      applyAndRender(live, livePlatforms);
    }

    if (ccPromise) {
      try {
        live = live.concat(await ccPromise);
        livePlatforms.add("cc");
      } catch (e) {
        failed.push("CodeChef (" + e.message + ")");
      }
      applyAndRender(live, livePlatforms);
    }

    finishStatus(live, livePlatforms, failed);
  }

  function finishStatus(live, livePlatforms, failed) {
    const liveCount = contests.filter(c => !c.scheduled).length;
    const generated = Object.keys(SCHEDULES).filter(p => !livePlatforms.has(p))
      .map(p => PLATFORMS[p].label);
    const note = generated.length
      ? " " + generated.join(", ") + " block browser requests, so their regular weekly slots are shown instead — add a clist.by key below to get them live."
      : "";

    if (!livePlatforms.size) {
      statusEl.className = "contest-status error";
      statusEl.textContent = "No live source reachable" + (failed.length ? " — " + failed.join("; ") : "") +
        ". Showing regular weekly slots only." +
        (location.protocol === "file:" ? " Opening this page over http:// instead of file:// usually fixes CORS blocking." : "");
      return;
    }
    statusEl.className = "contest-status " + (failed.length || generated.length ? "warn" : "ok");
    statusEl.textContent = "Showing the next contest · " + liveCount + " fetched live from " +
      [...livePlatforms].map(p => PLATFORMS[p].label).join(", ") + " · updated " +
      new Date().toLocaleTimeString() + "." +
      (failed.length ? " Failed: " + failed.join("; ") + "." : "") + note;
  }

  // ---------- Formatting ----------
  function fmtDuration(sec) {
    if (!sec) return "—";
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h ? h + "h" + (m ? " " + m + "m" : "") : m + "m";
  }

  function fmtCountdown(ms) {
    if (ms <= 0) return "starting now";
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    if (d) return d + "d " + h + "h";
    if (h) return h + "h " + m + "m";
    return m + "m " + ss + "s";
  }

  function activePlatforms() {
    return new Set([...document.querySelectorAll(".plat-toggle input:checked")].map(i => i.value));
  }

  // ---------- Calendar export ----------
  function icsEscape(s) { return String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n"); }
  function icsStamp(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

  function downloadIcs(c) {
    const end = new Date(c.start.getTime() + (c.durationSec || 7200) * 1000);
    const body = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ICPC Tracker//Contest Reminder//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + c.id + "@icpc-tracker",
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART:" + icsStamp(c.start),
      "DTEND:" + icsStamp(end),
      "SUMMARY:" + icsEscape("[" + PLATFORMS[c.platform].short + "] " + c.name),
      "DESCRIPTION:" + icsEscape(PLATFORMS[c.platform].label + " contest\n" + (c.url || "")),
      "URL:" + icsEscape(c.url || ""),
      "BEGIN:VALARM", "ACTION:DISPLAY",
      "DESCRIPTION:" + icsEscape(c.name + " starts in " + leadMinutes + " minutes"),
      "TRIGGER:-PT" + leadMinutes + "M",
      "END:VALARM", "END:VEVENT", "END:VCALENDAR", "",
    ].join("\r\n");

    const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Notifications ----------
  function updateNotifyBtn() {
    if (!("Notification" in window)) {
      notifyBtn.textContent = "Notifications unsupported";
      notifyBtn.disabled = true;
      return;
    }
    const p = Notification.permission;
    notifyBtn.textContent = p === "granted" ? "Notifications on" : p === "denied" ? "Notifications blocked" : "Enable notifications";
    notifyBtn.disabled = p !== "default";
  }

  // Only the very next contest is shown, so that is also the only one we schedule for.
  // `contests` is kept sorted ascending, so the first still-future match wins.
  function visibleContests() {
    const active = activePlatforms();
    const now = Date.now();
    const next = contests.find(c => active.has(c.platform) && c.start.getTime() > now);
    return next ? [next] : [];
  }

  function scheduleAll() {
    timers.forEach(clearTimeout);
    timers = [];
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    visibleContests().forEach(c => {
      if (!reminders.has(c.id)) return;
      const fireAt = c.start.getTime() - leadMinutes * 60000;
      const delay = fireAt - now;
      if (delay <= 0 || delay > 2147483647) return;
      timers.push(setTimeout(() => {
        new Notification(PLATFORMS[c.platform].label + " starts in " + leadMinutes + " min", {
          body: c.name,
          tag: c.id,
        });
      }, delay));
    });
  }

  // ---------- Render ----------
  function render() {
    const now = Date.now();
    const list = visibleContests();

    listEl.innerHTML = "";
    if (!list.length) {
      if (contests.length) listEl.innerHTML = '<p class="empty-note">No upcoming contests for the selected platforms.</p>';
      document.dispatchEvent(new CustomEvent("icpc:nextcontest", { detail: null }));
      return;
    }

    let lastDay = "";
    list.forEach(c => {
      const dayKey = c.start.toDateString();
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        const h = document.createElement("h3");
        h.className = "contest-day";
        const isToday = dayKey === new Date().toDateString();
        h.textContent = (isToday ? "Today · " : "") + c.start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        listEl.appendChild(h);
      }

      const row = document.createElement("article");
      row.className = "contest-row";
      row.dataset.start = c.start.getTime();

      row.innerHTML =
        '<span class="plat-badge plat-' + c.platform + '">' + PLATFORMS[c.platform].short + "</span>" +
        '<div class="contest-main">' +
          '<a class="contest-name" href="' + esc(c.url || "#") + '" target="_blank" rel="noopener noreferrer">' + esc(c.name) + "</a>" +
          '<div class="contest-meta">' +
            "<span>" + esc(c.start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })) + "</span>" +
            "<span>" + fmtDuration(c.durationSec) + "</span>" +
            '<span class="contest-cd mono">' + fmtCountdown(c.start.getTime() - now) + "</span>" +
            (c.scheduled ? '<span class="contest-tag">recurring slot — verify on site</span>' : "") +
          "</div>" +
        "</div>";

      const actions = document.createElement("div");
      actions.className = "contest-actions";

      const remindBtn = document.createElement("button");
      remindBtn.type = "button";
      remindBtn.className = "btn" + (reminders.has(c.id) ? " on" : "");
      remindBtn.textContent = reminders.has(c.id) ? "Reminder on" : "Remind me";
      remindBtn.addEventListener("click", async () => {
        if (!reminders.has(c.id)) {
          if ("Notification" in window && Notification.permission === "default") {
            await Notification.requestPermission();
            updateNotifyBtn();
          }
          reminders.add(c.id);
        } else {
          reminders.delete(c.id);
        }
        persistReminders();
        remindBtn.className = "btn" + (reminders.has(c.id) ? " on" : "");
        remindBtn.textContent = reminders.has(c.id) ? "Reminder on" : "Remind me";
        scheduleAll();
      });

      const icsBtn = document.createElement("button");
      icsBtn.type = "button";
      icsBtn.className = "btn";
      icsBtn.textContent = "Calendar";
      icsBtn.title = "Download .ics — adds the contest with a " + leadMinutes + "-minute alarm to your calendar app";
      icsBtn.addEventListener("click", () => downloadIcs(c));

      actions.appendChild(remindBtn);
      actions.appendChild(icsBtn);
      row.appendChild(actions);
      listEl.appendChild(row);
    });

    // The Routine tab builds its Contest Day card backwards from this.
    document.dispatchEvent(new CustomEvent("icpc:nextcontest", { detail: list[0] || null }));
  }

  function tickCountdowns() {
    const now = Date.now();
    let started = false;
    document.querySelectorAll(".contest-row").forEach(row => {
      const start = Number(row.dataset.start);
      if (start <= now) started = true;
      const el = row.querySelector(".contest-cd");
      if (el) el.textContent = fmtCountdown(start - now);
    });
    // The shown contest has begun — roll forward to the next one.
    if (started) { render(); scheduleAll(); }
  }

  // ---------- Wiring ----------
  function pushSetting(patch) {
    const sync = window.ICPCSettings && window.ICPCSettings.onChange;
    if (typeof sync === "function") sync(patch);
  }

  leadEl.value = String(leadMinutes);
  leadEl.addEventListener("change", () => {
    leadMinutes = parseInt(leadEl.value, 10) || 30;
    localStorage.setItem(LEAD_STORE, String(leadMinutes));
    pushSetting({ contest_lead_min: leadMinutes });
    scheduleAll();
    render();
  });

  // Lead time and the user's own clist.by credentials come from the account.
  document.addEventListener("icpc:settings", e => {
    const d = e.detail || {};
    if (d.contest_lead_min) {
      leadMinutes = d.contest_lead_min;
      localStorage.setItem(LEAD_STORE, String(leadMinutes));
      leadEl.value = String(leadMinutes);
    }
    if (typeof d.clist_credentials === "string" && d.clist_credentials.trim()) {
      localStorage.setItem(CLIST_STORE, d.clist_credentials.trim());
      if (clistInput) clistInput.value = d.clist_credentials.trim();
    }
    if (loaded) loadContests();
  });

  document.querySelectorAll(".plat-toggle input").forEach(i => i.addEventListener("change", render));
  document.getElementById("contestRefreshBtn").addEventListener("click", loadContests);

  const clistInput = document.getElementById("clistKey");
  const storedClist = localStorage.getItem(CLIST_STORE);
  clistInput.value = storedClist === null ? CLIST_DEFAULT : storedClist;
  let clistTimer;
  clistInput.addEventListener("input", () => {
    localStorage.setItem(CLIST_STORE, clistInput.value.trim());
    pushSetting({ clist_credentials: clistInput.value.trim() });
    clearTimeout(clistTimer);
    // Re-fetch once typing settles, so pasting a key takes effect without a click.
    clistTimer = setTimeout(() => { if (loaded) loadContests(); }, 900);
  });

  notifyBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    await Notification.requestPermission();
    updateNotifyBtn();
    scheduleAll();
  });

  updateNotifyBtn();
  setInterval(tickCountdowns, 1000);

  // Load lazily: only hit the network once the tab is actually opened.
  let loaded = false;
  document.querySelector('.tab[data-tab="contests"]').addEventListener("click", () => {
    if (loaded) return;
    loaded = true;
    loadContests();
  });
})();
