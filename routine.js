/*
 * Routine tab — the two daily schedules, laid out on a real clock.
 *
 * The cards used to be hardcoded markup showing offsets ("+2:45–6:15"), which
 * meant every reader had to do the arithmetic themselves and the Contest Day
 * card silently mixed two conventions: its first rows were offsets from the
 * start of the day, but "+2:00 after" and the trailing "+0:30" were relative to
 * the row above them. Here every block carries explicit minute offsets from a
 * single anchor, and the times you see are wall-clock times.
 *
 * Grind Day anchors to the start of the day. Contest Day anchors *backwards
 * from the contest*: the contest is the fixed point in that day, so the warm-up
 * runs from the day start, the curriculum block stretches to fill whatever is
 * left, and the reset/upsolve/log blocks hang off the real contest window that
 * the Contests tab already knows about. With no contest loaded it falls back to
 * a nominal midday slot and says so.
 */
(function () {
  "use strict";

  const STORE = "icpc_day_start";
  const DEFAULT_START = 360;      // 06:00
  const RESET_MIN = 30;           // pre-contest reset, immediately before start
  const PROBLEM_CAP = 330;        // longest sensible curriculum block, 5h30m
  const UPSOLVE_MIN = 120;        // immediate upsolve, straight after
  const LOG_MIN = 30;             // write the result down
  const FALLBACK_CONTEST = 12 * 60 + 30;  // nominal 12:30 contest when none known
  const FALLBACK_DURATION = 150;

  let dayStart = readStored();
  let nextContest = null;

  function readStored() {
    const raw = parseInt(localStorage.getItem(STORE), 10);
    return Number.isFinite(raw) && raw >= 0 && raw <= 1439 ? raw : DEFAULT_START;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Minutes past midnight -> "6:00 AM", wrapping past 24h.
  function clock(min) {
    const wrapped = ((min % 1440) + 1440) % 1440;
    const d = new Date(2000, 0, 1, Math.floor(wrapped / 60), wrapped % 60);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  // A 14-hour day that starts late genuinely runs into tomorrow, so past-midnight
  // times are flagged — but only once per row. Marking both ends of a row that
  // sits entirely in the next day widened that row's column past every other
  // one and broke the alignment down the card.
  function span(from, to) {
    const nextFrom = from >= 1440, nextTo = to >= 1440;
    const mark = " ⁺¹";
    if (nextFrom) return clock(from) + mark + " – " + clock(to);
    return clock(from) + " – " + clock(to) + (nextTo ? mark : "");
  }

  function hhmm(min) {
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }

  function dur(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + "h " + m + "m";
    if (h) return h + "h";
    return m + "m";
  }

  // ---------------------------------------------------------------- schedules
  function grindBlocks(start) {
    let t = start;
    const at = mins => { const from = t; t += mins; return { from, to: t }; };
    const warm = at(30);
    const theory = at(120);
    t += 15;                       // break
    const problems = at(210);
    t += 15;
    const upsolve = at(120);
    t += 30;
    const review = at(60);

    return [
      Object.assign(warm, { title: "Warm-up", desc: "1–2 easy, already-comfortable problems. 15-min hard cap each — just get your hands moving." }),
      Object.assign(theory, { title: "Theory block", desc: "Read the day's sub-topic, extend your own template/snippet library for it." }),
      Object.assign(problems, { title: "Problem block A + B", desc: "Work today's checklist section top to bottom: easy → normal → hard tier, lunch in the middle." }),
      Object.assign(upsolve, { title: "Upsolve / backlog", desc: "Anything unsolved from yesterday, or stuck >45 min today. Editorial's allowed now — read it, close it, re-implement from a blank file." }),
      Object.assign(review, { title: "Review &amp; log", desc: "Update the tracker, write 2–3 lines on what tripped you up, flag anything to revisit in a week." }),
    ];
  }

  // `contestAt` and `contestFor` are minutes-past-midnight / minutes long, both
  // already converted into the user's local day.
  function contestBlocks(start, contestAt, contestFor) {
    const warm = { from: start, to: start + 30 };
    const resetFrom = contestAt - RESET_MIN;
    const contestEnd = contestAt + contestFor;
    const upsolveEnd = contestEnd + UPSOLVE_MIN;

    const blocks = [
      Object.assign(warm, { title: "Warm-up", desc: "Same as grind day." }),
    ];
    // Curriculum fills the gap between the warm-up and the reset, but capped:
    // stretching it to whatever is left would claim a 13-hour problem block
    // just because the contest happens to start late. Anything beyond the cap
    // is named as slack rather than quietly folded into study time. If the
    // contest is early the block shrinks, and disappears rather than going
    // negative when there is no room at all.
    const free = resetFrom - warm.to;
    if (free > 0) {
      const study = Math.min(free, PROBLEM_CAP);
      blocks.push({
        from: warm.to, to: warm.to + study, title: "Problem blocks",
        desc: "Curriculum work, same topic as the week's focus block, lunch in the middle.",
      });
      if (free - study >= 30) {
        blocks.push({
          from: warm.to + study, to: resetFrom, title: "Open / rest",
          desc: "The contest lands late today. Eat properly, nap, or clear backlog — do not start a new topic you cannot finish.",
        });
      }
    }
    blocks.push(
      { from: resetFrom, to: contestAt, title: "Pre-contest reset", desc: "Skim your template library, stretch, no new topics." },
      { from: contestAt, to: contestEnd, title: "Live contest", live: true,
        desc: "Full focus, no outside help. Treat every minute like the real thing — this is where speed under pressure gets built." },
      { from: contestEnd, to: upsolveEnd, title: "Immediate upsolve", desc: "Finish what you didn't solve live. Editorial only after your own honest attempt." },
      { from: upsolveEnd, to: upsolveEnd + LOG_MIN, title: "Log result", desc: "Rank/rating in one line, so you can see the trend over 16 weeks." }
    );
    return blocks;
  }

  // ------------------------------------------------------------------ render
  function rowHtml(b) {
    return '<div class="sched-row' + (b.live ? " is-live" : "") + '">' +
      '<span class="sched-time"><b>' + esc(span(b.from, b.to)) + "</b>" +
        '<i class="sched-dur">' + esc(dur(b.to - b.from)) + "</i></span>" +
      '<div class="sched-what"><strong>' + b.title + "</strong><span>" + b.desc + "</span></div>" +
    "</div>";
  }

  function render() {
    const grindHost = document.getElementById("schedGrind");
    const contestHost = document.getElementById("schedContest");
    if (!grindHost || !contestHost) return;

    const grind = grindBlocks(dayStart);
    grindHost.innerHTML = grind.map(rowHtml).join("");

    const gSub = document.getElementById("schedGrindSub");
    if (gSub) {
      gSub.textContent = "Mon · Tue · Thu (unless Codeforces lands) · " +
        clock(grind[0].from) + " – " + clock(grind[grind.length - 1].to);
    }

    // Fold the real contest into the local day when one is loaded.
    let at = FALLBACK_CONTEST, len = FALLBACK_DURATION, note;
    if (nextContest && nextContest.start) {
      const s = nextContest.start;
      at = s.getHours() * 60 + s.getMinutes();
      len = Math.max(30, Math.round((nextContest.durationSec || 0) / 60)) || FALLBACK_DURATION;
      // A contest before the day starts belongs to the following day's schedule.
      if (at < dayStart) at += 1440;
      note = nextContest.name;
    }

    contestHost.innerHTML = contestBlocks(dayStart, at, len).map(rowHtml).join("");

    const cSub = document.getElementById("schedContestSub");
    if (cSub) {
      cSub.textContent = note
        ? "Built around " + note + " · starts " + clock(at)
        : "No contest loaded — shown against a nominal " + clock(FALLBACK_CONTEST) + " start";
      cSub.classList.toggle("is-live", !!note);
    }

    const label = document.getElementById("dayStartLabel");
    if (label) label.textContent = clock(dayStart);

    // Both the Routine bar and the Profile card bind to the same value; keep
    // whichever one the user is not currently typing into in step.
    document.querySelectorAll(".day-start-input").forEach(el => {
      if (el !== document.activeElement) el.value = hhmm(dayStart);
    });
  }

  // ------------------------------------------------------------------- state
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

  // Delegated, so the Profile card's copy works even though account.js renders
  // it long after this file has run.
  document.addEventListener("input", e => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("day-start-input")) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(el.value || "");
    if (!m) return;                                   // mid-edit, not a time yet
    setDayStart(parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
  });

  window.ICPCRoutine = {
    setDayStart,
    dayStart: () => dayStart,
    dayStartHHMM: () => hhmm(dayStart),
    render,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
