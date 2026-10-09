
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
	function place(e) {
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
		},
		move: place,
		hide: function () { if (el) el.classList.remove("visible"); }
	};
})();

class Graph{
	constructor(color, info){
		this.color = color;
		this.info = info;
	}

	update(graph){
		var svg = d3.select("#Graph");
		// use the whole width of the card; the height follows the width
		var box = svg.node().parentNode;
		var width = Math.max(260, Math.round(box.clientWidth || 430)),
		    height = Math.round(Math.max(380, Math.min(620, width * 0.72)));
		svg.attr("width", width).attr("height", height)
		   .attr("viewBox", "0 0 " + width + " " + height);
		this.last = graph;
		this.lastWidth = width;
		var self = this;
		if (!this.resizeBound) {
			this.resizeBound = true;
			window.addEventListener("resize", function () {
				clearTimeout(self.resizeTimer);
				self.resizeTimer = setTimeout(function () {
					var w = Math.round(box.clientWidth);
					if (self.last && self.last.nodes.length && Math.abs(w - self.lastWidth) > 8) {
						self.last.nodes.forEach(function (n) { n.x = n.y = n.vx = n.vy = undefined; });
						self.update(self.last);
					}
				}, 200);
			});
		}

		var color = this.color;

		var simulation = d3.forceSimulation()
		    .force("link", d3.forceLink().id(function(d) { return d.id; }))
		    .force("charge", d3.forceManyBody().strength(graph.nodes.length > 60 ? -10 : -40))
		    .force("center", d3.forceCenter(width / 2, height / 2))
		    // no walls: a soft pull to the middle keeps the cloud in the
		    // card's proportions, and the view zooms to fit it
		    .force("x", d3.forceX(width / 2).strength(0.05 * Math.min(1, height / width)))
		    .force("y", d3.forceY(height / 2).strength(0.05));

		if (this.simulation) this.simulation.stop();
		this.simulation = simulation;

		svg.selectAll('g').remove();

		var link = svg.append("g")
		  	.attr("class", "links")
			.selectAll("line")
			.data(graph.links)
			.enter().append("line");

		var node = svg.append("g")
			.selectAll("circle")
			.data(graph.nodes)
			.enter().append("circle")
			  .attr("class", d => d.selected ? "selected" : "nodes")
			  .attr("r", function (d) {
			  	if (d.type == 'mission') return 4.5;
			  	if (d.type == 'astronaut' && d.value.stub) return 5;
			  	return Math.max(3, Math.log(d.value['Space Flight (hr)']));
			  })
			  .attr("fill", function(d) { 
			  	if(d.type == 'mission') return "#eef0f7";
			  	return color(d.value.Country);
			  })
			  .call(d3.drag()
			      .on("start", dragstarted)
			      .on("drag", dragged)
			      .on("end", dragended))
			  .on("click", function (d) { tip.hide(); clicked(d); })
			  .on('mouseover', function (d) {
		    	d.value.highlighted = true;
		    	draw(d.value);
		    	focus(d);
		    	tip.show(d, d3.event);
			  })
			  .on('mousemove', function () { tip.move(d3.event); })
			  .on('mouseout', function (d) {
		    	d.value.highlighted = false;
		    	renderList(null, isMissions);
		    	focus(null);
		    	tip.hide();
			  });

		// hovering a node keeps it and its neighbours bright, dims the rest
		function focus(d) {
			svg.classed("focus", !!d);
			if (!d) {
				node.classed("hl", false);
				link.classed("hl", false);
				return;
			}
			var near = {};
			near[d.id] = true;
			graph.links.forEach(function (l) {
				if (l.source === d) near[l.target.id] = true;
				if (l.target === d) near[l.source.id] = true;
			});
			node.classed("hl", n => near[n.id]);
			link.classed("hl", l => l.source === d || l.target === d);
		}

		simulation
		  .nodes(graph.nodes)
		  .on("tick", ticked);

		simulation.force("link")
		  .links(graph.links);

		var radius = 15;
		// zoom the view smoothly to the nodes, so a small graph is not a
		// tiny cluster in the middle of a big empty area (phones!)
		var view = (svg.attr("viewBox") || ("0 0 " + width + " " + height)).split(/\s+/).map(Number);
		function fitView() {
			if (!graph.nodes.length) return;
			var x0 = d3.min(graph.nodes, d => d.x), x1 = d3.max(graph.nodes, d => d.x),
			    y0 = d3.min(graph.nodes, d => d.y), y1 = d3.max(graph.nodes, d => d.y);
			// never zoom in more than 2x: a small graph stays a small graph
			var pad = 28, w = Math.max(x1 - x0 + 2 * pad, width / 2), h = Math.max(y1 - y0 + 2 * pad, height / 2);
			// keep the aspect ratio of the svg
			if (w / h > width / height) h = w * height / width; else w = h * width / height;
			var target = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
			view = view.map((v, i) => v + (target[i] - v) * 0.12);
			svg.attr("viewBox", view.map(v => v.toFixed(1)).join(" "));
		}
		function ticked() {
			fitView();
			node
			    .attr("cx", function(d) { return d.x; })
		        .attr("cy", function(d) { return d.y; });

			link
			    .attr("x1", function(d) { return d.source.x; })
			    .attr("y1", function(d) { return d.source.y; })
			    .attr("x2", function(d) { return d.target.x; })
			    .attr("y2", function(d) { return d.target.y; });
		}

		var t = this;
		function dragstarted(d) {
		  if (!d3.event.active) simulation.alphaTarget(0.3).restart();
		  d.fx = d.x;
		  d.fy = d.y;
		}

		function dragged(d) {
		  d.fx = d3.event.x;
		  d.fy = d3.event.y;
		}

		function dragended(d) {
		  if (!d3.event.active) simulation.alphaTarget(0);
		  d.fx = null;
		  d.fy = null;
		}	

		function clicked(d) {
	    	var dataType = d3.select("#DataType").node().value; 
			if (d.type == 'astronaut' && d.value.stub) return;
			if (d.type == "mission"){
				t.info.update(d.value, true);
				t.update(create_mis_graph(d.value));
		    	if (dataType == "Missions")
		    		renderList(null, true);
			}
			else if (d.type == "astronaut"){
				t.info.update(d.value, false);
				t.update(create_astr_graph(d.value));
		    	if (dataType == "Astonauts")
		    		renderList(null, false);
			}
		}
	}
}