
function map_mis(d) {				
	d["Prolongation"] = d3.max(d.Crew, c => c.Prolongation);
	d["Return Data"] = d3.max(d.Crew, c => c["Return Data"]);
	d["Crew Count"] = d3.sum(d.Crew, c => c.Members.length);
	// d["Country"] = "<img src='pics/esa_white.png' width='20' height='20'/>";
	return d;
};
function map_astrs(d) {
	return d;
};

class SelectionList{
	constructor(color, missions, astronauts, graph){
		this.color = color;
		this.missions = missions;
		this.astronauts = astronauts;
		this.graph = graph;
		this.misCols = ["Launch Mission", "Launch Data", "Country", "Habitation"];
		this.astrCols = ["Name", "Gender", "Country", "Birth Date"];
	}

	update(data, isMissions){
		var graph = this.graph;
		this.data = data;

		if(isMissions){
			var columns = this.misCols;
			var mapF = map_mis;
			var create_graph = create_mis_graph;
		}
		else{
			var columns = this.astrCols;	
			var mapF = map_astrs;
			var create_graph = create_astr_graph;	
		}
		var grid = d3.divgrid().columns(columns);
		d3.select('#grid')
			.datum(data.map(mapF))
			.call(grid)
			.selectAll(".row")
		    .on("click", function(d) {
		    	graph.update(create_graph(d));
		    })
		    .on('mouseover', function (d) {
		    });
	}
}