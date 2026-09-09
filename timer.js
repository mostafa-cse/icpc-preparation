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
    const secs = elapsed();
    const formatted = fmt(secs);
    const isRun = running();
    const isSoft = secs >= SOFT_CAP && secs < HARD_CAP;
    const isHard = secs >= HARD_CAP;

    if (face) face.textContent = formatted;
    if (el) {
      el.classList.toggle("is-running", isRun);
      el.classList.toggle("is-soft", isSoft);
      el.classList.toggle("is-hard", isHard);
      const btn = el.querySelector(".tb-toggle");
      if (btn) {
        btn.textContent = isRun ? "Pause" : (secs ? "Resume" : "Start");
        btn.setAttribute("aria-label", btn.textContent + " the time-box timer");
      }
      el.title = isHard
        ? "Over the hour cap - read the editorial, close it, re-implement from blank"
        : isSoft
          ? "Past 45 minutes - the rule says a hint is allowed now"
          : "Time on the current problem";
    }

    // Sync with Topbar CP Timer HUD
    const topTimer = document.getElementById("cpTopTimer");
    const topFace = document.getElementById("cpTimerFace");
    const topToggle = document.getElementById("cpTimerToggle");
    if (topFace) topFace.textContent = formatted;
    if (topToggle) {
      topToggle.innerHTML = isRun
        ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
        : '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      topToggle.title = isRun ? "Pause Timer (t)" : "Start Timer (t)";
    }
    if (topTimer) {
      topTimer.classList.toggle("is-running", isRun);
      topTimer.classList.toggle("is-soft", isSoft);
      topTimer.classList.toggle("is-hard", isHard);
      topTimer.title = isHard
        ? "Hard Cap Reached (60m): Stop and read editorial!"
        : isSoft
          ? "Soft Cap (45m): Editorial hint permitted"
          : `Problem Practice Timer: ${formatted} (Press 't' to toggle, 'T' to reset)`;
    }
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
    // Bind Topbar Timer controls
    const topToggle = document.getElementById("cpTimerToggle");
    const topReset = document.getElementById("cpTimerReset");
    if (topToggle && !topToggle.dataset.timerBound) {
      topToggle.dataset.timerBound = "1";
      topToggle.addEventListener("click", toggle);
    }
    if (topReset && !topReset.dataset.timerBound) {
      topReset.dataset.timerBound = "1";
      topReset.addEventListener("click", reset);
    }

    // Floating corner box only if needed
    if (!document.getElementById("timeBox")) {
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
    } else {
      el = document.getElementById("timeBox");
      face = el.querySelector(".tb-face");
    }

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
