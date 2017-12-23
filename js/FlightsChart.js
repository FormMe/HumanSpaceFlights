class FlightsChart{
	constructor(){
		self.margin = {top: 40, right: 10, bottom: 20, left: 10};
		self.svgWidth = 800;
		self.svgHeight = 450;
		self.width = self.svgWidth - margin.left - margin.right;
		self.height = self.svgHeight - margin.top - margin.bottom;
	}

	update(missionsData){
		
		var n = 4, // The number of series.
		    m = 58; // The number of values per series.

		var groupedData = d3.nest()
						    .key(function(d) { return d['Launch Year']; })
						    .rollup(function(v) {
						        return v;
						    }) 
						    .entries(missionsData);

		console.log(groupedData);
		// The xz array has m elements, representing the x-values shared by all series.
		// The yz array has n elements, representing the y-values of each of the n series.
		// Each yz[i] is an array of m non-negative numbers representing a y-value for xz[i].
		// The y01z array has the same structure as yz, but with stacked [y₀, y₁] instead of y.
		var yMax = d3.max(groupedData, function(y) { return d3.max(y.value.lenght); }),
		    y1Max = d3.max(y01z, function(y) { return d3.max(y, function(d) { return d[1]; }); });
		    
		var svg = d3.select("#FlightsChart")
					.attr('height', self.svgHeight)
					.attr('width', self.svgWidth),
		    g = svg.append("g").attr("transform", "translate(" + self.margin.left + "," + self.margin.top + ")");

		var x = d3.scaleBand()
		    .domain(groupedData.map(d => d.key))
		    .rangeRound([0, self.width])
		    .padding(0.08);

		var y = d3.scaleLinear()
		    .domain([0, y1Max])
		    .range([self.height, 0]);

		var color = d3.scaleOrdinal()
		    .domain(d3.range(n))
		    .range(d3.schemeCategory20c);

		var series = g.selectAll(".series")
		  .data(groupedData)
		  .enter().append("g")
		    .attr("fill", function(d, i) { return color(i); });

		var rect = series.selectAll("rect")
		  .data(function(d) { return d; })
		  .enter().append("rect")
		    .attr("x", function(d, i) { return x(d.key); })
		    .attr("y", self.height)
		    .attr("width", x.bandwidth())
		    .attr("height", 0);

		rect.transition()
		    .delay(function(d, i) { return i * 10; })
		    .attr("y", function(d) { return y(d[1]); })
		    .attr("height", function(d) { return y(d[0]) - y(d[1]); });

		g.append("g")
		    .attr("class", "axis axis--x")
		    .attr("transform", "translate(0," + self.height + ")")
		    .call(d3.axisBottom(x)
		        .tickSize(0)
		        .tickPadding(6))
		    .selectAll('text')			
		    .attr("y", 0)
		    .attr("x", 9)
		    .attr("dy", ".35em")
		    .attr("transform", "rotate(90)")
		    .style("text-anchor", "start");

		d3.selectAll("input")
		    .on("change", changed);

		var timeout = d3.timeout(function() {
		  d3.select("input[value=\"grouped\"]")
		      .property("checked", true)
		      .dispatch("change");
		}, 2000);

		function changed() {
		  timeout.stop();
		  if (this.value === "grouped") transitionGrouped();
		  else transitionStacked();
		}

		function transitionGrouped() {
		  y.domain([0, yMax]);

		  rect.transition()
		      .duration(500)
		      .delay(function(d, i) { return i * 10; })
		      .attr("x", function(d, i) { return x(i) + x.bandwidth() / n * this.parentNode.__data__.key; })
		      .attr("width", x.bandwidth() / n)
		    .transition()
		      .attr("y", function(d) { return y(d[1] - d[0]); })
		      .attr("height", function(d) { return y(0) - y(d[1] - d[0]); });
		}

		function transitionStacked() {
		  y.domain([0, y1Max]);

		  rect.transition()
		      .duration(500)
		      .delay(function(d, i) { return i * 10; })
		      .attr("y", function(d) { return y(d[1]); })
		      .attr("height", function(d) { return y(d[0]) - y(d[1]); })
		    .transition()
		      .attr("x", function(d, i) { return x(i); })
		      .attr("width", x.bandwidth());
		}

		// Returns an array of m psuedorandom, smoothly-varying non-negative numbers.
		// Inspired by Lee Byron’s test data generator.
		// http://leebyron.com/streamgraph/
		function bumps(m) {
		  var values = [], i, j, w, x, y, z;

		  // Initialize with uniform random values in [0.1, 0.2).
		  for (i = 0; i < m; ++i) {
		    values[i] = 0.1 + 0.1 * Math.random();
		  }

		  // Add five random bumps.
		  for (j = 0; j < 5; ++j) {
		    x = 1 / (0.1 + Math.random());
		    y = 2 * Math.random() - 0.5;
		    z = 10 / (0.1 + Math.random());
		    for (i = 0; i < m; i++) {
		      w = (i / m - y) * z;
		      values[i] += x * Math.exp(-w * w);
		    }
		  }

		  // Ensure all values are positive.
		  for (i = 0; i < m; ++i) {
		    values[i] = Math.max(0, values[i]);
		  }

		  return values;
		}
	}
}