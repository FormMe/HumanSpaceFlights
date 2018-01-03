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
		var map_mis = function (d) {				
				d["Prolongation"] = d3.max(d.Crew, c => c.Prolongation);
				d["Return Data"] = d3.max(d.Crew, c => c["Return Data"]);
				d["Crew Count"] = d3.sum(d.Crew, c => c.Members.length);
				// d["Country"] = "<img src='pics/esa_white.png' width='20' height='20'/>";
				return d;
			};
		var map_astrs = function (d) {
				return d;
			};

		var missions = this.missions;
		var astronauts = this.astronauts;
		var graph = this.graph;

		if(isMissions){
			var columns = this.misCols;
			var mapF = map_mis;
			var create_graph = function (mis) {
				var G = create_mis_graph(mis);
				G.nodes.filter(n => n.type == 'astronaut')
					.map(a => create_astr_graph(a.value))
					.forEach(function (g) { G = merge_graph(G, g); });
				return G;
			};
		}
		else{
			var columns = this.astrCols;	
			var mapF = map_astrs;
			var create_graph = function (astr) {
				var G = create_astr_graph(astr);
				G.nodes.filter(n => n.type == 'mission')
					.map(m => create_mis_graph(m.value))
					.forEach(function (g) { G = merge_graph(G, g); });
				return G;
			};	
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