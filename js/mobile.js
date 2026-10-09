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

  // ---- list: folded under the filters ---------------------------------------
  var listBlock = document.getElementById("ListBlock");
  var listToggle = document.getElementById("ListToggle");
  function setList(open) {
    listBlock.classList.toggle("open", open);
    listToggle.setAttribute("aria-expanded", String(open));
  }
  listToggle.addEventListener("click", function () {
    setList(!listBlock.classList.contains("open"));
  });
  // on wide screens the list fills the free space of the filters card
  // without moving anything, so it starts open there
  if (window.matchMedia("(min-width: 1201px)").matches) setList(true);

  // ---- tab bar: jump to a section, highlight the one on screen --------------
  var targets = {
    timeline: [".layout > .sun_filters", ".layout > .stacked"],
    list: ["#ListBlock"],
    params: ["#parcoords"],
    graph: [".layout > .graph"]
  };
  function elementsOf(name) {
    return targets[name].map(function (sel) { return document.querySelector(sel); })
                        .filter(Boolean);
  }
  function topOf(name) {
    var tops = elementsOf(name).map(function (el) {
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
    if (name === "list") setList(true);
    markTab(name);
    jumping = Date.now();
    var top = name === "timeline" ? 0 : topOf(name) - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  tabs.forEach(function (b) {
    b.addEventListener("click", function () { goTo(b.getAttribute("data-tab")); });
  });

  // scroll spy: the tab whose (innermost) element crosses a line in the
  // upper part of the screen lights up
  var spyQueued = false;
  function spy() {
    spyQueued = false;
    if (!phone.matches || Date.now() - jumping < 900) return;
    var doc = document.documentElement;
    var line = doc.clientHeight * 0.35;
    var best = null, bestHeight = Infinity;
    Object.keys(targets).forEach(function (name) {
      elementsOf(name).forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top <= line && r.bottom > line && r.height < bestHeight) {
          best = name;
          bestHeight = r.height;
        }
      });
    });
    if (window.pageYOffset + doc.clientHeight >= doc.scrollHeight - 24) best = "graph";
    if (best) markTab(best);
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

  function astronautsMode() { return dataType.value === "Astronauts"; }

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
  var infoCard = document.getElementById("Info");
  var rows = document.getElementById("InfoBody");
  // on phones the card is a modal sheet: a dialog only while it is open
  var opener = null;
  function openSheet() {
    if (body.classList.contains("sheet-open")) return;
    opener = document.activeElement;
    body.classList.add("sheet-open");
    infoCard.setAttribute("role", "dialog");
    infoCard.setAttribute("aria-modal", "true");
    document.getElementById("SheetClose").focus({ preventScroll: true });
  }
  function closeSheet() {
    if (!body.classList.contains("sheet-open")) return;
    body.classList.remove("sheet-open");
    infoCard.removeAttribute("role");
    infoCard.removeAttribute("aria-modal");
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });   // back to the row
    opener = null;
  }

  new MutationObserver(function () {
    if (rows.firstChild) {
      if (phone.matches) openSheet();
      infoCard.scrollTop = 0;
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
    // Esc closes the topmost layer only: the photo or the crew picture first
    var overlay = document.querySelector(".lightbox.show") || !document.getElementById("CrewModal").hidden;
    if (e.key === "Escape" && !overlay) closeSheet();
  });

  // swipe the sheet down to close it
  var startY = null;
  infoCard.addEventListener("touchstart", function (e) {
    startY = infoCard.scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  infoCard.addEventListener("touchmove", function (e) {
    if (startY === null) return;
    var dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      infoCard.classList.add("dragging");
      infoCard.style.transform = "translate3d(0," + dy + "px,0)";
    }
  }, { passive: true });
  infoCard.addEventListener("touchend", function (e) {
    if (startY === null) return;
    var dy = e.changedTouches[0].clientY - startY;
    infoCard.classList.remove("dragging");
    infoCard.style.transform = "";
    if (dy > 90) closeSheet();
    startY = null;
  });

  phone.addEventListener && phone.addEventListener("change", function () {
    if (!phone.matches) closeSheet();
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
      var n = grid.querySelectorAll(".row").length;
      badge.textContent = n || "";
      document.getElementById("ListCount").textContent = n;
    });
  }).observe(grid, { childList: true });
})();

// the creators' photo
(function () {
  var btn = document.getElementById("CrewBtn"), modal = document.getElementById("CrewModal");
  if (!btn || !modal) return;
  function open() { modal.hidden = false; document.getElementById("CrewClose").focus(); }
  function close() { modal.hidden = true; btn.focus(); }
  btn.addEventListener("click", open);
  modal.addEventListener("click", function (e) { if (e.target === modal || e.target.closest(".crew-close")) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
})();
