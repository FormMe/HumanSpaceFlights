/*
 * Phone layout: one section at a time (bottom tab bar), filters folded
 * behind a button, details of the selected mission/astronaut in a bottom
 * sheet. On wider screens none of this is visible and the page is the
 * usual dashboard; the classes below only matter inside the CSS media query.
 */
(function () {
  var body = document.body;
  var phone = window.matchMedia("(max-width: 760px)");
  var tabs = document.querySelectorAll("#TabBar button");

  // ---- tabs ----------------------------------------------------------------
  function setTab(name) {
    body.setAttribute("data-tab", name);
    tabs.forEach(function (b) {
      var on = b.getAttribute("data-tab") === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "page" : "false");
    });
    if (phone.matches) {
      var first = document.querySelector('.layout > [data-tab="' + name + '"]');
      var top = first ? first.getBoundingClientRect().top + window.pageYOffset - 12 : 0;
      // keep the header in view on the first tab, jump to the section otherwise
      window.scrollTo(0, name === "timeline" ? 0 : Math.max(0, top));
    }
  }
  tabs.forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
  });
  setTab("timeline");

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
