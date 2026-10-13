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
    window.scrollTo({ top: Math.max(0, top), behavior: REDUCED_MOTION.matches ? "auto" : "smooth" });
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


  // the bar shows a filter's name, or its value once one is picked
  var filtersRow = document.getElementById("FiltersPanel");
  missionFilters.concat(astronautFilters).forEach(function (id) {
    var field = document.getElementById(id).closest(".field");
    var fv = document.createElement("span");
    fv.className = "fv";
    fv.setAttribute("aria-hidden", "true");
    fv.innerHTML = "<span class='fvt'></span>";
    field.insertBefore(fv, field.firstChild);
  });
  // ---- the filter menu: our own list instead of the system one ------------
  // The selects stay the source of truth (their values, their change event
  // that runs filter()); a field is the button, the menu is a listbox in
  // <body>. The three astronaut filters share one button and one menu (in
  // sections), so the bar holds three items at most and fits one row.
  var menu = document.createElement("div");
  menu.className = "fmenu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  body.appendChild(menu);
  var menuField = null;

  function closeMenu(refocus) {
    if (!menuField) return;
    menu.hidden = true;
    menu.classList.remove("show");
    menuField.setAttribute("aria-expanded", "false");
    if (refocus) menuField.focus({ preventScroll: true });
    menuField = null;
  }
  function pick(sel, value) {
    closeMenu(true);
    if (sel.value === value) return;
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function labelOf(sel) { return sel.closest(".field").querySelector("label").textContent; }
  function openMenu(field, sels) {
    menuField = field;
    menu.setAttribute("aria-label", sels.length > 1 ? "Astronaut filters" : labelOf(sels[0]));
    menu.innerHTML = "";
    sels.forEach(function (sel) {
      if (sels.length > 1) {
        var h = document.createElement("div");
        h.className = "fmenu-head";
        h.setAttribute("role", "presentation");
        h.textContent = labelOf(sel);
        menu.appendChild(h);
      }
      Array.prototype.forEach.call(sel.options, function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "fmenu-item";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(o.value === sel.value));
        b.textContent = o.text;
        b.addEventListener("click", function () { pick(sel, o.value); });
        menu.appendChild(b);
      });
    });
    menu.hidden = false;
    // under the field, kept on the screen
    var r = field.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = Math.max(r.width, menu.offsetWidth), h = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.left), vw - w - 8);
    var top = r.bottom + 6 + h > vh - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6;
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    menu.style.minWidth = r.width + "px";
    field.setAttribute("aria-expanded", "true");
    requestAnimationFrame(function () { menu.classList.add("show"); });
    (menu.querySelector("[aria-selected=true]") || menu.querySelector(".fmenu-item")).focus({ preventScroll: true });
  }
  function asButton(field, sels) {
    field.tabIndex = 0;
    field.setAttribute("role", "button");
    field.setAttribute("aria-haspopup", "listbox");
    field.setAttribute("aria-expanded", "false");
    field.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menuField === field) closeMenu(true); else { closeMenu(false); openMenu(field, sels); }
    });
    field.addEventListener("keydown", function (e) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].indexOf(e.key) >= 0) { e.preventDefault(); closeMenu(false); openMenu(field, sels); }
    });
  }
  missionFilters.concat(astronautFilters).forEach(function (id) {
    var sel = document.getElementById(id);
    sel.tabIndex = -1;
    sel.setAttribute("aria-hidden", "true");
  });
  missionFilters.forEach(function (id) {
    var sel = document.getElementById(id);
    asButton(sel.closest(".field"), [sel]);
  });
  // one button for the three astronaut filters
  var astroSels = astronautFilters.map(function (id) { return document.getElementById(id); });
  var astroField = document.createElement("div");
  astroField.className = "field fgroup";
  astroField.innerHTML = "<span class='fv' aria-hidden='true'><span class='fvt'></span></span>";
  astroSels[0].closest(".filt").insertBefore(astroField, astroSels[0].closest(".field"));
  asButton(astroField, astroSels);

  menu.addEventListener("click", function (e) { e.stopPropagation(); });
  menu.addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call(menu.querySelectorAll(".fmenu-item")), i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault(); items[e.key === "Home" ? 0 : items.length - 1].focus();
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation(); closeMenu(true);
    } else if (e.key === "Tab") {
      closeMenu(true);
    }
  });
  document.addEventListener("click", function () { closeMenu(false); });
  window.addEventListener("resize", function () { closeMenu(false); });
  document.addEventListener("scroll", function (e) { if (!menu.contains(e.target)) closeMenu(false); }, { capture: true, passive: true });

  // a soft edge on the right while more filters are hidden there
  function syncOverflow() {
    var more = filtersRow.scrollWidth - filtersRow.clientWidth - filtersRow.scrollLeft > 2;
    filtersRow.classList.toggle("more-right", more);
  }
  filtersRow.addEventListener("scroll", syncOverflow, { passive: true });
  window.addEventListener("resize", syncOverflow);

  function syncFilters() {
    var active = 0;
    missionFilters.concat(astronautFilters).forEach(function (id) {
      var sel = document.getElementById(id);
      var set = sel.value !== "All";
      var field = sel.closest(".field");
      field.classList.toggle("is-set", set);
      field.querySelector(".fvt").textContent = set ? sel.options[sel.selectedIndex].text
                                                   : field.querySelector("label").textContent;
      field.setAttribute("aria-label", field.querySelector("label").textContent + ": " + sel.options[sel.selectedIndex].text);
      if (set && (missionFilters.indexOf(id) >= 0 || astronautsMode())) active++;
    });
    // the astronaut button: its name, or the values picked
    var picked = astroSels.filter(sel => sel.value !== "All").map(sel => sel.options[sel.selectedIndex].text);
    astroField.classList.toggle("is-set", picked.length > 0);
    astroField.querySelector(".fvt").textContent = picked.length ? picked.join(" · ") : "Astronaut";
    astroField.setAttribute("aria-label", "Astronaut filters: " + astroSels.map(sel => labelOf(sel) + " " + sel.options[sel.selectedIndex].text).join(", "));
    body.classList.toggle("filters-active", active > 0);
    syncOverflow();
  }

  document.getElementById("FiltersReset").addEventListener("click", function () {
    missionFilters.concat(astronautFilters).forEach(function (id) {
      document.getElementById(id).value = "All";
    });
    window.filter();
    syncFilters();
  });

  document.addEventListener("change", function () { syncMode(); syncFilters(); });
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

  // a sheet too short to scroll would hand the swipe to the page behind
  infoCard.addEventListener("touchmove", function (e) {
    if (body.classList.contains("sheet-open") && infoCard.scrollHeight <= infoCard.clientHeight + 1) e.preventDefault();
  }, { passive: false });

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
  document.addEventListener("keydown", function (e) {
    if (modal.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "Tab") { e.preventDefault(); document.getElementById("CrewClose").focus(); }   // focus stays inside
  });
})();
