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
  const SVG_ICONS = {
    auto: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"></path></svg>',
    light: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
    dark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
  };
  window.__THEME_ICONS = SVG_ICONS;
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
    btn.innerHTML = SVG_ICONS[mode];
    btn.title = LABEL[mode];
    btn.setAttribute("aria-label", LABEL[mode]);

    btn.addEventListener("click", () => {
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      localStorage.setItem(STORE, mode);
      apply(mode);
      btn.innerHTML = SVG_ICONS[mode];
      btn.title = LABEL[mode];
      btn.setAttribute("aria-label", LABEL[mode]);
    });

    host.insertAdjacentElement("afterend", btn);
  });
})();
