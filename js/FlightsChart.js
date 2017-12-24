class FlightsChart{
	
	constructor(){
		this.margin = {top: 20, right: 10, bottom: 15, left: 30};
		this.svgWidth = 800;
		this.svgHeight = 450;
		this.width = this.svgWidth - this.margin.left - this.margin.right;
		this.height = this.svgHeight - this.margin.top - this.margin.bottom;

		this.Countries = ["USSR/Russia", "USA", "China", "Other"]

		this.color = d3.scaleOrdinal()
		    .range(["#6b486b", "#98abc5", "#d0743c", "#3CB371"])
		    .domain(this.Countries);
	}

	drawLegend() {
		var svg = d3.select('#FlightsChart')
							.attr('width', this.svgWidth)
							.attr('height', this.svgHeight);
		svg.append("g")
      		.attr("class", "Xaxis axis")
	        .attr("transform", "translate(0," + this.height + ")");

      	svg.append("g")
      		.attr("class", "Yaxis axis")
	        .attr("transform", "translate("+this.margin.left+",0)");

		var legend = svg.append("g")
		      .attr("font-family", "sans-serif")
		      .attr("font-size", 10)
		      .attr("text-anchor", "end")
		      .attr("class", "legend")
		    .selectAll("g")
		    .data(this.Countries)
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

	update(stackedData){
		
		console.log(stackedData);
		var height = this.height - this.margin.bottom;
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
		var svg = d3.select('#FlightsChart')
					.attr('width', this.svgWidth)
					.attr('height', this.svgHeight);

		svg.selectAll(".stackBar").remove();

	   	var stackBars = svg.selectAll(".stackBar")
			.data(stackedData)
	   		.enter()
	    	.append('g')
		    	.attr("class", "stackBar")
		        .attr("transform", function (d) {
				    return "translate("+ x(d.key) + ",0)";
		        });

		stackBars.selectAll('rect')
	    	.data(function(d) { return d.values; })
	    	.enter()
	    	.append("rect")
	    		.transition()
	        	.duration(1000)
	        	.style("fill", function(d){return color(d.key);})
		        .attr("y", function(d) { return  y(d.prev + d.values.length); })
				.attr("height", function(d) { return  y(d.prev) - y(d.prev + d.values.length) ; })
				.attr("width", x.bandwidth());

	    svg.select(".Xaxis")
    		.transition()
        	.duration(1000)
	        .call(d3.axisBottom(x))
			.selectAll("text")
			    .attr("y", 0)
			    .attr("x", 9)
			    .attr("dy", ".35em")
			    .attr("transform", "rotate(90)")
			    .style("text-anchor", "start");

	    svg.select(".Yaxis")
    		.transition()
        	.duration(1000)
	        .call(d3.axisLeft(y)
	        		.tickValues(d3.range(y.domain()[0], y.domain()[1] + 1, 1))
					.tickFormat(function(d) {
						return ~~d;
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