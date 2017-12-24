class FlightsChart{
	
	constructor(){
		self.margin = {top: 20, right: 10, bottom: 15, left: 30};
		self.svgWidth = 800;
		self.svgHeight = 450;
		self.width = self.svgWidth - margin.left - margin.right;
		self.height = self.svgHeight - margin.top - margin.bottom;
	}

	update(missionsData){
		var groupedData = d3.nest()
						    .key(function(d) { return d['Launch Year']; })
						    .key(function(d) { return d['Country']; })
	  						.entries(missionsData)
	  						.map(function (d) {	  							
						    	d.values.forEach(function (c, i) {
						    		d.values[i].prev = i == 0 ? 0 : d.values[i-1].values.length + d.values[i-1].prev;
						    	});
						    	d.values = d.values.sort(function(a, b){
										    if(a.key < b.key) return -1;
										    if(a.key > b.key) return 1;
										    return 0;
										});
						    	return d;
	  						});

		// console.log(groupedData);
		var height = self.height - self.margin.bottom;
		var x = d3.scaleBand()
			.range([self.margin.left, self.width])
			.padding(0.1)
			.domain(groupedData.map(d => d.key));

		var maxY = d3.max(groupedData, function (d) {
				return d3.max(d.values, function (c) {
					return c.prev + c.values.length;
				})
			});
		var y = d3.scaleLinear()
			.range([self.height, self.margin.top])
			.domain([0, maxY]);

		var Countries = ["USSR/Russia", "USA", "China"]
		var color = d3.scaleOrdinal()
		    .range(["#6b486b", "#98abc5", "#d0743c"])
		    .domain(Countries);

		var svg = d3.select('#FlightsChart')
					.attr('width', self.svgWidth)
					.attr('height', self.svgHeight);

		var stackBars = svg.selectAll('g')
				.data(groupedData);

	    stackBars.exit().remove();
	    // add new elements
	   stackBars = stackBars.enter()
	    	.append('g')
	    	.merge(stackBars)
		        .attr("transform", function (d) {
				    return "translate("+ x(d.key) + ",0)";
		        })
	    	.selectAll("rect")
	    	.data(function(d) { return d.values; })
	    	.enter().append("rect")
	    		.transition()
	        	.duration(1000)
	        	.style("fill", function(d){return color(d.key);})
		        .attr("y", function(d) { return  y(d.prev + d.values.length); })
				.attr("height", function(d) { return  y(d.prev) - y(d.prev + d.values.length) ; })
				.attr("width", x.bandwidth());

	    svg.append("g")
      		.attr("class", "axis")
	        .attr("transform", "translate(0," + self.height + ")")
	        .call(d3.axisBottom(x))
			.selectAll("text")
			    .attr("y", 0)
			    .attr("x", 9)
			    .attr("dy", ".35em")
			    .attr("transform", "rotate(90)")
			    .style("text-anchor", "start");

	    svg.append("g")
      		.attr("class", "axis")
	        .attr("transform", "translate("+self.margin.left+",0)")
	        .call(d3.axisLeft(y));

		var legend = svg.append("g")
		      .attr("font-family", "sans-serif")
		      .attr("font-size", 10)
		      .attr("text-anchor", "end")
		    .selectAll("g")
		    .data(Countries)
		    .enter().append("g")
		      .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

		legend.append("rect")
		      .attr("x", width - 19)
		      .attr("width", 19)
		      .attr("height", 19)
		      .attr("fill", color);

		legend.append("text")
		      .attr("x", width - 24)
		      .attr("y", 9.5)
		      .attr("dy", "0.32em")
		      .text(function(d) { return d; });

        svg.append('text')
          .text('Snow Totals')
          .attr('transform', 'translate(-70, -20)');
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