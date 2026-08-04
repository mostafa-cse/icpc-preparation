/*
 * Light / dark toggle.
 *
 * The stylesheet already reacts to prefers-color-scheme; this only adds an
 * explicit override, stored per browser. Three states cycle in order:
 *   auto (follow the OS)  ->  light  ->  dark  ->  auto
 * "auto" removes data-theme entirely so the media query takes over again.
 */
(function () {
  "use strict";

  const STORE = "icpc_theme";
  const ORDER = ["auto", "light", "dark"];
  const ICON = { auto: "🌗", light: "☀️", dark: "🌙" };
  const LABEL = { auto: "Theme: follows system", light: "Theme: light", dark: "Theme: dark" };

  function apply(mode) {
    if (mode === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", mode);
  }

  let mode = localStorage.getItem(STORE);
  if (ORDER.indexOf(mode) < 0) mode = "auto";
  apply(mode);

  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector(".topbar .tabs");
    if (!host) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-btn";
    btn.textContent = ICON[mode];
    btn.title = LABEL[mode];
    btn.setAttribute("aria-label", LABEL[mode]);

    btn.addEventListener("click", () => {
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      localStorage.setItem(STORE, mode);
      apply(mode);
      btn.textContent = ICON[mode];
      btn.title = LABEL[mode];
      btn.setAttribute("aria-label", LABEL[mode]);
    });

    host.insertAdjacentElement("afterend", btn);
  });
})();
