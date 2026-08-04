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
 * To change the password, open the page, unlock it, and click "Change password"
 * on the lock screen (or run setPassword() from the console). It prints a new
 * hash — paste that over PASSWORD_HASH below.
 */
(function () {
  "use strict";

  const SALT = "icpc-tracker-v1";
  const ITERATIONS = 150000;
  const PASSWORD_HASH = "4301913239fd1df7d953bf59d3918abf24943087e5b508a58bf609d9202fd276"; // "icpc2026"
  const SESSION_KEY = "icpc_unlocked";

  const root = document.documentElement;
  root.classList.add("locked");

  function unlock() {
    root.classList.remove("locked");
    const gate = document.getElementById("lockScreen");
    if (gate) gate.remove();
  }

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

  // Already unlocked this tab? Then don't ask again.
  try {
    if (sessionStorage.getItem(SESSION_KEY) === PASSWORD_HASH) {
      unlock();
      return;
    }
  } catch (e) { /* sessionStorage unavailable — fall through and ask */ }

  function buildGate() {
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

  // Expose the generator so a new hash can be made from the console too.
  window.setPassword = async function (pw) {
    const hash = await derive(pw);
    console.log("PASSWORD_HASH = \"" + hash + "\";  // " + pw);
    return hash;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildGate);
  } else {
    buildGate();
  }
})();
