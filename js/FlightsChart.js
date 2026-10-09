class FlightsChart{

	// Stacked columns: launches (or people launched) per year, stacked by country.
	// Drawn at the real pixel size of its card, so text keeps its size on
	// phones; re-drawn when the card width changes.
	constructor(svgHeight, svgWidth, margin, selectionList, color){
		this.margin = {top: 12, right: 6, bottom: 26, left: 30};
		this.color = color;
		this.down_d = 250;
		this.up_d = 700;
		this.gap = 1.5;          // surface gap between stacked segments
		this.emptyData = true;
		this.data = null;
		this.isMissions = true;
		this.selectionList = selectionList;
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

        if(this.emptyData){
        	this.raise_up(stackedData, isMissions);
        }
        else{
			var t = this;
			var draw = true;
			var bars = d3.select('#FlightsChart').selectAll('.stackBar rect');
			if (bars.empty()) {
				t.raise_up(stackedData, isMissions);
			} else {
				bars.transition()
		        	.duration(this.down_d)
		        	.attr('y', this.height)
		        	.attr('height', 0)
		        	.on("end", function () {
		        		if (draw) {
		        			draw = false;
		        			t.raise_up(stackedData, isMissions);
		        		}
		        	});
			}
        }
        this.emptyData = stackedData.length == 0
	}

	raise_up(stackedData, isMissions, instant){
		var svg = d3.select('#FlightsChart');
		svg.selectAll(".stackBar").remove();
		if (!stackedData.length) {
			svg.select(".grid").selectAll("*").remove();
			svg.select(".Xaxis").selectAll("*").remove();
			return;
		}

		var m = this.margin, gap = this.gap, color = this.color;
		var first = parseInt(stackedData[0].key),
		    last = parseInt(stackedData[stackedData.length - 1].key);
		var years = d3.range(first, last + 1);

		var x = d3.scaleBand()
			.range([m.left, this.width])
			.paddingInner(0.22)
			.paddingOuter(0.1)
			.domain(years);

		var maxY = d3.max(stackedData, d => d3.max(d.values, c => c.prev + c.values.length));
		var y = d3.scaleLinear()
			.range([this.height, m.top])
			.domain([0, maxY])
			.nice(4);

		// recessive grid with the value labels on the left
		var ticks = y.ticks(4).filter(v => Math.floor(v) === v);
		var grid = svg.select(".grid").selectAll("g").data(ticks, d => d);
		grid.exit().remove();
		var gridEnter = grid.enter().append("g");
		gridEnter.append("line");
		gridEnter.append("text").attr("dy", "0.32em");
		grid = gridEnter.merge(grid);
		grid.attr("class", d => d === 0 ? "baseline" : null)
			.attr("transform", d => "translate(0," + y(d) + ")");
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
		    let text = "<label><i style='background:" + color(tooltip_data.key) + "'></i>" + tooltip_data.key +
		               " <b>" + tooltip_data.values.length + "</b></label>";
        	var cols = tooltip_data.values.length >= 15 ? 2 : 1;
        	text += "<ul style='columns: " + cols + "'>";
        	if (isMissions){
        		tooltip_data.values.forEach(function (row) {
            		text += "<li>" + row["Launch Mission"] + " <span>" + row["Launch Data"] + "</span></li>";
            	});
            }
            else{
        		var grouped = d3.nest()
		            		  .key(d => d["Year Mission"])
		            		  .entries(tooltip_data.values);
		        grouped.forEach(function (row) {
        			row.values.forEach(function (astrs) {
        				text += "<li>" + astrs.Name + " <span>" + row.key + "</span></li>";
        			})
    			});
            }
		    return text + "</ul>";
		}

		if (!this.tip) {
			this.tip = d3.tip().attr('class', 'd3-tip').direction('e').offset([0, 10]);
			svg.call(this.tip);
		}
		var tip = this.tip.html(tooltip_render);

		var barWidth = Math.min(x.bandwidth(), 24);
		var stackBars = svg.select(".bars").selectAll(".stackBar")
			.data(stackedData)
	   		.enter()
	    	.append('g')
		    	.attr("class", "stackBar")
		        .attr("transform", d => "translate(" + (x(d.key) + (x.bandwidth() - barWidth) / 2) + ",0)");

		var height = this.height;
		var rects = stackBars.selectAll('rect')
		    	.data(d => d.values)
		    	.enter()
		    	.append("rect")
				.attr("width", barWidth)
				.attr("rx", Math.min(2, barWidth / 3))
	        	.style("fill", d => color(d.key));

		function top(d) { return y(d.prev + d.values.length); }
		function size(d) { return Math.max(0.5, y(d.prev) - top(d) - (d.prev > 0 ? gap : 0)); }

		if (instant) {
			rects.attr("y", top).attr("height", size);
		} else {
	        rects.attr("y", height).attr("height", 0)
	    		.transition()
	        	.duration(this.up_d)
	        	.delay((d, i, nodes) => 0)
	  			.ease(d3.easeCubicOut)
		        .attr("y", top)
				.attr("height", size);
		}

		rects.on('mouseover', function (d) {
				svg.classed("hovering", true);
				d3.select(this.parentNode).classed("hover", true);
				tip.show.apply(this, arguments);
			})
			.on('mouseout', function () {
				svg.classed("hovering", false);
				d3.select(this.parentNode).classed("hover", false);
				tip.hide.apply(this, arguments);
			});
	}
}
