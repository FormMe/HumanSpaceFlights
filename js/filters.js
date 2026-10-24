// Filters: what to explore, not which columns there are.
//
//   search  - any mission or astronaut by name, opens its card
//   years   - a range (with the launches per year under it) or an era
//   missions- where they went (suborbital, orbit, a station, the Moon), which
//             station, crew lost
//   crew    - women / men, status, spacewalkers. In the Missions view: the
//             missions with such a person aboard
//   country - a click on a country in a legend shows only it; more clicks add
//
// One state for both views, kept in the address (#...) so a view can be
// shared. script.js asks matchMission / matchAstronaut which rows pass.
var Filters = (function () {
	var NOW = new Date().getFullYear();
	var S = blank();
	var MIN = 1961, MAX = NOW;
	var onChange = function () {}, byName = new Map(), allMissions = [], allAstronauts = [], perYear = {};

	var DEST = [["sub", "Suborbital"], ["orbit", "Orbit"], ["station", "Space station"], ["moon", "Moon"]];
	var STATIONS = ["Salyut", "Skylab", "Mir", "ISS", "Tiangong"];
	var STATUS = ["Active", "Management", "Retired", "Deceased"];
	var ERAS = [["Space Race", 1961, 1975], ["Stations & Shuttle", 1976, 2000],
	            ["ISS era", 2001, 2019], ["New space", 2020, NOW]];

	function blank() {
		return { y0: null, y1: null, countries: new Set(), dest: new Set(), stations: new Set(),
		         lost: false, gender: "", status: new Set(), walkers: false };
	}

	// ---- the rules -------------------------------------------------------------

	function destOf(m) {
		if (m.Moon === "Y" || m.Habitation === "Moon") return "moon";
		if (m["Sub Orbital"] === "Y") return "sub";
		return m.Habitation && m.Habitation !== "Space" ? "station" : "orbit";
	}
	function stationOf(m) {
		var h = m.Habitation || "";
		return h.indexOf("Salyut") === 0 ? "Salyut" : h.indexOf("Tiangong") === 0 ? "Tiangong" : h;
	}
	function crewSet() { return !!(S.gender || S.status.size || S.walkers); }
	function person(a) {
		return (!S.gender || a.Gender === S.gender) &&
		       (!S.status.size || S.status.has(a.Status)) &&
		       (!S.walkers || +a["Space Walks"] > 0);
	}
	// when, where, how it ended: the same in both views
	function missionBase(m) {
		var y = +m.Year;
		if (S.y0 !== null && (y < S.y0 || y > S.y1)) return false;
		if (S.dest.size || S.stations.size) {
			var d = destOf(m);
			if (!S.dest.has(d) && !(d === "station" && S.stations.has(stationOf(m)))) return false;
		}
		if (S.lost && m.Fatality !== "Y") return false;
		return true;
	}
	// missionsView: country is the mission's, crew means "with such a person aboard"
	function matchMission(m, missionsView) {
		if (!missionBase(m)) return false;
		if (!missionsView) return true;
		if (S.countries.size && !S.countries.has(m.Country)) return false;
		if (crewSet() && !m.Members.some(function (n) { var a = byName.get(n); return a && person(a); })) return false;
		return true;
	}
	function matchAstronaut(a) {
		return (!S.countries.size || S.countries.has(a.Country)) && person(a);
	}
	// people of a crew list we know nothing about (counted as "Other")
	function passUnknown() {
		return !crewSet() && (!S.countries.size || S.countries.has("Other"));
	}
	function active() {
		return S.y0 !== null || S.countries.size || S.dest.size || S.stations.size || S.lost || crewSet();
	}

	// ---- words on the bar --------------------------------------------------------

	function yearsText() {
		if (S.y0 === null) return null;
		var era = ERAS.find(function (e) { return e[1] === S.y0 && e[2] === S.y1; });
		if (era) return era[0];
		return S.y0 === S.y1 ? String(S.y0) : S.y0 + "–" + S.y1;
	}
	function missionsText() {
		var parts = DEST.filter(d => S.dest.has(d[0])).map(d => d[1]);
		STATIONS.forEach(function (s) { if (S.stations.has(s) && !S.dest.has("station")) parts.push(s); });
		if (S.lost) parts.push("Crew lost");
		return parts.length ? parts.join(" · ") : null;
	}
	function crewText() {
		var parts = [];
		if (S.gender) parts.push(S.gender === "Female" ? "Women" : "Men");
		STATUS.forEach(function (s) { if (S.status.has(s)) parts.push(s); });
		if (S.walkers) parts.push("Spacewalkers");
		return parts.length ? parts.join(" · ") : null;
	}

	// ---- the address --------------------------------------------------------------

	function toHash() {
		var p = [];
		if (S.y0 !== null) p.push("y=" + S.y0 + "-" + S.y1);
		if (S.countries.size) p.push("c=" + [...S.countries].map(encodeURIComponent).join(","));
		if (S.dest.size) p.push("d=" + [...S.dest].join(","));
		if (S.stations.size) p.push("s=" + [...S.stations].join(","));
		if (S.lost) p.push("lost");
		if (S.gender) p.push("g=" + S.gender);
		if (S.status.size) p.push("st=" + [...S.status].join(","));
		if (S.walkers) p.push("eva");
		if (!isMissionMode()) p.push("astronauts");
		return p.join("&");
	}
	function writeHash() {
		try { history.replaceState(null, "", location.pathname + location.search + (toHash() ? "#" + toHash() : "")); } catch (e) {}
	}
	function readHash() {
		var h = (location.hash || "").replace(/^#/, "");
		if (!h) return;
		h.split("&").forEach(function (kv) {
			var i = kv.indexOf("="), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1));
			var list = v ? v.split(",") : [];
			if (k === "y") { var a = v.split("-").map(Number); if (a[0] >= MIN && a[1] >= a[0]) { S.y0 = a[0]; S.y1 = Math.min(a[1], MAX); } }
			else if (k === "c") list.forEach(c => { if (Countries.indexOf(c) >= 0) S.countries.add(c); });
			else if (k === "d") list.forEach(d => { if (DEST.some(x => x[0] === d)) S.dest.add(d); });
			else if (k === "s") list.forEach(s => { if (STATIONS.indexOf(s) >= 0) S.stations.add(s); });
			else if (k === "lost") S.lost = true;
			else if (k === "g" && (v === "Female" || v === "Male")) S.gender = v;
			else if (k === "st") list.forEach(s => { if (STATUS.indexOf(s) >= 0) S.status.add(s); });
			else if (k === "eva") S.walkers = true;
			else if (k === "astronauts") document.getElementById("DataType").value = "Astronauts";
		});
	}
	readHash();     // before mobile.js and script.js read the view

	// ---- the bar ---------------------------------------------------------------------

	var bar = document.getElementById("FiltersPanel");
	var ICON_SEARCH = "<svg width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' aria-hidden='true'><circle cx='7' cy='7' r='4.6'/><path d='M10.4 10.4L14 14'/></svg>";
	var ICON_X = "<svg width='12' height='12' viewBox='0 0 12 12' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' aria-hidden='true'><path d='M2.5 2.5l7 7M9.5 2.5l-7 7'/></svg>";
	bar.innerHTML =
		"<button type='button' class='fb fb-search' aria-label='Search missions and astronauts' title='Search'>" + ICON_SEARCH + "</button>" +
		"<button type='button' class='fb' data-menu='years' aria-haspopup='dialog' aria-expanded='false'><span class='fvt'></span></button>" +
		"<button type='button' class='fb' data-menu='missions' aria-haspopup='dialog' aria-expanded='false'><span class='fvt'></span></button>" +
		"<button type='button' class='fb' data-menu='crew' aria-haspopup='dialog' aria-expanded='false'><span class='fvt'></span></button>" +
		"<button type='button' class='fb-reset' aria-label='Reset filters' title='Reset filters'>" + ICON_X + "</button>" +
		"<div class='fsearch' hidden><span class='fsearch-icon'>" + ICON_SEARCH + "</span>" +
		"<input type='search' placeholder='Mission or astronaut…' aria-label='Search missions and astronauts' autocomplete='off' spellcheck='false' role='combobox' aria-expanded='false' aria-controls='FilterMenu'>" +
		"<button type='button' class='fsearch-close' aria-label='Close search'>" + ICON_X + "</button></div>";
	var btn = {};
	bar.querySelectorAll("[data-menu]").forEach(function (b) { btn[b.dataset.menu] = b; });
	var NAMES = { years: "Years", missions: "Missions", crew: "Crew" };

	function syncBar() {
		var texts = { years: yearsText(), missions: missionsText(), crew: crewText() };
		Object.keys(btn).forEach(function (k) {
			var t = texts[k], b = btn[k];
			b.classList.toggle("is-set", !!t);
			b.querySelector(".fvt").textContent = t || NAMES[k];
			b.setAttribute("aria-label", NAMES[k] + ": " + (t || "all"));
		});
		document.body.classList.toggle("filters-active", !!active());
		syncLegends();
	}

	// ---- countries: the legends are the switches ---------------------------------------

	function countryOn(c) { return !S.countries.size || S.countries.has(c); }
	function syncLegends() {
		d3.selectAll("#SummaryLegend .sum-item, #BarLegend .legend-item").each(function (d) {
			var key = d && d.key !== undefined ? d.key : d;
			this.classList.toggle("off", !countryOn(key));
			this.classList.toggle("solo", S.countries.has(key));
			this.setAttribute("role", "button");
			this.tabIndex = 0;
			this.setAttribute("aria-pressed", String(S.countries.has(key)));
			this.title = S.countries.has(key) ? "Click to remove " + key
			           : S.countries.size ? "Click to add " + key : "Click to show only " + key;
		});
	}
	function toggleCountry(c) {
		if (!S.countries.size) S.countries.add(c);                 // first click: only this one
		else if (S.countries.has(c)) S.countries.delete(c);
		else S.countries.add(c);
		if (S.countries.size === Countries.length) S.countries.clear();
		apply();
	}
	function legendKey(el) { var d = d3.select(el).datum(); return d && d.key !== undefined ? d.key : d; }
	document.addEventListener("click", function (e) {
		var it = e.target.closest && e.target.closest("#SummaryLegend .sum-item, #BarLegend .legend-item");
		if (it) toggleCountry(legendKey(it));
	});
	document.addEventListener("keydown", function (e) {
		var it = e.target.closest && e.target.closest("#SummaryLegend .sum-item, #BarLegend .legend-item");
		if (it && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleCountry(legendKey(it)); }
	});

	function apply() {
		syncBar();
		writeHash();
		if (openName && openName !== "search") renderMenu();      // checks follow the state
		onChange();
	}

	// ---- the menu --------------------------------------------------------------------------

	var menu = document.createElement("div");
	menu.className = "fmenu fpanel";
	menu.id = "FilterMenu";
	menu.hidden = true;
	document.body.appendChild(menu);
	var openName = null;

	function place(anchor) {
		var r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
		var w = menu.offsetWidth, h = menu.offsetHeight;
		var left = Math.min(Math.max(8, r.left), vw - w - 8);
		var top = r.bottom + 6 + h > vh - 8 && r.top - 6 - h > 8 ? r.top - 6 - h : r.bottom + 6;
		menu.style.left = left + "px";
		menu.style.top = Math.max(8, top) + "px";
	}
	function openMenu(name) {
		closeMenu(false);
		openName = name;
		menu.hidden = false;
		menu.setAttribute("role", name === "search" ? "listbox" : "dialog");
		menu.setAttribute("aria-label", name === "search" ? "Results" : NAMES[name] + " filter");
		renderMenu();
		if (btn[name]) btn[name].setAttribute("aria-expanded", "true");
		requestAnimationFrame(function () { menu.classList.add("show"); });
		if (name !== "search") {
			var first = menu.querySelector("[aria-checked=true], .fmenu-item, [role=slider]");
			if (first) first.focus({ preventScroll: true });
		}
	}
	function closeMenu(refocus) {
		if (!openName) return;
		var was = openName;
		openName = null;
		menu.hidden = true;
		menu.classList.remove("show");
		menu.innerHTML = "";
		if (btn[was]) {
			btn[was].setAttribute("aria-expanded", "false");
			if (refocus) btn[was].focus({ preventScroll: true });
		}
	}
	function renderMenu() {
		var keep = document.activeElement && menu.contains(document.activeElement) ? document.activeElement.dataset.id : null;
		menu.className = "fmenu fpanel show fpanel-" + openName;
		if (openName === "years") renderYears();
		else if (openName === "missions") renderMissions();
		else if (openName === "crew") renderCrew();
		else if (openName === "search") renderResults();
		place(openName === "search" ? bar : btn[openName]);
		if (keep) { var el = menu.querySelector("[data-id='" + keep + "']"); if (el) el.focus({ preventScroll: true }); }
	}

	function head(text) { return "<div class='fmenu-head' role='presentation'>" + esc(text) + "</div>"; }
	function check(id, label, on, note) {
		return "<button type='button' class='fmenu-item' role='menuitemcheckbox' data-id='" + esc(id) + "' aria-checked='" + on + "'>" +
		       esc(label) + (note ? "<span class='fmenu-note'>" + esc(note) + "</span>" : "") + "</button>";
	}
	function clearRow(id, label) {
		return "<button type='button' class='fmenu-clear' data-id='" + id + "'>" + esc(label) + "</button>";
	}
	// how many missions each choice has (with the other filters as they are)
	function countMissions(test) {
		return allMissions.filter(function (m) { return test(m); }).length;
	}

	function renderMissions() {
		var inYears = function (m) { var y = +m.Year; return S.y0 === null || (y >= S.y0 && y <= S.y1); };
		var html = head("Where to");
		DEST.forEach(function (d) {
			html += check("d:" + d[0], d[1], S.dest.has(d[0]), countMissions(m => inYears(m) && destOf(m) === d[0]));
		});
		html += head("Station");
		STATIONS.forEach(function (s) {
			html += check("s:" + s, s, S.stations.has(s) || S.dest.has("station"),
			              countMissions(m => inYears(m) && destOf(m) === "station" && stationOf(m) === s));
		});
		html += head("Outcome");
		html += check("lost", "Crew lost", S.lost, countMissions(m => inYears(m) && m.Fatality === "Y"));
		if (S.dest.size || S.stations.size || S.lost) html += clearRow("clear", "Any mission");
		menu.innerHTML = html;
	}
	function renderCrew() {
		var html = head("Who");
		[["", "Everyone"], ["Female", "Women"], ["Male", "Men"]].forEach(function (g) {
			html += "<button type='button' class='fmenu-item' role='menuitemradio' data-id='g:" + g[0] + "' aria-checked='" + (S.gender === g[0]) + "'>" + g[1] +
			        (g[0] ? "<span class='fmenu-note'>" + allAstronauts.filter(a => a.Gender === g[0]).length + "</span>" : "") + "</button>";
		});
		html += head("Status");
		STATUS.forEach(function (s) { html += check("st:" + s, s, S.status.has(s), allAstronauts.filter(a => a.Status === s).length); });
		html += head("Experience");
		html += check("eva", "Spacewalkers", S.walkers, allAstronauts.filter(a => +a["Space Walks"] > 0).length);
		html += "<p class='fmenu-hint'>" + (isMissionMode() ? "Missions view: missions with such a person aboard."
		                                                       : "Astronauts view: the people themselves.") + "</p>";
		if (crewSet()) html += clearRow("clear", "Any crew");
		menu.innerHTML = html;
	}

	// years: launches per year as bars, the picked range lit, two handles
	var drag = null;
	function renderYears() {
		var a = S.y0 === null ? MIN : S.y0, b = S.y0 === null ? MAX : S.y1;
		var W = 300, H = 64, n = MAX - MIN + 1, bw = W / n, top = d3.max(Object.values(perYear)) || 1;
		var bars = "";
		for (var y = MIN; y <= MAX; y++) {
			var h = Math.max(1.5, (perYear[y] || 0) / top * (H - 4));
			bars += "<rect x='" + ((y - MIN) * bw + 0.5).toFixed(1) + "' y='" + (H - h).toFixed(1) + "' width='" + Math.max(1, bw - 1).toFixed(1) +
			        "' height='" + h.toFixed(1) + "' class='" + (y >= a && y <= b ? "in" : "") + "'/>";
		}
		var html = "<div class='fy-top'><span class='fy-range'>" + (a === b ? a : a + " – " + b) + "</span>" +
		           "<span class='fy-count'>" + countMissions(m => +m.Year >= a && +m.Year <= b) + " launches</span></div>" +
		           "<div class='fy-chart'><svg viewBox='0 0 " + W + " " + H + "' preserveAspectRatio='none' aria-hidden='true'>" + bars + "</svg>" +
		           "<div class='fy-track'><div class='fy-sel' style='left:" + pct(a) + "%;right:" + (100 - pct(b + 1)) + "%'></div>" +
		           thumb("y0", a, "From") + thumb("y1", b, "To") + "</div></div>" +
		           "<div class='fy-axis'><span>" + MIN + "</span><span>" + Math.round((MIN + MAX) / 2) + "</span><span>" + MAX + "</span></div>" +
		           head("Eras") + "<div class='fy-eras'>";
		ERAS.forEach(function (e) {
			var on = S.y0 === e[1] && S.y1 === e[2];
			html += "<button type='button' class='fy-era' data-id='era:" + e[1] + "' aria-pressed='" + on + "'><b>" + e[0] + "</b><span>" + e[1] + "–" + (e[2] === NOW ? "now" : e[2]) + "</span></button>";
		});
		html += "</div>";
		if (S.y0 !== null) html += clearRow("clear", "All years");
		menu.innerHTML = html;
	}
	function pct(y) { return 100 * (y - MIN) / (MAX - MIN + 1); }
	function thumb(id, v, label) {
		return "<span class='fy-thumb' role='slider' tabindex='0' data-id='" + id + "' aria-label='" + label + "' aria-valuemin='" + MIN +
		       "' aria-valuemax='" + MAX + "' aria-valuenow='" + v + "' style='left:" + pct(v + 0.5) + "%'></span>";
	}
	function yearAt(clientX) {
		var r = menu.querySelector(".fy-track").getBoundingClientRect();
		return Math.max(MIN, Math.min(MAX, MIN + Math.floor((clientX - r.left) / r.width * (MAX - MIN + 1))));
	}
	function setYears(a, b, now) {
		if (a > b) { var t = a; a = b; b = t; }
		if (a === MIN && b === MAX) { S.y0 = S.y1 = null; } else { S.y0 = a; S.y1 = b; }
		if (now) apply(); else { syncBar(); renderMenu(); }
	}

	menu.addEventListener("pointerdown", function (e) {
		if (openName !== "years") return;
		var chart = e.target.closest(".fy-chart");
		if (!chart) return;
		e.preventDefault();
		var a = S.y0 === null ? MIN : S.y0, b = S.y0 === null ? MAX : S.y1, y = yearAt(e.clientX);
		var th = e.target.closest(".fy-thumb");
		// a handle moves its end; elsewhere a new range is drawn from here
		drag = th ? { fixed: th.dataset.id === "y0" ? b : a } : { fixed: y };
		if (!th) setYears(y, y, false);
		menu.setPointerCapture(e.pointerId);     // the chart is redrawn while dragging; the panel stays
	});
	menu.addEventListener("pointermove", function (e) {
		if (!drag) return;
		setYears(drag.fixed, yearAt(e.clientX), false);
	});
	function endDrag() { if (drag) { drag = null; apply(); } }
	menu.addEventListener("pointerup", endDrag);
	menu.addEventListener("pointercancel", endDrag);

	menu.addEventListener("click", function (e) {
		e.stopPropagation();
		var el = e.target.closest("[data-id]");
		if (!el) return;
		var id = el.dataset.id;
		if (id === "clear") {
			if (openName === "years") S.y0 = S.y1 = null;
			if (openName === "missions") { S.dest.clear(); S.stations.clear(); S.lost = false; }
			if (openName === "crew") { S.gender = ""; S.status.clear(); S.walkers = false; }
			apply();
			return;
		}
		if (id.indexOf("era:") === 0) {
			var era = ERAS.find(x => x[1] === +id.slice(4));
			if (S.y0 === era[1] && S.y1 === era[2]) S.y0 = S.y1 = null; else { S.y0 = era[1]; S.y1 = era[2]; }
			apply();
			return;
		}
		if (id.indexOf("d:") === 0) toggle(S.dest, id.slice(2));
		else if (id.indexOf("s:") === 0) {
			var s = id.slice(2);
			if (S.dest.has("station")) { S.dest.delete("station"); STATIONS.forEach(x => { if (x !== s) S.stations.add(x); }); }
			else toggle(S.stations, s);
			if (S.stations.size === STATIONS.length) { S.stations.clear(); S.dest.add("station"); }
		}
		else if (id === "lost") S.lost = !S.lost;
		else if (id.indexOf("g:") === 0) S.gender = id.slice(2);
		else if (id.indexOf("st:") === 0) toggle(S.status, id.slice(3));
		else if (id === "eva") S.walkers = !S.walkers;
		else if (id.indexOf("r:") === 0) { choose(+id.slice(2)); return; }
		apply();
	});
	function toggle(set, v) { if (set.has(v)) set.delete(v); else set.add(v); }

	menu.addEventListener("keydown", function (e) {
		var th = e.target.closest && e.target.closest(".fy-thumb");
		if (th) {
			var step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 }[e.key];
			if (step || e.key === "Home" || e.key === "End") {
				e.preventDefault();
				var a = S.y0 === null ? MIN : S.y0, b = S.y0 === null ? MAX : S.y1, lo = th.dataset.id === "y0";
				var v = (lo ? a : b) + (step || 0);
				if (e.key === "Home") v = MIN;
				if (e.key === "End") v = MAX;
				v = Math.max(MIN, Math.min(MAX, v));
				if (lo) setYears(Math.min(v, b), b, true); else setYears(a, Math.max(v, a), true);
				return;
			}
		}
		var items = Array.prototype.slice.call(menu.querySelectorAll("button, [role=slider]"));
		var i = items.indexOf(document.activeElement);
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
		} else if (e.key === "Escape") {
			e.preventDefault(); e.stopPropagation(); closeMenu(true);
		} else if (e.key === "Tab" && !e.shiftKey && i === items.length - 1) {
			closeMenu(true);
		}
	});

	Object.keys(btn).forEach(function (k) {
		btn[k].addEventListener("click", function (e) {
			e.stopPropagation();
			if (openName === k) closeMenu(true); else openMenu(k);
		});
		btn[k].addEventListener("keydown", function (e) {
			if (e.key === "ArrowDown") { e.preventDefault(); openMenu(k); }
		});
	});
	bar.querySelector(".fb-reset").addEventListener("click", function (e) {
		e.stopPropagation();
		S = blank();
		closeMenu(false);
		apply();
	});
	document.addEventListener("click", function (e) {
		if (!menu.contains(e.target) && !(e.target.closest && e.target.closest(".fsearch"))) closeMenu(false);
	});
	window.addEventListener("resize", function () { if (openName) place(openName === "search" ? bar : btn[openName]); });
	document.addEventListener("scroll", function (e) {
		if (openName && !menu.contains(e.target)) closeMenu(false);
	}, { capture: true, passive: true });

	// ---- search ---------------------------------------------------------------------------

	var box = bar.querySelector(".fsearch"), input = box.querySelector("input"), results = [], hit = 0;
	function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
	function find(q) {
		q = norm(q.trim());
		if (!q) return [];
		var out = [];
		function score(text) {
			var t = norm(text);
			if (t === q) return 0;
			if (t.indexOf(q) === 0) return 1;
			if ((" " + t).indexOf(" " + q) >= 0 || t.indexOf("(" + q) >= 0) return 2;
			if (t.indexOf(q) >= 0) return 3;
			return -1;
		}
		allMissions.forEach(function (m) {
			var s = Math.min.apply(null, [score(m["Launch Mission"]), score(m.Callsign)].filter(v => v >= 0).concat([9]));
			if (s < 9) out.push({ s: s, type: "mission", d: m, title: m["Launch Mission"],
			                      sub: (m.Callsign ? m.Callsign + " · " : "") + m.Year + " · " + m.Country, key: "t:p:" + m["Launch Mission"] });
		});
		allAstronauts.forEach(function (a) {
			if (a.Stub) return;
			var s = score(a.Name);
			if (s >= 0) out.push({ s: s, type: "astronaut", d: a, title: a.Name,
			                       sub: (a.Nationality || a.Country) + " · " + a["Space Flights"] + (a["Space Flights"] == 1 ? " flight" : " flights"), key: "t:a:" + a.Name });
		});
		out.sort(function (x, y) { return x.s - y.s || (x.type === y.type ? (x.title < y.title ? -1 : 1) : x.type === "astronaut" ? -1 : 1); });
		return out.slice(0, 8);
	}
	function renderResults() {
		if (!input.value.trim()) { menu.innerHTML = "<p class='fmenu-hint'>Type a name: Vostok 1, Apollo 11, Tereshkova, Shenzhou…</p>"; return; }
		if (!results.length) { menu.innerHTML = "<p class='fmenu-hint'>Nothing found.</p>"; return; }
		menu.innerHTML = results.map(function (r, i) {
			var img = Photos.peek(r.key);
			return "<button type='button' class='fres" + (i === hit ? " hit" : "") + "' role='option' id='fres" + i + "' data-id='r:" + i + "' aria-selected='" + (i === hit) + "'>" +
			       "<span class='fres-ava" + (r.type === "astronaut" ? " round" : "") + "'" + (img ? " style='background-image:url(\"" + img + "\")'" : "") + ">" +
			       (img ? "" : esc(Info.initials(r.title))) + "</span>" +
			       "<span class='fres-text'><b>" + esc(r.title) + "</b><span>" + esc(r.sub) + "</span></span>" +
			       "<span class='fres-kind'>" + (r.type === "mission" ? "Mission" : "Astronaut") + "</span></button>";
		}).join("");
		input.setAttribute("aria-activedescendant", "fres" + hit);
	}
	function choose(i) {
		var r = results[i];
		if (!r) return;
		closeSearch();
		graph.clicked({ type: r.type, value: r.d });
	}
	function openSearch() {
		box.hidden = false;
		bar.classList.add("searching");
		input.value = "";
		results = []; hit = 0;
		input.focus();
		openMenu("search");
		input.setAttribute("aria-expanded", "true");
	}
	function closeSearch() {
		box.hidden = true;
		bar.classList.remove("searching");
		input.setAttribute("aria-expanded", "false");
		if (openName === "search") closeMenu(false);
	}
	bar.querySelector(".fb-search").addEventListener("click", function (e) { e.stopPropagation(); openSearch(); });
	box.querySelector(".fsearch-close").addEventListener("click", function (e) { e.stopPropagation(); closeSearch(); bar.querySelector(".fb-search").focus(); });
	input.addEventListener("input", function () {
		results = find(input.value); hit = 0;
		if (openName !== "search") openMenu("search"); else renderMenu();
		// the little pictures: the tiny packs of the results
		Photos.warm(results.map(r => r.key));
	});
	input.addEventListener("keydown", function (e) {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (results.length) { hit = (hit + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length; renderMenu(); }
		} else if (e.key === "Enter") {
			e.preventDefault(); choose(hit);
		} else if (e.key === "Escape") {
			e.preventDefault(); e.stopPropagation(); closeSearch(); bar.querySelector(".fb-search").focus();
		}
	});

	// ---- setup ------------------------------------------------------------------------------

	function init(missions, astronauts, change) {
		allMissions = missions;
		allAstronauts = astronauts;
		onChange = change;
		byName = new Map(astronauts.map(a => [a.Name, a]));
		perYear = {};
		missions.forEach(function (m) { perYear[+m.Year] = (perYear[+m.Year] || 0) + 1; });
		MIN = d3.min(missions, m => +m.Year) || MIN;
		MAX = Math.max(NOW, d3.max(missions, m => +m.Year) || NOW);
		syncBar();
	}
	syncBar();

	return { init: init, matchMission: matchMission, matchAstronaut: matchAstronaut, passUnknown: passUnknown,
	         active: active, syncLegends: syncLegends, writeHash: writeHash };
})();
