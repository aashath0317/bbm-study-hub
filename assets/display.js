// Reading preferences are independent of study progress; apply before first paint.
(function () {
  "use strict";
  var key = "bbm-display", sizes = [85, 100, 115, 130, 150];
  var prefs = { theme: "light", size: 100 };
  try {
    var saved = JSON.parse(localStorage.getItem(key));
    if (saved && (saved.theme === "light" || saved.theme === "dark")) prefs.theme = saved.theme;
    if (saved && sizes.indexOf(saved.size) !== -1) prefs.size = saved.size;
  } catch (_) { /* Reading still works when storage is unavailable. */ }
  function apply(save) {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.style.setProperty("--text-scale", prefs.size / 100);
    if (save) { try { localStorage.setItem(key, JSON.stringify(prefs)); } catch (_) {} }
  }
  apply(false);
  document.addEventListener("DOMContentLoaded", function () {
    var settings = document.getElementById("display-settings");
    if (!settings) return;
    var theme = document.getElementById("display-theme"), smaller = document.getElementById("text-smaller"), larger = document.getElementById("text-larger"), output = document.getElementById("display-size");
    function draw() {
      var label = prefs.theme === "dark" ? "வெளிச்சத் தோற்றத்திற்கு மாற்று" : "இருள் தோற்றத்திற்கு மாற்று";
      theme.setAttribute("aria-label", label);
      theme.title = label;
      theme.setAttribute("aria-pressed", String(prefs.theme === "dark"));
      output.textContent = "எழுத்து அளவு: " + prefs.size + "%";
      smaller.title = "எழுத்தைச் சிறிதாக்கு (" + prefs.size + "%)";
      larger.title = "எழுத்தைப் பெரிதாக்கு (" + prefs.size + "%)";
      smaller.disabled = prefs.size === sizes[0];
      larger.disabled = prefs.size === sizes[sizes.length - 1];
    }
    theme.addEventListener("click", function () { prefs.theme = prefs.theme === "dark" ? "light" : "dark"; apply(true); draw(); });
    smaller.addEventListener("click", function () { prefs.size = sizes[Math.max(0, sizes.indexOf(prefs.size) - 1)]; apply(true); draw(); });
    larger.addEventListener("click", function () { prefs.size = sizes[Math.min(sizes.length - 1, sizes.indexOf(prefs.size) + 1)]; apply(true); draw(); });
    draw();
    settings.hidden = false;
  });
}());
