/* PaperBag — time-of-day dark mode with a user override. */
(function () {
  "use strict";
  var KEY = "paperbag_theme";
  var root = document.documentElement;
  var mode = "auto";
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark" || saved === "auto") mode = saved;
  } catch (e) {}

  function isNight() {
    var h = new Date().getHours();
    return h >= 19 || h < 6;
  }

  function resolve() {
    return mode === "auto" ? (isNight() ? "dark" : "light") : mode;
  }

  function updateButton(theme) {
    var btn = document.querySelector(".pb-theme-toggle");
    if (!btn) return;
    var icon = btn.querySelector("i");
    var dark = theme === "dark";
    if (icon) {
      icon.className = dark ? "fas fa-sun" : "fas fa-moon";
    }
    var label =
      mode === "auto"
        ? "Theme: automatic (time of day). Currently " + theme + ". Click for light."
        : "Theme: " + theme + ". Click for " + (dark ? "light" : "dark") + ".";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.setAttribute("data-mode", mode);
    btn.setAttribute("data-theme", theme);
  }

  function apply() {
    var theme = resolve();
    root.setAttribute("data-theme", theme);
    try {
      root.style.colorScheme = theme;
    } catch (e) {}
    updateButton(theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#141419" : "#111116");
  }

  function setMode(next) {
    mode = next;
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    apply();
  }

  function injectToggle() {
    if (document.querySelector(".pb-theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pb-theme-toggle";
    btn.innerHTML = '<i class="fas fa-moon" aria-hidden="true"></i>';

    var host =
      document.querySelector(".site-header .nav-icons") ||
      document.querySelector(".nav-icons") ||
      document.querySelector(".header-actions") ||
      document.querySelector(".account-header .header-content") ||
      document.querySelector(".admin-topbar") ||
      document.querySelector(".header");
    if (host) {
      host.appendChild(btn);
    } else {
      btn.style.position = "fixed";
      btn.style.top = "12px";
      btn.style.right = "12px";
      btn.style.zIndex = "9999";
      btn.style.background = "#141419";
      btn.style.color = "#d9b877";
      document.body.appendChild(btn);
    }

    btn.addEventListener("click", function () {
      var current = resolve();
      setMode(current === "dark" ? "light" : "dark");
    });
    // Double-click restores automatic time-of-day mode.
    btn.addEventListener("dblclick", function () {
      setMode("auto");
    });
  }

  function init() {
    injectToggle();
    apply();
    // Keep automatic mode in sync when the clock crosses a boundary.
    setInterval(function () {
      if (mode === "auto") apply();
    }, 10 * 60 * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
