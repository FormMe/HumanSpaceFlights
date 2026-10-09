
// Instant, styled tooltip for the nodes of the graph (replaces the
// browser's slow native <title> tooltip).
var tip = (function () {
	var el = null;
	function fmt(n) { return d3.format(",")(Math.round(n)); }
	function row(label, value) {
		return value === undefined || value === null || value === "" ? "" :
			"<div class='gt-row'><span>" + label + "</span><b>" + value + "</b></div>";
	}
	function html(d) {
		var v = d.value, swatch = "<i style='background:" + color(v.Country) + "'></i>";
		if (d.type === "mission") {
			var inOrbit = !v["Return Data"];
			return "<div class='gt-kicker'>" + swatch + "Mission · " + v.Year + "</div>" +
				"<div class='gt-title'>" + v["Launch Mission"] + "</div>" +
				"<div class='gt-sub'>" + (v["Country Flag"] || "") + " " + v.Country + "</div>" +
				row("Launch", v["Launch Data"]) +
				row("Duration", inOrbit ? "in orbit" : fmt(v.Duration) + (v.Duration == 1 ? " day" : " days")) +
				row("Crew", v["Crew size"]) +
				row("Where", v.Habitation);
		}
		if (v.stub) {
			return "<div class='gt-kicker'>" + swatch + "Astronaut</div>" +
				"<div class='gt-title'>" + v.Name + "</div>" +
				"<div class='gt-sub gt-muted'>No details in the dataset</div>";
		}
		var hours = +v["Space Flight (hr)"] || 0;
		var walks = +v["Space Walks"] || 0;
		return "<div class='gt-kicker'>" + swatch + "Astronaut · " + (v.Status || "") + "</div>" +
			"<div class='gt-title'>" + v.Name + "</div>" +
			"<div class='gt-sub'>" + (v["Country Flag"] || "") + " " + (v.Nationality || v.Country) + "</div>" +
			row("Flights", v["Space Flights"]) +
			row("In space", hours >= 48 ? fmt(hours / 24) + " days" : fmt(hours) + " h") +
			row("Spacewalks", walks ? walks + " (" + fmt(+v["Space Walks (hr)"] || 0) + " h)" : "none");
	}
	var lastEvent = null;
	function place(e) {
		if (e) lastEvent = e;
		if (!el || !e) return;
		var pad = 14, w = el.offsetWidth, h = el.offsetHeight;
		var x = e.clientX + pad, y = e.clientY + pad;
		if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
		if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
		el.style.transform = "translate(" + Math.max(8, x) + "px," + Math.max(8, y) + "px)";
	}
	return {
		show: function (d, e) {
			if (!el) {
				el = document.createElement("div");
				el.className = "graph-tip";
				document.body.appendChild(el);
			}
			el.innerHTML = html(d);
			el.classList.add("visible");
			place(e);
			// portrait / patch, when there is one (packs load once, then it's instant)
			var v = d.value, key = null;
			// tiny copies: a tooltip must not pull a pack of big photos
			if (d.type === "mission") key = v["Patch URL"] ? "t:p:" + v["Launch Mission"] : null;
			else if (!v.stub && v["Photo URL"]) key = "t:a:" + v.Name;
			el.dataset.key = key || "";
			if (!v.stub) Photos.prefetch(photoKeys(v, d.type === "mission"));   // a click on the node will want it
			if (key) Photos.get(key).then(function (src) {
				if (!src || el.dataset.key !== key || !el.classList.contains("visible")) return;
				var img = document.createElement("img");
				img.className = "gt-photo" + (key.indexOf("t:p:") === 0 ? " patch" : "");
				img.src = src;
				img.alt = "";
				el.insertBefore(img, el.firstChild);
				el.classList.add("has-photo");
				place(lastEvent);
			});
		},
		move: place,
		hide: function () { if (el) { el.classList.remove("visible", "has-photo"); el.dataset.key = ""; } }
	};
})();

// Missions-astronauts graph, drawn on a canvas: thousands of nodes stay
// smooth (no DOM element per node or link). Hover, click and drag find the
// node under the pointer with simulation.find().
class Graph{
	constructor(color, info){
		this.color = color;
		this.info = info;
		this.canvas = document.getElementById("Graph");
		this.ctx = this.canvas.getContext("2d");
		this.nodes = [];
		this.links = [];
		this.view = null;
		this.hover = null;
		this.near = null;
		this.bindEvents();
		var self = this;
		window.addEventListener("resize", function () {
			clearTimeout(self.resizeTimer);
			self.resizeTimer = setTimeout(function () {
				var w = Math.round(self.canvas.parentNode.clientWidth);
				if (self.nodes.length && Math.abs(w - self.width) > 8) {
					self.nodes.forEach(function (n) { n.x = n.y = n.vx = n.vy = undefined; n.fx = n.fy = null; });
					self.update({ nodes: self.nodes, links: self.links });
				}
			}, 200);
		});
	}

	radius(d) {
		if (d.type == 'mission') return 4.5;
		if (d.value.stub) return 5;
		return Math.max(3, Math.log(d.value['Space Flight (hr)']));
	}

	fill(d) {
		return d.type == 'mission' ? "#eef0f7" : this.color(d.value.Country);
	}

	clear() {
		if (this.simulation) this.simulation.stop();
		this.nodes = [];
		this.links = [];
		this.hover = null;
		this.near = null;
		tip.hide();
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		d3.select(this.canvas.closest(".graph")).classed("has-graph", false);
	}

	update(graph){
		var self = this, canvas = this.canvas;
		// use the whole width of the card; the height follows the width
		var width = Math.max(260, Math.round(canvas.parentNode.clientWidth || 430)),
		    height = Math.round(Math.max(380, Math.min(620, width * 0.72)));
		var dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.width = width;
		this.height = height;
		this.dpr = dpr;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		canvas.style.height = height + "px";

		if (this.simulation) this.simulation.stop();
		this.nodes = graph.nodes;
		this.links = graph.links;
		this.hover = null;
		this.near = null;
		this.view = [0, 0, width, height];
		tip.hide();
		d3.select(canvas.closest(".graph")).classed("has-graph", graph.nodes.length > 0);

		var big = graph.nodes.length > 60;
		this.simulation = d3.forceSimulation(graph.nodes)
		    .force("link", d3.forceLink(graph.links).id(function(d) { return d.id; }))
		    .force("charge", d3.forceManyBody().strength(big ? -10 : -40))
		    .force("center", d3.forceCenter(width / 2, height / 2))
		    // no walls: a soft pull to the middle keeps the cloud in the
		    // card's proportions, and the view zooms to fit it
		    .force("x", d3.forceX(width / 2).strength(0.05 * Math.min(1, height / width)))
		    .force("y", d3.forceY(height / 2).strength(0.05))
		    .on("tick", function () { self.fitView(); self.draw(); });
		// big graphs: skip the first, most chaotic part of the layout
		// big graphs settle in ~100 frames instead of ~300
		if (big) this.simulation.alphaDecay(0.045).velocityDecay(0.5);
		this.fitView(true);
		this.draw();
	}

	// zoom the view smoothly to the nodes (at most 2x on small graphs)
	fitView(jump) {
		var nodes = this.nodes;
		if (!nodes.length) return;
		var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
		for (var i = 0; i < nodes.length; i++) {
			var n = nodes[i];
			if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x;
			if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y;
		}
		var W = this.width, H = this.height, pad = 28;
		var w = Math.max(x1 - x0 + 2 * pad, W / 2), h = Math.max(y1 - y0 + 2 * pad, H / 2);
		if (w / h > W / H) h = w * H / W; else w = h * W / H;
		var target = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
		var k = jump ? 1 : 0.12;
		this.view = this.view.map(function (v, i) { return v + (target[i] - v) * k; });
	}

	// screen (css px) <-> layout coordinates
	scale() { return this.width / this.view[2]; }
	toLayout(px, py) {
		var s = this.scale();
		return [this.view[0] + px / s, this.view[1] + py / s];
	}

	draw() {
		var ctx = this.ctx, s = this.scale(), dpr = this.dpr, v = this.view;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.setTransform(s * dpr, 0, 0, s * dpr, -v[0] * s * dpr, -v[1] * s * dpr);
		var near = this.near, hover = this.hover, links = this.links, nodes = this.nodes;

		// links: one path per style
		ctx.lineWidth = 1 / s;
		ctx.strokeStyle = near ? "rgba(170, 180, 205, 0.08)" : "rgba(170, 180, 205, 0.32)";
		ctx.beginPath();
		for (var i = 0; i < links.length; i++) {
			var l = links[i];
			ctx.moveTo(l.source.x, l.source.y);
			ctx.lineTo(l.target.x, l.target.y);
		}
		ctx.stroke();
		if (hover) {
			ctx.lineWidth = 1.6 / s;
			ctx.strokeStyle = "rgba(225, 230, 245, 0.85)";
			ctx.beginPath();
			links.forEach(function (l) {
				if (l.source === hover || l.target === hover) {
					ctx.moveTo(l.source.x, l.source.y);
					ctx.lineTo(l.target.x, l.target.y);
				}
			});
			ctx.stroke();
		}

		// nodes with a dark ring so overlapping ones stay apart
		ctx.lineWidth = 1.5 / s;
		ctx.strokeStyle = "#0d121e";
		for (var j = 0; j < nodes.length; j++) {
			var d = nodes[j];
			ctx.globalAlpha = near && !near[d.id] ? 0.22 : 1;
			ctx.fillStyle = this.fill(d);
			ctx.beginPath();
			ctx.arc(d.x, d.y, this.radius(d), 0, 2 * Math.PI);
			ctx.fill();
			ctx.stroke();
		}
		ctx.globalAlpha = 1;

		// selected node: white ring with a glow
		nodes.forEach(function (d) {
			if (!d.selected) return;
			ctx.save();
			ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
			ctx.shadowBlur = 10 * dpr;
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 2.5 / s;
			ctx.beginPath();
			ctx.arc(d.x, d.y, this.radius(d) + 1 / s, 0, 2 * Math.PI);
			ctx.stroke();
			ctx.restore();
		}, this);
	}

	// node under a pointer position (css px relative to the canvas)
	nodeAt(px, py) {
		if (!this.simulation || !this.nodes.length) return null;
		var p = this.toLayout(px, py), s = this.scale();
		var d = this.simulation.find(p[0], p[1], 30 / s);
		if (!d) return null;
		var dist = Math.hypot(d.x - p[0], d.y - p[1]);
		return dist <= this.radius(d) + 6 / s ? d : null;
	}

	setHover(d, e) {
		if (d === this.hover) { if (d) tip.move(e); return; }
		if (this.hover) {
			this.hover.value.highlighted = false;
			renderList(null, isMissions);
		}
		this.hover = d;
		if (d) {
			var near = {};
			near[d.id] = true;
			this.links.forEach(function (l) {
				if (l.source === d) near[l.target.id] = true;
				if (l.target === d) near[l.source.id] = true;
			});
			this.near = near;
			d.value.highlighted = true;
			draw(d.value);   // highlight the line in the parallel coordinates
			tip.show(d, e);
		} else {
			this.near = null;
			tip.hide();
		}
		this.canvas.style.cursor = d ? "pointer" : "";
		this.draw();
	}

	bindEvents() {
		var self = this, canvas = this.canvas;
		function local(e) {
			var r = canvas.getBoundingClientRect();
			return [e.clientX - r.left, e.clientY - r.top];
		}
		canvas.addEventListener("mousemove", function (e) {
			if (self.dragging) return;
			var p = local(e);
			self.setHover(self.nodeAt(p[0], p[1]), e);
		});
		canvas.addEventListener("mouseleave", function () { self.setHover(null); });
		canvas.addEventListener("click", function (e) {
			var p = local(e), d = self.nodeAt(p[0], p[1]);
			if (d) { self.setHover(null); self.clicked(d); }
		});

		d3.select(canvas).call(d3.drag()
			.container(canvas)
			.subject(function () {
				var d = self.nodeAt(d3.event.x, d3.event.y);
				return d ? d : null;
			})
			.on("start", function () {
				self.dragging = true;
				tip.hide();
				if (!d3.event.active) self.simulation.alphaTarget(0.3).restart();
				var d = d3.event.subject;
				d.fx = d.x;
				d.fy = d.y;
			})
			.on("drag", function () {
				var p = self.toLayout(d3.event.x, d3.event.y);
				d3.event.subject.fx = p[0];
				d3.event.subject.fy = p[1];
			})
			.on("end", function () {
				self.dragging = false;
				if (!d3.event.active) self.simulation.alphaTarget(0);
				d3.event.subject.fx = null;
				d3.event.subject.fy = null;
			}));
	}

	clicked(d) {
		var dataType = d3.select("#DataType").node().value;
		if (d.type == 'astronaut' && d.value.stub) return;
		if (d.type == "mission"){
			this.info.update(d.value, true);
			this.update(create_mis_graph(d.value));
			if (dataType == "Missions")
				renderList(null, true);
		}
		else if (d.type == "astronaut"){
			this.info.update(d.value, false);
			this.update(create_astr_graph(d.value));
			if (dataType == "Astonauts")
				renderList(null, false);
		}
	}
}
