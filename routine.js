/*
 * Routine tab — one auto-computed day, on a real clock.
 *
 * There is no "grind day" and "contest day" to choose between any more. The
 * schedule is built fresh every time from three inputs — the day-start time,
 * today's prayer times, and whichever contest the Contests tab found — and
 * whether it is a contest day is simply whether a contest exists.
 *
 * The build is priority-then-fill, and the order is the whole design:
 *
 *   1. The contest goes down first, at its real start, for its real length,
 *      with the post-mortem welded to its finish. You can move dinner; you
 *      cannot move a Codeforces round.
 *   2. Prayers next, at today's actual times. One that clashes with the contest
 *      nudges *earlier* so it finishes as the round begins — sliding it later
 *      like everything else would throw Isha past midnight over a three-minute
 *      overlap.
 *   3. Then the morning, lunch, dinner and review, each sliding later if
 *      something with a stronger claim already holds the slot.
 *   4. Whatever is left is measured, and the practice pools — theory,
 *      curriculum, upsolve, revision — are poured into those gaps first-fit,
 *      never in slivers under 30 minutes.
 *
 * A late contest therefore eats into practice by itself instead of producing an
 * impossible 13-hour study block, dinner still lands before the round rather
 * than at 00:40, and the daily targets show exactly how much of each category
 * actually survived the day.
 */
(function () {
  "use strict";

  const STORE = "icpc_day_start";
  const DEFAULT_START = 360;      // 06:00
  const DAY_LENGTH = 1050;        // 17h30m awake, so sleep gets 6h30m
  const MIN_BLOCK = 30;           // never schedule a sliver of practice
  const PREP_MIN = 30;            // pre-contest reset, when there is room for one
  const POSTMORTEM_MIN = 90;      // starts the moment the contest ends

  const CATEGORIES = {
    THEORY:     { label: "Theory",      color: "#38bdf8", target: 120 },
    PRACTICE:   { label: "Curriculum",  color: "#06b6d4", target: 330 },
    UPSOLVE:    { label: "Upsolve",     color: "#22c55e", target: 150 },
    REVISION:   { label: "Revision",    color: "#f59e0b", target: 120 },
    CONTEST:    { label: "Contest",     color: "#ef4444", target: null },
    POSTMORTEM: { label: "Post-mortem", color: "#f472b6", target: null },
    WARMUP:     { label: "Warm-up",     color: "#a3a3a3", target: null },
    REVIEW:     { label: "Review",      color: "#8b5cf6", target: null },
    PRAYER:     { label: "Prayer",      color: "#a78bfa", target: null },
    MEAL:       { label: "Meal",        color: "#fb923c", target: null },
    BREAK:      { label: "Break",       color: "#64748b", target: null },
    SLEEP:      { label: "Sleep",       color: "#475569", target: null },
  };

  // Poured into the gaps, in this order. Totals 12h, which is what is left of a
  // 17h30m day once prayers, meals, warm-up and review are taken out.
  const POOLS = [
    { id: "theory",   category: "THEORY",   activity: "Theory &amp; template library", mins: 120,
      note: "Read the day's sub-topic, extend your own snippets for it." },
    { id: "prac1",    category: "PRACTICE", activity: "Curriculum practice", mins: 150,
      note: "This week's block, checklist top to bottom: easy → normal → hard." },
    { id: "prac2",    category: "PRACTICE", activity: "Curriculum practice", mins: 120,
      note: "Keep going down the same section." },
    { id: "prac3",    category: "PRACTICE", activity: "Curriculum practice", mins: 60,
      note: "Finish the section or start the next tier." },
    { id: "upsolve1", category: "UPSOLVE",  activity: "Upsolve / backlog", mins: 90,
      note: "Anything unsolved from yesterday, or stuck >45 min today." },
    { id: "upsolve2", category: "UPSOLVE",  activity: "Upsolve / backlog", mins: 60,
      note: "Editorial allowed now — read it, close it, re-implement from blank." },
    { id: "revision", category: "REVISION", activity: "Revision (flagged)", mins: 120,
      note: "Re-solve what you flagged in earlier weeks. No hints." },
  ];

  // A contest costs roughly 3h45m of the day once prep and the post-mortem are
  // counted, so the pools give that back rather than overflowing the evening.
  const CONTEST_TRIM = { prac1: 90, prac3: 60, revision: 60, theory: 30 };

  let dayStart = readStored();
  let nextContest = null;
  let prayer = null;
  let schedule = [];
  let tickTimer = null;

  // ------------------------------------------------------------------ utils --
  function readStored() {
    const raw = parseInt(localStorage.getItem(STORE), 10);
    return Number.isFinite(raw) && raw >= 0 && raw <= 1439 ? raw : DEFAULT_START;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function clock(min) {
    const w = ((min % 1440) + 1440) % 1440;
    const d = new Date(2000, 0, 1, Math.floor(w / 60), w % 60);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function hhmm(min) {
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }

  function parseHHMM(s) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s || ""));
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  function dur(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + "h " + m + "m";
    if (h) return h + "h";
    return m + "m";
  }

  function nowMins() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  // Everything is measured from the start of the training day, so a block after
  // midnight is simply a larger number rather than a wrap-around special case.
  function fromDayStart(min) {
    return min < dayStart ? min + 1440 : min;
  }

  // ------------------------------------------------------------------ build --
  // Places a block at its preferred time, sliding it later if something with a
  // stronger claim is already there. Priority is the order blocks are placed
  // in, which is why build() lays the contest down before anything else: you
  // can move dinner, you cannot move a Codeforces round.
  function clashes(list, at, len) {
    return list.find(o => at < o.to && at + len > o.from);
  }

  function place(list, from, len, block) {
    let at = from;
    for (let guard = 0; guard < 60; guard++) {
      const hit = clashes(list, at, len);
      if (!hit) break;
      at = hit.to;
    }
    const row = Object.assign({ from: at, to: at + len }, block);
    list.push(row);
    return row;
  }

  // Prayers clash with a contest by minutes but must not be thrown hours later
  // because of it — a three-minute overlap with a 20:35 round would otherwise
  // push Isha past midnight. Nudging earlier, so the prayer finishes as the
  // contest begins, is what a person actually does.
  function placePreferEarlier(list, from, len, block) {
    const hit = clashes(list, from, len);
    if (hit && hit.from >= from) {
      const earlier = hit.from - len;
      if (earlier >= dayStart && !clashes(list, earlier, len)) {
        const row = Object.assign({ from: earlier, to: hit.from }, block);
        list.push(row);
        return row;
      }
    }
    return place(list, from, len, block);
  }

  function layout() {
    const rows = [];
    const end = dayStart + DAY_LENGTH;
    const p = prayer || {};

    // 1. The contest and everything welded to it.
    contestRows().forEach(r => rows.push(r));

    // 2. Prayers, at their real times. A prayer that lands inside the contest
    //    slides to just after it rather than being drawn on top of it.
    const fajrAt = parseHHMM(p.Fajr) != null ? fromDayStart(parseHHMM(p.Fajr)) : null;
    const fajrOwn = fajrAt != null && fajrAt >= dayStart && fajrAt < dayStart + 180;
    if (fajrOwn) placePreferEarlier(rows, fajrAt, 20, { category: "PRAYER", activity: "Fajr prayer" });

    const prayerAt = (key, label, len, fallbackOffset) => {
      const raw = parseHHMM(p[key]);
      let at = raw != null ? fromDayStart(raw) : dayStart + fallbackOffset;
      if (at < dayStart || at > end) at = dayStart + fallbackOffset;
      return placePreferEarlier(rows, at, len, { category: "PRAYER", activity: label });
    };
    const dhuhr = prayerAt("Dhuhr", "Dhuhr prayer", 30, 360);
    prayerAt("Asr", "Asr prayer", 30, 570);
    prayerAt("Maghrib", "Maghrib prayer", 20, 735);
    prayerAt("Isha", "Isha prayer", 30, 870);

    // The pre-contest reset takes whatever room is left in front of the round.
    // If a prayer already fills it, that prayer *is* the reset — better than
    // inventing a block that has nowhere to go.
    const round = rows.find(r => r.category === "CONTEST");
    if (round) {
      let gapStart = round.from - PREP_MIN;
      rows.forEach(o => {
        if (o !== round && o.to > gapStart && o.from < round.from) gapStart = Math.max(gapStart, o.to);
      });
      if (round.from - gapStart >= 10) {
        rows.push({
          from: gapStart, to: round.from, category: "BREAK", activity: "Pre-contest reset",
          note: "Skim your template library, stretch, no new topics.",
        });
      }
    }

    // 3. The morning, anchored to the day start.
    place(rows, dayStart, 30, {
      category: "WARMUP",
      activity: fajrOwn ? "Warm-up" : "Fajr &amp; warm-up",
      note: "1–2 easy, already-comfortable problems. 15-min cap each.",
    });
    place(rows, dayStart + 30, 30, { category: "MEAL", activity: "Breakfast" });

    // 4. Meals that hang off something else. Dinner takes the latest free half
    //    hour that still falls inside the day: sliding it forward like every
    //    other block would serve it at 00:40 on the night of a late contest.
    place(rows, dhuhr.to, 30, { category: "MEAL", activity: "Lunch" });
    const slot = freeSlots(rows).filter(g => g.from < end).pop();
    if (slot) {
      const at = Math.max(slot.from, Math.min(end - 30, slot.to - 30));
      rows.push({ from: at, to: at + 30, category: "MEAL", activity: "Dinner" });
    } else {
      place(rows, end - 30, 30, { category: "MEAL", activity: "Dinner" });
    }

    // 5. Review closes the day. Its normal slot is the last hour, but ordinary
    //    sliding is enough to carry it past a post-mortem that ran to 00:10.
    place(rows, end - 60, 30, {
      category: "REVIEW", activity: "Review &amp; log",
      note: "Update the tracker, 2–3 lines on what tripped you up, flag what to revisit.",
    });

    // 6. Sleep takes whatever is left before the next day starts.
    const wake = dayStart + 1440;
    const lastEnd = rows.reduce((m, r) => Math.max(m, r.to), end);
    if (wake - lastEnd >= 30) {
      rows.push({ from: lastEnd, to: wake, category: "SLEEP", activity: "Sleep" });
    }
    return rows;
  }

  function contestRows() {
    if (!nextContest || !nextContest.start) return [];
    const s = nextContest.start;
    const at = fromDayStart(s.getHours() * 60 + s.getMinutes());
    const len = Math.max(30, Math.round((nextContest.durationSec || 0) / 60)) || 120;
    const end = at + len;
    const label = nextContest.name || "Live contest";

    return [
      { from: at, to: end, category: "CONTEST", activity: label, live: true,
        url: nextContest.url,
        note: "Full focus, no outside help. Treat every minute like the real thing." },
      { from: end, to: end + POSTMORTEM_MIN,
        category: "POSTMORTEM", activity: "Upsolve &amp; editorial review",
        note: "Finish what you didn't solve live. Editorial only after your own attempt." },
    ];
  }

  // Gaps left between the fixed blocks, big enough to be worth using.
  function freeSlots(taken) {
    const merged = [];
    taken.slice().sort((a, b) => a.from - b.from).forEach(seg => {
      const last = merged[merged.length - 1];
      if (last && seg.from <= last.to) last.to = Math.max(last.to, seg.to);
      else merged.push({ from: seg.from, to: seg.to });
    });

    const gaps = [];
    let cursor = dayStart;
    const end = dayStart + DAY_LENGTH;
    merged.forEach(seg => {
      if (seg.from - cursor >= MIN_BLOCK) gaps.push({ from: cursor, to: seg.from });
      cursor = Math.max(cursor, seg.to);
    });
    if (end - cursor >= MIN_BLOCK) gaps.push({ from: cursor, to: end });
    return gaps;
  }

  function pourPractice(pools, gaps) {
    const rows = [];
    let gi = 0;
    let cursor = gaps.length ? gaps[0].from : dayStart;

    pools.forEach(pool => {
      let left = pool.mins;
      while (left >= MIN_BLOCK && gi < gaps.length) {
        const avail = gaps[gi].to - cursor;
        if (avail < MIN_BLOCK) {
          gi++;
          if (gi < gaps.length) cursor = gaps[gi].from;
          continue;
        }
        const take = Math.min(left, avail);
        if (take < MIN_BLOCK) break;
        rows.push({
          from: cursor, to: cursor + take,
          category: pool.category, activity: pool.activity, note: pool.note,
        });
        cursor += take;
        left -= take;
      }
    });
    return rows;
  }

  function build() {
    const fixed = layout();
    const isContestDay = fixed.some(r => r.category === "CONTEST");

    let pools = POOLS.map(p => Object.assign({}, p));
    if (isContestDay) {
      pools = pools
        .map(p => CONTEST_TRIM[p.id] ? Object.assign({}, p, { mins: p.mins - CONTEST_TRIM[p.id] }) : p)
        .filter(p => p.mins >= MIN_BLOCK);
    }

    const practice = pourPractice(pools, freeSlots(fixed));

    // The pools rarely add up to exactly the free time — on a contest day they
    // deliberately fall short. Whatever is still uncovered is named as slack
    // instead of being left as a silent hole in the timetable.
    const placed = fixed.concat(practice);
    const slack = freeSlots(placed).map(g => ({
      from: g.from, to: g.to, category: "BREAK", activity: "Open / flex",
      note: "Rest, eat properly, or clear backlog — nothing new you can't finish.",
    }));

    schedule = placed.concat(slack).sort((a, b) => a.from - b.from);

    // Slivers narrower than a usable block are left over by the pour. Rather
    // than render them as one-line "breaks", the preceding block simply runs on
    // — the timetable then has no unexplained holes at all.
    for (let i = 1; i < schedule.length; i++) {
      const prev = schedule[i - 1], next = schedule[i];
      const gap = next.from - prev.to;
      if (gap <= 0 || gap >= MIN_BLOCK) continue;
      // A contest's length is a fact about the world, not spare room to absorb
      // a gap, so the following block starts earlier instead.
      if (prev.category === "CONTEST") next.from = prev.to;
      else prev.to = next.from;
    }
    return isContestDay;
  }

  // ----------------------------------------------------------------- render --
  function totals() {
    const out = {};
    Object.keys(CATEGORIES).forEach(k => { out[k] = 0; });
    schedule.forEach(b => { out[b.category] = (out[b.category] || 0) + (b.to - b.from); });
    return out;
  }

  function sleepMins() {
    return schedule.filter(b => b.category === "SLEEP").reduce((a, b) => a + (b.to - b.from), 0);
  }

  function statusOf(b, now) {
    if (now >= b.to) return "done";
    if (now >= b.from) return "now";
    return "soon";
  }

  function rowHtml(b, now) {
    const cat = CATEGORIES[b.category] || { label: b.category, color: "#94a3b8" };
    const st = statusOf(b, now);
    const left = Math.max(0, Math.ceil(b.to - now));
    const pct = st === "done" ? 100
      : st === "now" ? Math.round(100 * (now - b.from) / Math.max(1, b.to - b.from))
      : 0;

    return '<tr class="rt-row is-' + st + '" data-from="' + b.from + '" data-to="' + b.to + '">' +
      '<td class="rt-time">' + esc(clock(b.from)) + " – " + esc(clock(b.to)) + "</td>" +
      '<td><span class="rt-cat" style="--cat:' + cat.color + '">' + esc(cat.label) + "</span></td>" +
      '<td class="rt-act"><strong>' + b.activity + "</strong>" +
        (b.url ? ' <a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer">Open ↗</a>' : "") +
        (b.note ? "<span>" + b.note + "</span>" : "") + "</td>" +
      '<td class="rt-dur">' + esc(dur(b.to - b.from)) + "</td>" +
      '<td class="rt-status">' +
        (st === "done" ? '<span class="rt-done">Done</span>'
         : st === "now" ? '<span class="rt-now">Now</span><i>' + dur(left) + " left</i>"
         : '<span class="rt-soon">Upcoming</span>') + "</td>" +
      '<td class="rt-prog"><span class="bar"><i style="width:' + pct + '%"></i></span></td>' +
    "</tr>";
  }

  function targetsHtml() {
    const t = totals();
    return Object.keys(CATEGORIES)
      .filter(k => CATEGORIES[k].target)
      .map(k => {
        const c = CATEGORIES[k];
        const got = t[k] || 0;
        const pct = Math.min(100, Math.round(100 * got / c.target));
        return '<div class="rt-target">' +
          '<span class="rt-target-name" style="--cat:' + c.color + '">' + esc(c.label) + "</span>" +
          '<span class="rt-target-val mono">' + esc(dur(got)) +
            ' <i>/ ' + esc(dur(c.target)) + "</i></span>" +
          '<span class="bar"><i style="width:' + pct + '%;background:' + c.color + '"></i></span>' +
        "</div>";
      }).join("");
  }

  function render() {
    const host = document.getElementById("routineBody");
    if (!host) return;

    const isContestDay = build();
    const now = nowMins();
    const end = dayStart + DAY_LENGTH;
    const elapsed = Math.min(100, Math.max(0, Math.round(100 * (fromDayStart(now) - dayStart) / DAY_LENGTH)));

    const prayerStrip = prayer
      ? '<div class="rt-prayer">' +
          window.ICPCPrayer.ORDER.map(k =>
            '<span><b>' + esc(k) + "</b>" + esc(clock(parseHHMM(prayer[k]) || 0)) + "</span>").join("") +
          '<span class="rt-prayer-src">' +
            (prayer.estimated ? "estimated — location unavailable" : esc(prayer.place || "")) + "</span>" +
        "</div>"
      : '<div class="rt-prayer is-loading"><span>Loading prayer times…</span></div>';

    host.innerHTML =
      '<div class="rt-head">' +
        "<div>" +
          "<h2>Today's Schedule</h2>" +
          '<p class="rt-sub">Built from your day start, today\'s prayer times and the next contest. ' +
            "Rebuilds itself when any of those change.</p>" +
        "</div>" +
        '<div class="rt-badges">' +
          (isContestDay
            ? '<span class="rt-badge is-contest">Contest day — auto-detected</span>'
            : '<span class="rt-badge">Practice day</span>') +
          // A late round genuinely costs sleep. Better to say so than to let the
          // timetable quietly imply five hours is the plan.
          (sleepMins() < 360
            ? '<span class="rt-badge is-warn">Only ' + esc(dur(sleepMins())) + " sleep tonight</span>"
            : "") +
          '<span class="rt-badge">' + elapsed + "% of day elapsed</span>" +
        "</div>" +
      "</div>" +

      prayerStrip +

      '<div class="daystart-bar">' +
        '<label for="dayStartInput">My day starts at</label>' +
        '<input type="time" id="dayStartInput" class="day-start-input" step="900" value="' + hhmm(dayStart) + '">' +
        '<span class="daystart-note">Ends ' + esc(clock(end)) + " · " +
          esc(dur(DAY_LENGTH)) + " awake, " + esc(dur(1440 - DAY_LENGTH)) + " sleep</span>" +
      "</div>" +

      '<div class="rt-targets"><h3>Today\'s targets</h3>' + targetsHtml() + "</div>" +

      '<div class="rt-wrap"><table class="rt-table">' +
        "<thead><tr><th>Time</th><th>Category</th><th>Activity</th><th>Duration</th><th>Status</th><th>Progress</th></tr></thead>" +
        "<tbody>" + schedule.map(b => rowHtml(b, fromDayStart(now))).join("") + "</tbody>" +
      "</table></div>";
  }

  // Repaint only the volatile parts each minute; rebuilding the whole table
  // would fight with the time input while it is focused.
  function tick() {
    const now = fromDayStart(nowMins());
    document.querySelectorAll(".rt-row").forEach(tr => {
      const from = +tr.dataset.from, to = +tr.dataset.to;
      const st = now >= to ? "done" : now >= from ? "now" : "soon";
      tr.className = "rt-row is-" + st;
      const cell = tr.querySelector(".rt-status");
      if (cell) {
        cell.innerHTML = st === "done" ? '<span class="rt-done">Done</span>'
          : st === "now" ? '<span class="rt-now">Now</span><i>' + dur(Math.max(0, Math.ceil(to - now))) + " left</i>"
          : '<span class="rt-soon">Upcoming</span>';
      }
      const bar = tr.querySelector(".rt-prog i");
      if (bar) {
        bar.style.width = (st === "done" ? 100
          : st === "now" ? Math.round(100 * (now - from) / Math.max(1, to - from)) : 0) + "%";
      }
    });
  }

  // ------------------------------------------------------------------ state --
  function setDayStart(min, opts) {
    const n = Math.max(0, Math.min(1439, parseInt(min, 10) || 0));
    if (n === dayStart && !(opts && opts.force)) return;
    dayStart = n;
    localStorage.setItem(STORE, String(n));
    render();
    if (!(opts && opts.silent)) {
      const sync = window.ICPCSettings && window.ICPCSettings.onChange;
      if (typeof sync === "function") sync({ day_start_min: n });
    }
  }

  document.addEventListener("icpc:settings", e => {
    const d = e.detail || {};
    if (d.day_start_min != null) setDayStart(d.day_start_min, { silent: true });
  });

  document.addEventListener("icpc:nextcontest", e => {
    nextContest = e.detail || null;
    render();
  });

  document.addEventListener("input", e => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("day-start-input")) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(el.value || "");
    if (!m) return;
    setDayStart(parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
  });

  window.ICPCRoutine = {
    setDayStart,
    dayStart: () => dayStart,
    dayStartHHMM: () => hhmm(dayStart),
    schedule: () => schedule.slice(),
    render,
  };

  function boot() {
    render();
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 30000);
    if (window.ICPCPrayer) {
      window.ICPCPrayer.load().then(t => { prayer = t; render(); }).catch(() => {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
