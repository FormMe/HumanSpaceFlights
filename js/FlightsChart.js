class FlightsChart{
	
	constructor(svgHeight, svgWidth, margin, selectionList, color){
		this.margin = margin;
		this.svgWidth = svgWidth;
		this.svgHeight = svgHeight;
		this.width = this.svgWidth - this.margin.left - this.margin.right;
		this.height = this.svgHeight - this.margin.top - this.margin.bottom;

		this.color = color;
		this.down_d = 300;
		this.up_d = 800;
		this.emptyData = true;
		this.data = null;
		this.selectionList = selectionList;
	}

	drawLegend() {
		var svg = d3.select('#FlightsChart')
							.attr('width', this.svgWidth)
							.attr('height', this.svgHeight);
		svg.append("g")
      		.attr("class", "Yaxis axis")
	        .attr("transform", "translate("+this.margin.left+",0)");


      	var axisBrush = svg.append("g").attr("class", "axisBrush");

      	axisBrush.append("g")
      		.attr("class", "Xaxis axis")
	        .attr("transform", "translate(0," + this.height + ")");

	    axisBrush.append("g").attr("class", "brush");

		var legend = svg.append("g")
		      .attr("font-family", "sans-serif")
		      .attr("font-size", 10)
		      .attr("text-anchor", "end")
		      .attr("class", "legend")
		    .selectAll("g")
		    .data(this.color.domain())
		    .enter().append("g")
		      .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

		legend.append("rect")
		      .attr("x", this.svgWidth - 19)
		      .attr("width", 19)
		      .attr("height", 19)
		      .attr("fill", this.color);

		legend.append("text")
		      .attr("x", this.svgWidth - 24)
		      .attr("y", 9.5)
		      .attr("dy", "0.32em")
		      .text(function(d) { return d; });
	}

	update(stackedData, isMissions){

		this.data = stackedData;
		// this.selectionList.update(this.data);

	   	d3.select("#BarChartTitle")		  
          .text(function () {
      	 	return isMissions ? "Number of launched space missions" 
      	 					  : "Number of humans launched into space";
          });
	   	d3.select("#ListTitle")		  
	          .text(function () {
	      	 	return isMissions ? "List of missions" 
	      	 					  : "List of astronauts";
	          });

        if(this.emptyData){
        	this.raise_up(stackedData, isMissions);
        }
        else{
			var t = this;
			var draw = true;
			d3.select('#FlightsChart')
			  .selectAll('.stackBar')
			  .selectAll('rect')
	    		.transition()
	        	.duration(this.down_d)
	        	.attr('height', 0)
	        	.on("end", function () {
	        		if (draw) {
	        			draw = false;
	        			t.raise_up(stackedData, isMissions);
	        		}
	        	});
        }
        this.emptyData = stackedData.length == 0
	}

	raise_up(stackedData, isMissions){

		var x = d3.scaleBand()
			.range([this.margin.left, this.width])
			.padding(0.1)
			.domain(stackedData.map(d => d.key));

		var maxY = d3.max(stackedData, function (d) {
				return d3.max(d.values, function (c) {
					return c.prev + c.values.length;
				})
			});
		var y = d3.scaleLinear()
			.range([this.height, this.margin.top])
			.domain([0, maxY]);

		var color = this.color;
		var svg = d3.select('#FlightsChart');

		function tooltip_render (tooltip_data) {
		    let text = "<label style='color: " + color(tooltip_data.key) + "'>" + tooltip_data.key + "</label>";
        	var cols = tooltip_data.values.length >= 15 ? 2 : 1;
        	text += "<ul style='columns: " + cols + "'>";
        	if (isMissions){
        		tooltip_data.values.forEach(function (row) {
            		text += "<li>" + row["Launch Mission"] + ": "+ row["Launch Data"]  + "</li>";
            	});
            }
            else{
        		var grouped = d3.nest()
		            		  .key(d => d["Year Mission"])
		            		  .entries(tooltip_data.values);
		        grouped.forEach(function (row) {
        			row.values.forEach(function (astrs) {
        				text += "<li>" + astrs.Name + ": " + row.key + "</li>";
        			})
    			});
            }
		    return "</ul>" + text;
		}

		let tip = d3.tip().attr('class', 'd3-tip')
		            .direction('e')
		            .html(tooltip_render);

		svg.call(tip);

		svg.selectAll(".stackBar").remove();
	   	
		var stackBars = svg.selectAll(".stackBar")
			.data(stackedData)
	   		.enter()
	    	.append('g')
		    	.attr("class", "stackBar")
		        .attr("transform", function (d) {
				    return "translate("+ x(d.key) + ",0)";
		        });

		var rects = stackBars.selectAll('rect')
		    	.data(function(d) { return d.values; })
		    	.enter()
		    	.append("rect")
				.attr("width", x.bandwidth())
	        	.style("fill", function(d){return color(d.key);});

        rects.attr("y", this.height)
    		.transition()
        	.duration(this.up_d)
  			.ease(d3.easeCubic)
	        .attr("y", function(d) { return  y(d.prev + d.values.length); })
			.attr("height", function(d) { return  y(d.prev) - y(d.prev + d.values.length) ; });

		rects.on('mouseover', tip.show)
      		 .on('mouseout', tip.hide);

	    svg.select(".Xaxis")
    		.transition()
        	.duration(this.up_d)
	        .call(d3.axisBottom(x))
			.selectAll("text")
			    .attr("y", 0)
			    .attr("x", 9)
			    .attr("dy", ".35em")
			    .attr("transform", "rotate(90)")
			    .style("text-anchor", "start");

	    svg.select(".Yaxis")
    		.transition()
        	.duration(this.up_d)
	        .call(d3.axisLeft(y)
	        		.tickFormat(function(e){
				        if(Math.floor(e) != e) return;
				        return e;
				    }));
	}
}


		

		// d3.selectAll("input")
		//     .on("change", changed);

		// var timeout = d3.timeout(function() {
		//   d3.select("input[value=\"grouped\"]")
		//       .property("checked", true)
		//       .dispatch("change");
		// }, 2000);

		// function changed() {
		//   timeout.stop();
		//   if (this.value === "grouped") transitionGrouped();
		//   else transitionStacked();
		// }

		// function transitionGrouped() {
		//   y.domain([0, yMax]);

		//   rect.transition()
		//       .duration(500)
		//       .delay(function(d, i) { return i * 10; })
		//       .attr("x", function(d, i) { return x(i) + x.bandwidth() / n * this.parentNode.__data__.key; })
		//       .attr("width", x.bandwidth() / n)
		//     .transition()
		//       .attr("y", function(d) { return y(d[1] - d[0]); })
		//       .attr("height", function(d) { return y(0) - y(d[1] - d[0]); });
		// }

		// function transitionStacked() {
		//   y.domain([0, y1Max]);

		//   rect.transition()
		//       .duration(500)
		//       .delay(function(d, i) { return i * 10; })
		//       .attr("y", function(d) { return y(d[1]); })
		//       .attr("height", function(d) { return y(d[0]) - y(d[1]); })
		//     .transition()
		//       .attr("x", function(d, i) { return x(i); })
		//       .attr("width", x.bandwidth());
		// }