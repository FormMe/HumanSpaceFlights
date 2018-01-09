class SummaryChart{
	constructor(color){
		this.color = color;

		this.margin = {top: 30, right: 20, bottom: 30, left: 50};
	    //fetch the svg bounds

	    this.svgWidth = 350 - this.margin.left - this.margin.right;
	    this.svgHeight = 120;

	    //add the svg to the div
	    d3.select("#SummaryChart")
        	.attr("width",this.svgWidth)
        	.attr("height",this.svgHeight)
	}

	update(data, isMissions){

		var all = isMissions ? data : data.concat(notFound)
		var len = all.length;
		if(isMissions){
			d3.select('#sumTitle').text('Count of missions: ' + len);
		}
		else{
			d3.select('#sumTitle').text('Count of astronauts:' + len);
		}
		var groupedData = d3.nest()
							.key(d => d.Country)
							.entries(all);
		
		var color = this.color;
		var svg = d3.select("#SummaryChart");

        var width = this.svgWidth;

        var bias = 0;
        var bars = svg.selectAll('rect')
                      .data(groupedData);
        bars.exit().remove();

        bars = bars.enter()
           .append('rect')
           .merge(bars)
           .transition()
           .duration(1000)
           .attr('y', 30)
           .attr('x', function (d) {
           		var cur = bias;
           		bias += d.values.length * width / len;
           	 	return cur;
           })
           .attr('height', 40)
           .attr('width', d =>  d.values.length * width / len)
           .attr("fill", d => color(d.key));


        var bias = 0;
   		var counts = svg.selectAll('.cnt')
	            .data(groupedData);
		counts.exit().remove();
		counts = counts.enter()
		     	.append('text')
		      .merge(counts)
	            .transition()
	            .duration(1000)
	            .attr('font-size', "12px")
		     	.attr("dy", "20")
				.attr("dx", function (d, i) {
					if (i == 2) return width - 23;
	           		var cur = bias;
	           		bias += d.values.length * width / len;
	           	 	return cur;
				})
				.attr('class', 'cnt')
				.text(function(d) { return d.values.length; });

	}
}