
class SelectionList{
	constructor(color, graph, info){
		this.color = color;
		this.graph = graph;
		this.info = info;
		this.misCols = ["Launch Mission", "Country Flag", "Launch Data", "Habitation"];
		this.astrCols = ["Name", "Country Flag", "Gender", "Birth Date"];
	}

	update(data, isMissions){
		var graph = this.graph;
		var info = this.info;
		this.data = data;

		if(isMissions){
			var columns = this.misCols;
			var create_graph = create_mis_graph;
		}
		else{
			var columns = this.astrCols;	
			var create_graph = create_astr_graph;	
		}
		var grid = d3.divgrid().columns(columns);
		d3.select('#grid')
			.datum(data)
			.call(grid)
			.selectAll(".row")
		    .on("click", function(d) {
		    	graph.update(create_graph(d));
		    	info.update(d, isMissions);
		    })
		    .on('mouseover', function (d) {
		    });
	}
}