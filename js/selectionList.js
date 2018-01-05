
function get_country_html(astr){
	switch(astr.Country){
		case 'USA': return "<img src='pics/usa_flag.png' width='22' height='12'>";
		case 'USSR/Russia': 
			if(astr.Year < 1991)
				return "<img src='pics/ussr_flag.png' width='22' height='12'>";
			else
				return "<img src='pics/rus_flag.png' width='22' height='12'>";

		case "China": return "<img src='pics/china_flag.png' width='22' height='12'>";
	}
}	

function map_mis(d) {			
	d["Prolongation"] = d3.max(d.Crew, c => c.Prolongation);
	d["Return Data"] = d3.max(d.Crew, c => c["Return Data"]);
	d["Crew Count"] = d3.sum(d.Crew, c => c.Members.length);
	d["Country Flag"] = get_country_html(d);
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
		this.misCols = ["Launch Mission", "Country Flag", "Launch Data", "Habitation"];
		this.astrCols = ["Name", "Country Flag", "Gender", "Birth Date"];
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