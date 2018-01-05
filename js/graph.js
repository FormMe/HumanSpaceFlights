class Graph{
	constructor(color){
		this.color = color;
	}

	update(graph){
		var svg = d3.select("#Graph"),
		    width = +svg.attr("width"),
		    height = +svg.attr("height");

		var color = this.color;

		var simulation = d3.forceSimulation()
		    .force("link", d3.forceLink().id(function(d) { return d.id; }))
		    .force("charge", d3.forceManyBody().strength(-10))
		    .force("center", d3.forceCenter(width / 2, height / 2));

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
			  	if (d.type == 'mission') return 5;
			  	if (d.type == 'astronaut' && d.value.Country == "Other") return 5;
			  	return Math.max(3, Math.log(d.value['Space Flight (hr)']));
			  })
			  .attr("fill", function(d) { 
			  	if(d.type == 'mission') return "yellow";
			  	return color(d.value.Country);
			  })
			  .call(d3.drag()
			      .on("start", dragstarted)
			      .on("drag", dragged)
			      .on("end", dragended))
			  .on("click", clicked);

		node.append("title")
		  .text(function(d) { return d.id; });

		simulation
		  .nodes(graph.nodes)
		  .on("tick", ticked);

		simulation.force("link")
		  .links(graph.links);

		var radius = 15;
		function ticked() {
			node
			    .attr("cx", function(d) { return d.x = Math.max(radius, Math.min(width - radius, d.x)); })
		        .attr("cy", function(d) { return d.y = Math.max(radius, Math.min(height - radius, d.y)); });

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
			if (d.type == 'astronaut' && d.value.Country == "Other") return 5;
			if(d.type == "mission"){
				t.update(create_mis_graph(d.value));
			}
			else if(d.type == "astronaut"){
				t.update(create_astr_graph(d.value));
			}
		}
	}
}