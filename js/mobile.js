/*
 * Phone layout: the page scrolls as usual and the bottom tab bar is a
 * shortcut to its sections (the tab of the section on screen lights up);
 * compact filter chips; details of the selected mission/astronaut in a
 * bottom sheet. On wider screens none of this is visible and the page is
 * the usual dashboard.
 */
(function () {
  var body = document.body;
  var phone = window.matchMedia("(max-width: 760px)");
  var tabs = document.querySelectorAll("#TabBar button");

  // ---- tab bar: jump to a section, highlight the one on screen --------------
  function sectionsOf(name) {
    return Array.prototype.slice.call(document.querySelectorAll('.layout > [data-tab="' + name + '"]'));
  }
  // top of a tab's area = its section that is highest on the page
  function topOf(name) {
    var tops = sectionsOf(name).map(function (el) {
      return el.getBoundingClientRect().top + window.pageYOffset;
    });
    return tops.length ? Math.min.apply(null, tops) : 0;
  }

  function markTab(name) {
    tabs.forEach(function (b) {
      var on = b.getAttribute("data-tab") === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "location" : "false");
    });
  }

  var jumping = 0;
  function goTo(name) {
    markTab(name);
    jumping = Date.now();
    var top = name === "timeline" ? 0 : topOf(name) - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  tabs.forEach(function (b) {
    b.addEventListener("click", function () { goTo(b.getAttribute("data-tab")); });
  });

  // scroll spy: the active tab follows the section in the upper part of the screen
  var names = Array.prototype.map.call(tabs, function (b) { return b.getAttribute("data-tab"); });
  var spyQueued = false;
  function spy() {
    spyQueued = false;
    if (!phone.matches || Date.now() - jumping < 900) return;
    var line = window.pageYOffset + document.documentElement.clientHeight * 0.35;
    var current = names[0];
    names.forEach(function (n) { if (topOf(n) <= line) current = n; });
    // at the very bottom the last section wins even if it is short
    var doc = document.documentElement;
    if (window.pageYOffset + doc.clientHeight >= doc.scrollHeight - 24) {
      current = names[names.length - 1];
    }
    markTab(current);
  }
  window.addEventListener("scroll", function () {
    if (!spyQueued) { spyQueued = true; window.requestAnimationFrame(spy); }
  }, { passive: true });
  markTab("timeline");

  function setTab(name) { goTo(name); }   // used by the details sheet

  // ---- view switch and filters -------------------------------------------
  var dataType = document.getElementById("DataType");
  var modeButtons = document.querySelectorAll(".mode-switch button");
  var missionFilters = ["Habitation", "Outcome"];
  var astronautFilters = ["Status", "Gender", "SpaceWalk"];

  function astronautsMode() { return dataType.value === "Astonauts"; }

  function syncMode() {
    body.classList.toggle("mode-astronauts", astronautsMode());
    modeButtons.forEach(function (b) {
      var on = b.getAttribute("data-mode") === dataType.value;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }
  modeButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      if (dataType.value === b.getAttribute("data-mode")) return;
      dataType.value = b.getAttribute("data-mode");
      dataType.dispatchEvent(new Event("change", { bubbles: true }));   // runs the page's filter()
    });
  });

  // a select is as wide as its current value, so the chips stay compact
  var ruler = document.createElement("span");
  ruler.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:600 16px Nunito,system-ui,sans-serif";
  body.appendChild(ruler);
  function sizeSelect(sel) {
    if (!phone.matches) { sel.style.width = ""; return; }
    ruler.textContent = sel.options[sel.selectedIndex].text;
    sel.style.width = Math.ceil(ruler.getBoundingClientRect().width + 30) + "px";
  }

  function syncFilters() {
    var active = 0;
    missionFilters.concat(astronautFilters).forEach(function (id) {
      var sel = document.getElementById(id);
      var set = sel.value !== "All";
      sel.closest(".field").classList.toggle("is-set", set);
      if (set && (missionFilters.indexOf(id) >= 0 || astronautsMode())) active++;
      sizeSelect(sel);
    });
    body.classList.toggle("filters-active", active > 0);
  }

  document.getElementById("FiltersReset").addEventListener("click", function () {
    missionFilters.concat(astronautFilters).forEach(function (id) {
      document.getElementById(id).value = "All";
    });
    window.filter();
    syncFilters();
  });

  document.addEventListener("change", function () { syncMode(); syncFilters(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncFilters);
  syncMode();
  syncFilters();

  // ---- details sheet ---------------------------------------------------------
  var info = document.getElementById("Info");
  var rows = info.querySelector("tbody");
  function openSheet() { body.classList.add("sheet-open"); }
  function closeSheet() { body.classList.remove("sheet-open"); }

  new MutationObserver(function () {
    if (rows.querySelector("tr")) {
      if (phone.matches) openSheet();
      info.scrollTop = 0;
    } else {
      closeSheet();
    }
  }).observe(rows, { childList: true });

  document.getElementById("SheetClose").addEventListener("click", closeSheet);
  document.getElementById("SheetBackdrop").addEventListener("click", closeSheet);
  document.getElementById("SheetGraph").addEventListener("click", function () {
    closeSheet();
    setTab("graph");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSheet();
  });

  // swipe the sheet down to close it
  var startY = null;
  info.addEventListener("touchstart", function (e) {
    startY = info.scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  info.addEventListener("touchmove", function (e) {
    if (startY === null) return;
    var dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      info.classList.add("dragging");
      info.style.transform = "translate3d(0," + dy + "px,0)";
    }
  }, { passive: true });
  info.addEventListener("touchend", function (e) {
    if (startY === null) return;
    var dy = e.changedTouches[0].clientY - startY;
    info.classList.remove("dragging");
    info.style.transform = "";
    if (dy > 90) closeSheet();
    startY = null;
  });

  phone.addEventListener && phone.addEventListener("change", function () {
    if (!phone.matches) closeSheet();
    syncFilters();
  });

  // ---- number of rows on the List tab ----------------------------------------
  var grid = document.getElementById("grid");
  var badge = document.getElementById("ListBadge");
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      badge.textContent = grid.querySelectorAll(".row").length || "";
    });
  }).observe(grid, { childList: true });
})();
