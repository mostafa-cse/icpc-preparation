/*
 * Access gate for the tracker.
 *
 * IMPORTANT — what this does and does not do.
 * This is a static site with no server, so this gate is a deterrent, not real
 * security. It keeps casual visitors out of the page, but anyone who wants the
 * content can still open script.js / templates.js / contests.js directly, or
 * read them from the browser's network tab. Do not treat anything in this
 * folder as private just because the gate is here.
 *
 * The password itself is NOT stored. Only a PBKDF2-SHA256 derivation of it is,
 * so the password can't be read out of this file, and 150k iterations makes
 * guessing it slow.
 *
 * To change the password, unlock the page and click "Change password" on the
 * lock screen (or run setPassword() from the console). It prints a new hash —
 * paste that over PASSWORD_HASH below.
 */
(function () {
  "use strict";

  const SALT = "icpc-tracker-v1";
  const ITERATIONS = 150000;
  const PASSWORD_HASH = "4301913239fd1df7d953bf59d3918abf24943087e5b508a58bf609d9202fd276"; // "icpc2026"
  const SESSION_KEY = "icpc_unlocked";
  const IDLE_KEY = "icpc_autolock_min";

  const root = document.documentElement;
  root.classList.add("locked");

  let idleTimer = null;

  // ---------- crypto ----------
  async function derive(password) {
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
      "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(SALT), iterations: ITERATIONS, hash: "SHA-256" },
      material, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Constant-time-ish compare; both values are hex of equal length.
  function same(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // ---------- lock / unlock ----------
  function unlock() {
    root.classList.remove("locked");
    const gate = document.getElementById("lockScreen");
    if (gate) gate.remove();
    const btn = document.getElementById("lockToggle");
    if (btn) btn.hidden = false;
    resetIdleTimer();
  }

  function lock() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    root.classList.add("locked");
    const btn = document.getElementById("lockToggle");
    if (btn) btn.hidden = true;
    clearTimeout(idleTimer);
    buildGate();
    const input = document.getElementById("lockInput");
    if (input) { input.value = ""; input.focus(); }
    window.scrollTo(0, 0);
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(SESSION_KEY) === PASSWORD_HASH; }
    catch (e) { return false; }
  }

  // Reveal synchronously (before <body> parses) when this tab is already
  // unlocked, otherwise the page would flash blank until DOMContentLoaded.
  if (isUnlocked()) root.classList.remove("locked");

  // ---------- optional auto-lock on idle ----------
  function idleMinutes() {
    const v = parseInt(localStorage.getItem(IDLE_KEY) || "0", 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    const mins = idleMinutes();
    if (!mins || root.classList.contains("locked")) return;
    idleTimer = setTimeout(lock, mins * 60000);
  }

  ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => {
      if (!root.classList.contains("locked")) resetIdleTimer();
    }, { passive: true }));

  // ---------- gate ----------
  function buildGate() {
    if (document.getElementById("lockScreen")) return;
    if (!document.body) return;

    const gate = document.createElement("div");
    gate.id = "lockScreen";
    gate.innerHTML =
      '<form class="lock-card" id="lockForm" autocomplete="off">' +
        '<span class="lock-mark">🏁</span>' +
        '<h1>ICPC · 16-Week Plan</h1>' +
        '<p class="lock-sub">Enter the password to open your tracker.</p>' +
        '<input type="password" id="lockInput" placeholder="Password" autocomplete="current-password" autofocus>' +
        '<p class="lock-error" id="lockError" role="alert"></p>' +
        '<button type="submit" class="btn primary" id="lockBtn">Unlock</button>' +
        '<button type="button" class="lock-link" id="lockChange">Change password</button>' +
      "</form>";
    document.body.appendChild(gate);

    const form = document.getElementById("lockForm");
    const input = document.getElementById("lockInput");
    const err = document.getElementById("lockError");
    const btn = document.getElementById("lockBtn");

    if (!(window.crypto && window.crypto.subtle)) {
      err.textContent = "This browser blocked WebCrypto, so the password can't be checked. " +
        "Serve the folder over http://localhost instead of opening the file directly.";
      input.disabled = true;
      btn.disabled = true;
      return;
    }

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const value = input.value;
      if (!value) return;
      btn.disabled = true;
      btn.textContent = "Checking…";
      err.textContent = "";
      try {
        const hash = await derive(value);
        if (same(hash, PASSWORD_HASH)) {
          try { sessionStorage.setItem(SESSION_KEY, hash); } catch (e2) {}
          unlock();
          return;
        }
        err.textContent = "Wrong password.";
        input.value = "";
        input.focus();
      } catch (e3) {
        err.textContent = "Could not verify the password: " + e3.message;
      }
      btn.disabled = false;
      btn.textContent = "Unlock";
    });

    document.getElementById("lockChange").addEventListener("click", async () => {
      const next = prompt("New password (you'll get a hash to paste into auth.js):");
      if (!next) return;
      const hash = await derive(next);
      prompt("Paste this over PASSWORD_HASH in auth.js:", hash);
    });
  }

  // Generate a hash from the console too.
  window.setPassword = async function (pw) {
    const hash = await derive(pw);
    console.log("PASSWORD_HASH = \"" + hash + "\";  // " + pw);
    return hash;
  };
  // Lock from the console / other scripts.
  window.lockSite = lock;

  // ---------- boot ----------
  function start() {
    const btn = document.getElementById("lockToggle");
    if (btn && !btn.dataset.wired) {
      btn.dataset.wired = "1";
      btn.addEventListener("click", lock);
    }
    if (isUnlocked()) unlock();
    else buildGate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
