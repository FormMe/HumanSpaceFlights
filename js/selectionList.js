// List of missions / astronauts: sortable columns, and the size of things
// shown at a glance (dots for crew and flights, bars for time in space).
class SelectionList{
	constructor(color, graph, info){
		this.color = color;
		this.graph = graph;
		this.info = info;
		this.sort = { missions: null, astronauts: null };   // {key, dir}

		var dash = "<span class='lt-none'>—</span>";
		function flagName(flag, name, sub) {
			return "<span class='lt-name'><span class='lt-flag'>" + (flag || "") + "</span>" +
			       "<span class='lt-text'><b>" + esc(name) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></span>";
		}
		function dots(n, max) {
			n = +n || 0;
			var shown = Math.min(n, max), out = "";
			for (var i = 0; i < shown; i++) out += "<i></i>";
			return "<span class='lt-dots' title='" + n + "'>" + out + (n > max ? "<em>+" + (n - max) + "</em>" : "") + "</span>";
		}
		var self = this;
		function bar(value, max, label, country) {
			var w = max > 0 && value > 0 ? Math.max(2, 100 * value / max) : 0;
			return "<span class='lt-bar'><span class='lt-track'><span style='width:" + w.toFixed(1) +
			       "%;background:" + self.color(country) + "'></span></span><span class='lt-val'>" + label + "</span></span>";
		}
		function days(d) { return d < 1.5 ? Math.max(1, Math.round(d * 24)) + " h" : d >= 10 ? d3.format(",")(Math.round(d)) + " d" : (Math.round(d * 10) / 10) + " d"; }

		this.columns = {
			missions: [
				{ key: "name", label: "Mission", type: "text", value: d => d["Launch Mission"],
				  html: d => flagName(d["Country Flag"], d["Launch Mission"], d.Habitation + " · " + d.Year) },
				{ key: "date", label: "Launched", type: "text", value: d => d["Launch Data"],
				  html: d => "<span class='lt-date'>" + d["Launch Data"] + "</span>" },
				{ key: "crew", label: "Crew", type: "num", value: d => +d["Crew size"] || 0,
				  html: d => dots(d["Crew size"], 7) },
				{ key: "dur", label: "Duration", type: "num", value: missionDays,
				  html: function (d) {
				  	var inOrbit = !d["Return Data"];
				  	return bar(missionDays(d), self.maxDuration, inOrbit ? "in orbit" : days(missionDays(d)), d.Country);
				  } }
			],
			astronauts: [
				{ key: "name", label: "Astronaut", type: "text", value: d => d.Name,
				  html: d => flagName(d["Country Flag"], d.Name, d.Stub ? "" : (d.Nationality || d.Country)) },
				{ key: "flights", label: "Flights", type: "num", value: d => +d["Space Flights"] || 0,
				  html: d => dots(d["Space Flights"], 6) },
				{ key: "space", label: "In space", type: "num", value: d => +d["Space Flight (hr)"] || 0,
				  html: d => bar((+d["Space Flight (hr)"] || 0) / 24, self.maxSpaceDays,
				                 d["Space Flight (hr)"] ? days((+d["Space Flight (hr)"] || 0) / 24) : "—", d.Country) },
				{ key: "eva", label: "Spacewalks", type: "num", value: d => +d["Space Walks (hr)"] || 0,
				  html: d => +d["Space Walks"] ? bar(+d["Space Walks (hr)"] || 0, self.maxEvaHours,
				                 (+d["Space Walks"]) + " · " + Math.round(+d["Space Walks (hr)"] || 0) + " h", d.Country) : dash }
			]
		};
	}

	// the scale of the bars comes from the whole dataset, so bars keep their
	// length while filtering
	scales() {
		var now = new Date();
		if (!this.maxDuration && typeof missions !== "undefined" && missions)
			this.maxDuration = d3.max(missions, d => d["Return Data"] ? +d.Duration || 0 : (now - new Date(d["Launch Data"])) / 864e5);
		if (!this.maxSpaceDays && typeof astronauts !== "undefined" && astronauts) {
			this.maxSpaceDays = d3.max(astronauts, d => (+d["Space Flight (hr)"] || 0) / 24);
			this.maxEvaHours = d3.max(astronauts, d => +d["Space Walks (hr)"] || 0);
		}
	}

	update(data, isMissions){
		var self = this, graph = this.graph, info = this.info;
		this.data = data;
		this.isMissions = isMissions;
		this.scales();
		var mode = isMissions ? "missions" : "astronauts";
		var columns = this.columns[mode];
		var create_graph = isMissions ? create_mis_graph : create_astr_graph;

		var rows = data.slice();
		var sort = this.sort[mode];
		if (sort) {
			var col = columns.find(c => c.key === sort.key);
			rows.sort(function (a, b) {
				var x = col.value(a), y = col.value(b);
				var r = col.type === "num" ? (x - y) : String(x).localeCompare(String(y));
				return r * sort.dir;
			});
		}

		var root = d3.select('#grid').attr("class", "lt lt-" + mode);

		// header with sort buttons
		var head = root.selectAll(".header").data([0]);
		head = head.enter().append("div").attr("class", "header").merge(head);
		var hcells = head.selectAll("button").data(columns, c => mode + c.key);
		hcells.exit().remove();
		hcells = hcells.enter().append("button")
			.attr("type", "button")
			.attr("class", c => "cell h-" + c.key)
			.merge(hcells)
			.attr("aria-sort", c => sort && sort.key === c.key ? (sort.dir > 0 ? "ascending" : "descending") : "none")
			.classed("sorted", c => sort && sort.key === c.key)
			.html(c => c.label + "<span class='lt-arrow'>" +
				(sort && sort.key === c.key ? (sort.dir > 0 ? "▲" : "▼") : "▼") + "</span>")
			.on("click", function (c) {
				var cur = self.sort[mode];
				// numbers start with the biggest, text with A
				var first = c.type === "num" ? -1 : 1;
				self.sort[mode] = cur && cur.key === c.key ? { key: c.key, dir: -cur.dir } : { key: c.key, dir: first };
				self.update(self.data, self.isMissions);
				document.getElementById("grid").scrollTop = 0;
			});
		hcells.order();

		// rows
		var sel = root.selectAll(".row").data(rows, d => isMissions ? d["Launch Mission"] : d.Name);
		sel.exit().remove();
		// a row is a button: reachable with Tab, opened with Enter or Space
		sel = sel.enter().append("div").attr("class", "row")
			.attr("tabindex", 0).attr("role", "button")
			.merge(sel);
		sel.classed("active", d => info.d === d)
			.attr("aria-label", d => isMissions ? d["Launch Mission"] : d.Name)
			.html(d => columns.map(c => "<div class='cell c-" + c.key + "'>" + c.html(d) + "</div>").join(""))
			.order()
			.on("click", function(d) {
		    	graph.update(create_graph(d));
		    	info.update(d, isMissions);      // marks the row and redraws the plot lines
		    })
		    .on("keydown", function () {
		    	var e = d3.event;
		    	if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.click(); }
		    })
		    .on('mouseover', function (d) {
		    	Photos.prefetch(photoKeys(d, isMissions));     // the photo is on its way before the click
		    	d.highlighted = true;
		    	draw(d);
		    })
		    .on('touchstart', function (d) { Photos.prefetch(photoKeys(d, isMissions)); }, { passive: true })
		    .on('mouseout', function (d) {
		    	d.highlighted = false;
		    	renderList(data, isMissions);
		    });
		// keep the header first
		root.node().insertBefore(head.node(), root.node().firstChild);
	}

	// the row of the item in the details card (or none) is the active one
	markActive(d) {
		d3.select('#grid').selectAll('.row').classed('active', r => r === d);
	}
}

function photoKeys(d, isMission) {
	return isMission ? ["m:" + d["Launch Mission"], "p:" + d["Launch Mission"]] : ["a:" + d.Name];
}
