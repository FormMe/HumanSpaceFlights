class FlightsChart{

	// Stacked columns: launches (or people launched) per year, stacked by country.
	// Drawn at the real pixel size of its card, so text keeps its size on
	// phones; re-drawn when the card width changes.
	constructor(color){
		this.margin = {top: 12, right: 6, bottom: 26, left: 30};
		this.color = color;
		this.morph_d = 600;      // a filter change: every column glides to its new height
		this.gap = 1.5;          // surface gap between stacked segments
		this.data = null;
		this.isMissions = true;
		this.measure();

		var t = this;
		var lastWidth = this.svgWidth;
		window.addEventListener("resize", function () {
			clearTimeout(t.resizeTimer);
			t.resizeTimer = setTimeout(function () {
				t.measure();
				if (t.svgWidth !== lastWidth && t.data && t.data.length) {
					lastWidth = t.svgWidth;
					t.raise_up(t.data, t.isMissions, true);
				}
			}, 150);
		});
	}

	measure(){
		var box = document.getElementById("FlightsChart").parentNode;
		var w = Math.max(280, Math.round(box.clientWidth || 900));
		this.svgWidth = w;
		this.svgHeight = Math.round(Math.max(210, Math.min(330, w * 0.4)));
		this.width = this.svgWidth - this.margin.right;
		this.height = this.svgHeight - this.margin.bottom;
		d3.select("#FlightsChart")
			.attr("viewBox", "0 0 " + this.svgWidth + " " + this.svgHeight)
			.attr("width", this.svgWidth)
			.attr("height", this.svgHeight);
	}

	drawLegend() {
		var svg = d3.select('#FlightsChart');
		svg.append("g").attr("class", "grid");
		svg.append("g").attr("class", "Xaxis axis-x");
		svg.append("g").attr("class", "bars");

		var items = d3.select("#BarLegend").selectAll(".legend-item")
			.data(this.color.domain())
			.enter().append("span")
			.attr("class", "legend-item");
		items.append("i").style("background", this.color);
		items.append("span").text(d => d);
	}

	update(stackedData, isMissions){

		this.data = stackedData;
		this.isMissions = isMissions;

	   	d3.select("#BarChartTitle")
          .text(isMissions ? "Launches per year" : "People launched per year");
	   	d3.select("#ListTitle")
	          .text(isMissions ? "List of missions" : "List of astronauts");

        // the columns go from their old height to the new one (no drop to zero)
        this.raise_up(stackedData, isMissions);
	}

	raise_up(stackedData, isMissions, instant){
		var svg = d3.select('#FlightsChart');
		var dur = instant || REDUCED_MOTION.matches ? 0 : this.morph_d;
		var height = this.height;
		function glide(sel) { return sel.transition("bars").duration(dur).ease(d3.easeCubicInOut); }
		if (!stackedData.length) {        // everything sinks, then the chart is empty
			glide(svg.selectAll(".stackBar rect")).attr("y", height).attr("height", 0)
				.on("end", function () { d3.select(this.parentNode).remove(); });
			return;
		}

		var m = this.margin, gap = this.gap, color = this.color;
		// always the whole history: with a filter on, the bars keep their
		// place in time (the axis used to shrink to the years found)
		var found = stackedData.map(d => parseInt(d.key));
		var all = typeof missions !== "undefined" && missions ? missions.map(d => +d.Year).filter(Boolean) : [];
		var first = d3.min(all.concat(found)), last = d3.max(all.concat(found));
		var years = d3.range(first, last + 1);

		var x = d3.scaleBand()
			.range([m.left, this.width])
			.paddingInner(0.22)
			.paddingOuter(0.1)
			.domain(years);

		// at least 4 high: one launch is a short bar, not a wall
		var maxY = Math.max(4, d3.max(stackedData, d => d3.max(d.values, c => c.prev + c.values.length)));
		var y = d3.scaleLinear()
			.range([this.height, m.top])
			.domain([0, maxY])
			.nice(4);

		// recessive grid with the value labels on the left
		var ticks = y.ticks(4).filter(v => Math.floor(v) === v);
		var grid = svg.select(".grid").selectAll("g").data(ticks, d => d);
		// the scale glides with the bars: old lines fade out at their new place
		var y0 = this.lastY || y;
		glide(grid.exit()).style("opacity", 0).attr("transform", d => "translate(0," + y(d) + ")").remove();
		var gridEnter = grid.enter().append("g")
			.style("opacity", 0)
			.attr("transform", d => "translate(0," + y0(d) + ")");
		gridEnter.append("line");
		gridEnter.append("text").attr("dy", "0.32em");
		grid = gridEnter.merge(grid);
		grid.attr("class", d => d === 0 ? "baseline" : null);
		glide(grid).style("opacity", 1).attr("transform", d => "translate(0," + y(d) + ")");
		this.lastY = y;
		grid.select("line").attr("x1", m.left).attr("x2", this.width);
		grid.select("text").attr("x", m.left - 8).text(d => d);

		// year labels: every 5th or 10th year, horizontal
		var step = x.step() * 5 < 34 ? 10 : 5;
		var labels = years.filter(yr => yr % step === 0);
		var xaxis = svg.select(".Xaxis").selectAll("text").data(labels, d => d);
		xaxis.exit().remove();
		xaxis.enter().append("text")
			.merge(xaxis)
			.attr("x", d => x(d) + x.bandwidth() / 2)
			.attr("y", this.height + 18)
			.text(d => d);

		function tooltip_render (tooltip_data) {
		    let text = "<label><i style='background:" + color(tooltip_data.key) + "'></i>" + esc(tooltip_data.key) +
		               " <b>" + tooltip_data.values.length + "</b></label>";
        	var cols = tooltip_data.values.length >= 15 ? 2 : 1;
        	text += "<ul style='columns: " + cols + "'>";
        	if (isMissions){
        		tooltip_data.values.forEach(function (row) {
            		text += "<li>" + esc(row["Launch Mission"]) + " <span>" + esc(Info.date(row["Launch Data"], true)) + "</span></li>";
            	});
            }
            else{
        		var missionOf = tooltip_data.missionOf || {};
        		var grouped = d3.nest()
		            		  .key(d => missionOf[d.Name] || d["Year Mission"])
		            		  .entries(tooltip_data.values);
		        grouped.forEach(function (row) {
        			row.values.forEach(function (astrs) {
        				text += "<li>" + esc(astrs.Name) + " <span>" + esc(row.key) + "</span></li>";
        			})
    			});
            }
		    return text + "</ul>";
		}

		if (!this.tip) {
			var t = this.tip = d3.tip().attr('class', 'd3-tip bars-tip').direction('e').offset([0, 10]);
			svg.call(t);
			// a tap shows the tooltip but nothing "leaves" the bar on a phone:
			// it goes on scroll and on a tap anywhere else
			var hide = function () {
				svg.classed("hovering", false).selectAll(".hover").classed("hover", false);
				t.hide();
			};
			document.addEventListener("scroll", hide, { capture: true, passive: true });   // the page or the bars sideways
			document.addEventListener("touchstart", function (e) {
				if (!(e.target instanceof Element) || !e.target.closest(".stacked rect")) hide();
			}, { passive: true });
			this.hideTip = hide;
		}
		this.hideTip();      // new bars: the old tooltip is about rows no longer here
		var tip = this.tip.html(tooltip_render);

		// one column per year, one segment per country, matched by key: a
		// column that stays changes its height, a new one grows from the
		// baseline, one that is gone sinks into it
		var barWidth = Math.min(x.bandwidth(), 24);
		function place(d) { return "translate(" + (x(d.key) + (x.bandwidth() - barWidth) / 2) + ",0)"; }
		var stackBars = svg.select(".bars").selectAll(".stackBar").data(stackedData, d => d.key);
		glide(stackBars.exit().selectAll("rect")).attr("y", height).attr("height", 0);
		glide(stackBars.exit()).remove();
		stackBars = stackBars.enter().append('g')
			.attr("class", "stackBar")
			.attr("transform", place)
			.merge(stackBars);
		stackBars.interrupt("bars").attr("transform", place);

		function top(d) { return y(d.prev + d.values.length); }
		function size(d) { return Math.max(0.5, y(d.prev) - top(d) - (d.prev > 0 ? gap : 0)); }

		var rects = stackBars.selectAll('rect').data(d => d.values, d => d.key);
		glide(rects.exit()).attr("y", height).attr("height", 0).remove();
		rects = rects.enter().append("rect")
			.attr("y", height)
			.attr("height", 0)
			.style("fill", d => color(d.key))
			.merge(rects)
			.attr("width", barWidth)
			.attr("rx", Math.min(2, barWidth / 3));
		glide(rects).attr("y", top).attr("height", size);

		rects.on('mouseover', function (d) {
				svg.classed("hovering", true);
				d3.select(this.parentNode).classed("hover", true);
				// opens away from the screen edge, and stays on the screen
				var r = this.getBoundingClientRect(), vw = document.documentElement.clientWidth;
				var west = r.left + r.width / 2 > vw / 2;
				tip.direction(west ? 'w' : 'e').offset([0, west ? -10 : 10]);
				tip.show.apply(this, arguments);
				var node = document.querySelector('.bars-tip'), t = node.getBoundingClientRect();
				var dx = Math.min(0, vw - 8 - t.right) || Math.max(0, 8 - t.left);
				if (dx) node.style.left = (parseFloat(node.style.left) + dx) + "px";
			})
			.on('mouseout', function () {
				svg.classed("hovering", false);
				d3.select(this.parentNode).classed("hover", false);
				tip.hide.apply(this, arguments);
			});
	}
}
