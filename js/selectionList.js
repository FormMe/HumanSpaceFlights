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
		console.log(astronauts);
		var graph = this.graph;

		var create_astr_graph = function (astr) {
			var nodes = [{
    			id: astr.Name,
    			type: 'astronaut',
    			value: astr
    		}];
	    	var links = [];
    		missions
    			.filter(mis => astr.Missions.includes(mis["Launch Mission"]))
				.forEach(function (mis) {
					nodes.push({
		    			id: mis["Launch Mission"],
		    			type: 'mission',
		    			value: mis
		    		});
		    		links.push({
		    			"source": mis["Launch Mission"],
		    			"target": astr.Name
		    		});
				});
	    	return {
	    		'links': links,
	    		'nodes': nodes
	    	};
		}

		var create_mis_graph = function (mis) {
			var members = [];
	    	var nodes = [{
    			id: mis["Launch Mission"],
    			type: 'mission',
    			value: mis
	    	}];
	    	mis.Crew.forEach(function (c) {
	    		members = members.concat(c.Members);
	    	});
	    	var links = [];
	    	astronauts
	    		.filter(astr => members.includes(astr.Name))
	    		.forEach(function (astr) {
		    		nodes.push({
		    			id: astr.Name,
		    			type: 'astronaut',
		    			value: astr
		    		});
		    		links.push({
		    			"source": mis["Launch Mission"],
		    			"target": astr.Name
		    		});
	    		});
	    	return {
	    		'links': links,
	    		'nodes': nodes
	    	};
		}

		var merge_graph = function(g1, g2){
			g2.nodes.forEach(function (node2) {
				if(g1.nodes.find(node1 => node1.id == node2.id) == undefined){
					g1.nodes.push(node2);
				}
			});
			g2.links.forEach(function (link2) {
				if(g1.links.find(link1 => link1.source == link2.source && link1.target == link2.target) == undefined){
					g1.links.push(link2);
				}
			});
			return g1;
		}

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

		console.log(data);
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