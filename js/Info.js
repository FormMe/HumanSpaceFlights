// Details card of a mission or an astronaut: photo (and patch), key numbers,
// grouped facts, crew / missions as links, Wikipedia link and image credits.
class Info{

	update(data, isMission){
		this.remove();
		this.d = data;
		this.isMission = isMission;
		this.draw(isMission ? this.mission(data) : this.astronaut(data));
		if (isMission) {
			this.media("m:" + data["Launch Mission"], data["Photo URL"], "p:" + data["Launch Mission"], !!data["Patch URL"]);
			this.links(data["Wikipedia"], [
				["Photo", data["Photo Credit"], data["Photo Page"], data["Photo URL"]],
				["Patch", data["Patch Credit"], data["Patch Page"], data["Patch URL"]]]);
		} else {
			this.media("a:" + data["Name"], data["Photo URL"], null, false, true);
			this.links(data["Wikipedia"], [["Photo", data["Photo Credit"], data["Photo Page"], data["Photo URL"]]]);
		}
		this.reveal();
		this.sync();
	}

	// the list row and the plot line follow the card, whatever opened it
	// (a row, a graph node, a crew / mission button)
	sync() {
		if (typeof selectionList !== "undefined") selectionList.markActive(this.d);
		if (typeof renderList === "function" && typeof curData !== "undefined" && curData) renderList();
	}

	// bring the card into view, smoothly, when its top is out of sight or low on
	// the screen (phones show it as a bottom sheet instead)
	reveal() {
		if (window.matchMedia("(max-width: 760px)").matches) return;
		var card = document.getElementById("Info");
		var top = card.getBoundingClientRect().top, vh = window.innerHeight;
		if (top >= 0 && top < vh * 0.45) return;
		var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		window.scrollTo({ top: window.pageYOffset + top - 16, behavior: smooth ? "smooth" : "auto" });
	}

	mission(d) {
		var inOrbit = !d["Return Data"];
		var days = inOrbit ? (new Date() - new Date(d["Launch Data"])) / 864e5 : +d["Duration"] || 0;
		var exact = Info.flightDays(d["Flight Time"]);      // '9 d 1 h' beats a difference of dates
		if (!inOrbit && exact) days = exact;
		var dur = Info.span(d["Launch Data"], d["Return Data"], days);
		var badges = [];
		if (inOrbit) badges.push(["live", "In orbit"]);
		if (d["Fatality"] == "Y") badges.push(["sad", "Crew lost"]);
		if (d["Sub Orbital"] == "Y") badges.push(["", "Suborbital"]);
		var crew = (d["Members"] || []).map(function (name) {
			var a = Info.find(astronauts, x => x.Name == name);
			return { label: name, key: "t:a:" + name, round: true, open: a && !a.Stub ? () => graph.clicked({ type: "astronaut", value: a }) : null };
		});
		return {
			title: d["Launch Mission"],
			sub: [(d["Country Flag"] || "") + " " + esc(d.Country), d["Operator"]],
			badges: badges,
			stats: [
				!inOrbit && days < 2 && d["Flight Time"] ? [d["Flight Time"], "in flight"] : [dur[0], dur[1], inOrbit ? "so far" : d["Flight Time"]],
				[d["Crew size"], +d["Crew size"] == 1 ? "astronaut" : "astronauts"],
				[Info.date(d["Launch Data"]), "launch"],
				[d["Habitation"] && d["Habitation"] != "Space" ? d["Habitation"] : "Orbit", "destination"]
			],
			lead: d["Description"] || d["Brief Mission Summary"],
			summary: d["Description"] && d["Brief Mission Summary"] ? d["Brief Mission Summary"] : "",
			groups: [
				["Flight", [
					["Launch", Info.date(d["Launch Data"], true), d["Launch Site"]],
					["Landing", inOrbit ? "still in orbit" : Info.date(d["Return Data"], true), d["Landing Site"]],
					["Callsign", Info.clean(d["Callsign"])]]],
				["Vehicle", [
					["Rocket", d["Rocket"]],
					["Spacecraft", d["Spacecraft"]]]]
			],
			people: ["Crew", crew]
		};
	}

	astronaut(d) {
		var hours = +d["Space Flight (hr)"] || 0;
		var evas = +d["Space Walks"] || 0;
		var born = Info.parse(d["Birth Date"]);
		var died = Info.parse(d["Death Date"]);
		var age = born ? Math.floor(((died || new Date()) - born) / 31557600000) : null;
		var names = (d["Missions"] || []).filter(Boolean);
		(missions_list() || []).forEach(function (m) {      // also every mission whose crew lists the person
			if (m.Members.includes(d.Name) && !names.includes(m["Launch Mission"])) names.push(m["Launch Mission"]);
		});
		var missions = names.map(function (name) {
			var m = Info.find(missions_list(), x => x["Launch Mission"] == name);
			return { label: name, sub: m ? m.Year : "", key: "t:p:" + name,
			         open: m ? () => graph.clicked({ type: "mission", value: m }) : null };
		});
		var firstYear = d3.min(missions, m => +m.sub || Infinity);
		var badges = [];
		if (d["Status"]) badges.push([/active/i.test(d["Status"]) ? "live" : "", d["Status"]]);
		if (d["Death Mission"]) badges.push(["sad", "Died on " + d["Death Mission"]]);
		return {
			title: d["Name"],
			sub: [(d["Country Flag"] || "") + " " + esc(d.Nationality || d.Country), d["Agency"]],
			badges: badges,
			stats: [
				[+d["Space Flights"] || missions.length, (+d["Space Flights"] || missions.length) == 1 ? "flight" : "flights"],
				hours && hours < 48 ? [Math.round(hours), "hours in space"] : [hours ? Info.num(hours / 24) : "—", "days in space"],
				[evas || "0", evas == 1 ? "spacewalk" : "spacewalks", evas ? Math.round(+d["Space Walks (hr)"] || 0) + " h outside" : ""],
				[isFinite(firstYear) ? firstYear : (d["Year"] ? parseInt(d["Year"]) : "—"), isFinite(firstYear) ? "first flight" : "selected"]
			],
			lead: d["Bio"],
			groups: [
				["Personal", [
					["Born", Info.date(d["Birth Date"], true) + (age !== null && !died ? " · age " + age : ""), d["Birth Place"]],
					["Died", died ? Info.date(d["Death Date"], true) + (age !== null ? " · aged " + age : "") : ""],
					["Gender", d["Gender"]]]],
				["Career", [
					["Selected", d["Year"] ? parseInt(d["Year"]) : ""],
					["Education", Info.semi(d["Alma Mater"])],
					["Military", [d["Military Rank"], d["Military Branch"]].filter(Boolean).join(", ")]]]
			],
			people: ["Missions", missions]
		};
	}

	draw(c) {
		var info = document.getElementById("Info");
		var body = document.getElementById("InfoBody");
		info.classList.toggle("has-data", !!c);
		if (!c) { body.innerHTML = ""; return; }
		var e = Info.esc;
		var html = "<header class='ic-head'><h2 class='ic-title'>" + e(c.title) + "</h2>" +
			"<p class='ic-sub'>" + c.sub.filter(s => s && String(s).trim()).map((s, i) => i ? e(s) : s).join("<span class='ic-dot'>·</span>") + "</p>" +
			(c.badges.length ? "<p class='ic-badges'>" + c.badges.map(b => "<span class='ic-badge " + b[0] + "'>" + e(b[1]) + "</span>").join("") + "</p>" : "") +
			"</header>";
		html += "<div class='ic-stats'>" + c.stats.map(s =>
			"<div class='ic-stat'><b" + (String(s[0]).length > 6 ? " class='long'" : "") + ">" + e(s[0]) + "</b><span>" + e(s[1]) + "</span>" + (s[2] ? "<small>" + e(s[2]) + "</small>" : "") + "</div>").join("") + "</div>";
		if (c.lead) {
			var long = c.lead.length > 260;
			html += "<div class='ic-lead" + (long ? " clamp" : "") + "'><p>" + e(c.lead) + "</p>" +
				(long ? "<button type='button' class='ic-more'>Read more</button>" : "") + "</div>";
		}
		if (c.summary && !Info.same(c.summary, c.lead)) html += "<p class='ic-note'>" + e(c.summary) + "</p>";
		c.groups.forEach(function (g) {
			var rows = g[1].filter(r => r[1] && String(r[1]).trim() && r[1] != "NaN");
			if (!rows.length) return;
			html += "<section class='ic-group'><h3>" + g[0] + "</h3><dl>" + rows.map(r =>
				"<div><dt>" + r[0] + "</dt><dd>" + e(r[1]) + (r[2] ? "<small>" + e(r[2]) + "</small>" : "") + "</dd></div>").join("") + "</dl></section>";
		});
		var people = c.people[1];
		if (people.length) {
			html += "<section class='ic-group'><h3>" + c.people[0] + " <em>" + people.length + "</em></h3><div class='ic-people'>" +
				people.map((p, i) => "<button type='button' class='ic-person" + (p.open ? "" : " off") + "' data-i='" + i + "'" + (p.open ? "" : " disabled") + ">" +
					"<span class='ic-ava" + (p.round ? " round" : "") + "' data-key='" + e(p.key) + "'>" + e(Info.initials(p.label)) + "</span>" +
					"<span class='ic-pname'>" + e(p.label) + (p.sub ? "<small>" + e(p.sub) + "</small>" : "") + "</span></button>").join("") +
				"</div></section>";
		}
		body.innerHTML = html;

		var more = body.querySelector(".ic-more");
		if (more) more.addEventListener("click", function () {
			var box = more.parentNode;
			box.classList.toggle("clamp");
			more.textContent = box.classList.contains("clamp") ? "Read more" : "Show less";
		});
		body.querySelectorAll(".ic-person").forEach(function (el) {
			var p = people[+el.dataset.i];
			if (p.open) el.addEventListener("click", p.open);
		});
		// small portraits / patches next to the names, when we have them
		body.querySelectorAll(".ic-ava").forEach(function (el) {
			function put(src) { if (src && el.isConnected) { el.style.backgroundImage = "url(" + src + ")"; el.classList.add("img"); } }
			var now = Photos.peek(el.dataset.key);      // tiny copies are usually here already
			if (now) put(now); else Photos.get(el.dataset.key).then(put, function () {});
		});
	}

	// photo (and mission patch): small packed copy at once, sharp original if allowed
	media(photoKey, photoUrl, patchKey, hasPatch, portrait) {
		var box = document.getElementById("InfoMedia");
		var photo = document.getElementById("InfoPhoto");
		var patch = document.getElementById("InfoPatch");
		box.classList.toggle("portrait", !!portrait);
		box.hidden = !photoUrl && !hasPatch;
		box.classList.toggle("no-photo", !photoUrl);
		if (photoUrl) Photos.show(photo, photoKey, photoUrl); else { photo.hidden = true; photo.dataset.key = ""; }
		photo.dataset.full = photoUrl || "";
		var self = this;
		if (!photo.dataset.zoomable) {          // tap the photo: full screen
			photo.dataset.zoomable = "1";
			photo.addEventListener("click", function () { Lightbox.open(photo, self.photoCaption()); });
			Info.pressable(photo, "Open the photo full screen");
		}
		if (hasPatch) Photos.show(patch, patchKey, null); else { patch.hidden = true; patch.dataset.key = ""; }
		patch.classList.remove("zoomed");
		var name = this.d ? (this.isMission ? this.d["Launch Mission"] : this.d.Name) : "";
		photo.alt = name ? (portrait ? "Portrait of " : "Photo of ") + name : "";
		patch.alt = name ? name + " mission patch" : "Mission patch";
		if (!patch.dataset.zoomable) {          // tap the patch: it grows, tap again: back
			patch.dataset.zoomable = "1";
			patch.addEventListener("click", function () {
				patch.setAttribute("aria-pressed", String(patch.classList.toggle("zoomed")));
			});
			Info.pressable(patch, "Enlarge the mission patch");
		}
	}

	photoCaption() {
		var d = this.d || {};
		var name = this.isMission ? d["Launch Mission"] : d.Name;
		var credit = d["Photo Credit"] ? " <span>Photo: " + Info.esc(d["Photo Credit"]) + "</span>" : "";
		return "<b>" + Info.esc(name || "") + "</b>" + credit;
	}

	links(wiki, credits) {
		var el = document.getElementById("InfoLinks");
		var html = "";
		wiki = safeUrl(wiki);          // only http(s) links from the data
		if (wiki) html += "<a class='info-wiki' href='" + wiki + "' target='_blank' rel='noopener'>" +
			"<svg width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round'><path d='M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M9 2h5v5M14 2L7.5 8.5'/></svg>" +
			"Read on Wikipedia</a>";
		var lines = credits.filter(c => c[3]).map(c =>
			"<span>" + c[0] + ": " + (safeUrl(c[2]) ? "<a href='" + safeUrl(c[2]) + "' target='_blank' rel='noopener'>" + Info.esc(c[1] || "Wikimedia Commons") + "</a>"
			                              : Info.esc(c[1] || "Wikimedia Commons")) + "</span>");
		if (lines.length) html += "<p class='info-credits'>" + lines.join("") + "</p>";
		el.innerHTML = html;
		el.hidden = !html;
	}

	remove(){
		if (this.d) this.d.highlighted = false;
		this.d = null;
		this.draw(null);
		this.sync();
		var media = document.getElementById("InfoMedia");
		if (media) {
			media.hidden = true;
			document.getElementById("InfoPhoto").dataset.key = "";
			document.getElementById("InfoPatch").dataset.key = "";
			document.getElementById("InfoLinks").hidden = true;
		}
	}

	// ---- helpers ----
	static esc(s) { return esc(s); }       // common.js
	// an image that acts as a button: focusable, Enter / Space click it
	static pressable(el, label) {
		el.tabIndex = 0;
		el.setAttribute("role", "button");
		el.title = label;
		el.addEventListener("keydown", function (e) {
			if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
		});
	}
	static find(list, test) { return list ? list.find(test) : null; }
	static parse(s) {
		if (!s) return null;
		var d = new Date(s);
		return isNaN(d) ? null : d;
	}
	static date(s, long) {
		var d = Info.parse(s);
		if (!d) return s || "";
		var m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
		return long ? d.getUTCDate() + " " + m + " " + d.getUTCFullYear() : m + " " + d.getUTCFullYear();
	}
	static num(x) { return x >= 10 ? d3.format(",")(Math.round(x)) : String(Math.round(x * 10) / 10); }
	// launch dates have day precision: short flights are "<1 day"
	static span(from, to, days) {
		if (days >= 1) return [Info.num(days), Math.round(days) == 1 ? "day" : "days"];
		return ["<1", "day"];
	}
	static clean(s) {
		s = String(s || "").replace(/^[\s\-–—"'(]+|[\s\-–—"')]+$/g, "").trim();
		if ((s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length) s += ")";   // "Дербент (Derbent"
		return /[a-zа-я0-9]/i.test(s) ? s : "";
	}
	// the short summary of new missions is the same Wikipedia intro
	static same(a, b) {
		function norm(x) { return String(x || "").replace(/\([^()]*\)/g, "").replace(/[^a-z0-9]+/gi, "").toLowerCase(); }
		a = norm(a); b = norm(b);
		return !a || b.indexOf(a) >= 0 || a.slice(0, 60) === b.slice(0, 60);
	}
	static flightDays(t) {
		var m = String(t || "").match(/(\d+(?:\.\d+)?)\s*(d|h|min)/g);
		if (!m) return 0;
		return m.reduce(function (sum, part) {
			var v = parseFloat(part), u = part.replace(/[\d.\s]/g, "");
			return sum + (u == "d" ? v : u == "h" ? v / 24 : v / 1440);
		}, 0);
	}
	static semi(s) { return String(s || "").split(/;\s*/).filter(Boolean).join(" · "); }
	static initials(name) {
		var w = String(name).replace(/\(.*?\)/g, "").split(/[\s-]+/).filter(Boolean);
		if (/\d/.test(name)) return (w[0] || "").slice(0, 3).toUpperCase();
		return ((w[0] || "")[0] || "") + ((w.length > 1 ? w[w.length - 1][0] : "") || "");
	}
}

function missions_list() { return typeof missions !== "undefined" ? missions : null; }
