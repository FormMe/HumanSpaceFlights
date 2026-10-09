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

  // ---- filters ---------------------------------------------------------------
  var toggle = document.getElementById("FiltersToggle");
  var count = document.getElementById("FiltersCount");
  toggle.addEventListener("click", function () {
    var open = !body.classList.contains("filters-open");
    body.classList.toggle("filters-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  function countFilters() {
    var n = ["Habitation", "Outcome", "Status", "Gender", "SpaceWalk"].filter(function (id) {
      var el = document.getElementById(id);
      return el && el.value !== "All";
    }).length;
    count.textContent = n ? n : "";
  }
  document.addEventListener("change", countFilters);
  countFilters();

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
