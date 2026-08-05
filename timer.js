/*
 * Time-box timer.
 *
 * The plan's own ground rules say to cap yourself at 45-60 minutes on a problem
 * before taking a hint. That rule is unenforceable by feel — an hour lost to
 * one problem feels like twenty minutes — so this counts up and changes colour
 * as you cross each threshold, rather than nagging.
 *
 * State is stored as a start timestamp plus previously banked time, not as a
 * running count, so closing the tab or reloading mid-problem does not lose or
 * inflate the elapsed time.
 */
(function () {
  "use strict";

  const STORE = "icpc_timebox";
  const SOFT_CAP = 45 * 60;   // start thinking about the editorial
  const HARD_CAP = 60 * 60;   // the rule says stop

  let state = read();
  let tick = null;
  let el = null, face = null;

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "null");
      if (raw && typeof raw.banked === "number") return raw;
    } catch (e) {}
    return { banked: 0, startedAt: null };
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }

  function elapsed() {
    const live = state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0;
    return Math.max(0, Math.floor(state.banked + live));
  }

  function fmt(secs) {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
    return h ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function running() { return state.startedAt != null; }

  function paint() {
    if (!el) return;
    const secs = elapsed();
    face.textContent = fmt(secs);
    el.classList.toggle("is-running", running());
    el.classList.toggle("is-soft", secs >= SOFT_CAP && secs < HARD_CAP);
    el.classList.toggle("is-hard", secs >= HARD_CAP);
    const btn = el.querySelector(".tb-toggle");
    btn.textContent = running() ? "Pause" : (secs ? "Resume" : "Start");
    btn.setAttribute("aria-label", btn.textContent + " the time-box timer");
    el.title = secs >= HARD_CAP
      ? "Over the hour cap - read the editorial, close it, re-implement from blank"
      : secs >= SOFT_CAP
        ? "Past 45 minutes - the rule says a hint is allowed now"
        : "Time on the current problem";
  }

  function start() {
    if (running()) return;
    state.startedAt = Date.now();
    save(); paint(); loop();
  }

  function pause() {
    if (!running()) return;
    state.banked = elapsed();
    state.startedAt = null;
    save(); paint(); loop();
  }

  function toggle() { running() ? pause() : start(); }

  function reset() {
    state = { banked: 0, startedAt: null };
    save(); paint(); loop();
  }

  function loop() {
    clearInterval(tick);
    if (running()) tick = setInterval(paint, 1000);
  }

  function build() {
    if (document.getElementById("timeBox")) return;
    el = document.createElement("div");
    el.id = "timeBox";
    el.className = "timebox";
    el.innerHTML =
      '<span class="tb-face mono">00:00</span>' +
      '<button type="button" class="tb-toggle">Start</button>' +
      '<button type="button" class="tb-reset" aria-label="Reset the time-box timer">Reset</button>';
    document.body.appendChild(el);
    face = el.querySelector(".tb-face");
    el.querySelector(".tb-toggle").addEventListener("click", toggle);
    el.querySelector(".tb-reset").addEventListener("click", reset);
    paint(); loop();
  }

  document.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.documentElement.classList.contains("locked")) return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return;
    if (e.key === "t") { e.preventDefault(); toggle(); }
    if (e.key === "T") { e.preventDefault(); reset(); }
  });

  window.ICPCTimer = {
    start, pause, reset, toggle,
    elapsed, running,
    caps: { soft: SOFT_CAP, hard: HARD_CAP },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
