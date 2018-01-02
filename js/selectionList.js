class SelectionList{
	constructor(color, missions, astronauts, graph){
		this.color = color;
		this.missions = missions;
		this.astronauts = astronauts;
		this.graph = graph;
	}

	update(data){
		var map_mis = function (d) {				
				d["Prolongation"] = d3.max(d.Crew, c => c.Prolongation);
				d["Return Data"] = d3.max(d.Crew, c => c["Return Data"]);
				d["Crew Count"] = d3.sum(d.Crew, c => c.Members.length);
				// d["Country"] = "<img src='pics/esa_white.png' width='20' height='20'/>";
				return d;
			};
		var map_astrs = function (d) {
				return {
					"Launch Mission": d["Launch Mission"],
					"Launch Data": d["Launch Data"],
					"Country": d["Country"],
					"Habitation": d["Habitation"],
					"Prolongation": d3.max(d.Crew, c => c.Prolongation),
					"Crew Count": d3.sum(d.Crew, c => c.Members.length)
				}
			};

		var missions = this.missions;
		var astronauts = this.astronauts;
		console.log(astronauts);
		var graph = this.graph;
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
		    	members = astronauts.filter(astr => members.includes(astr.Name));
		    	var links = members.map(function (m) {
		    		return {
		    			"source": mis["Launch Mission"],
		    			"target": m.Name
		    		}
		    	})
		    	members.forEach(function (m) {
		    		nodes.push({
		    			id: m.Name,
		    			type: 'astronaut',
		    			value: m
		    		});
		    		var astrMis = missions.filter(miss => m.Missions.includes(miss["Launch Mission"]));
		    		astrMis.forEach(function (miss) {
		    			if(nodes.find(n => n.id == miss["Launch Mission"]) == undefined){
			    			nodes.push({
				    			id: miss["Launch Mission"],
				    			type: 'mission',
				    			value: miss
				    		});
				    		links.push({
				    			"source": miss["Launch Mission"],
				    			"target": m.Name
				    		});
		    			}
		    		})
		    	})
				console.log(links);
				console.log(nodes);
		    	var graph = {
		    		'links': [...new Set(links)],
		    		'nodes': [...new Set(nodes)] 
		    	}
				console.log(graph);
		    	return graph;
		}


		console.log(data);
		var grid = d3.divgrid()
					 .columns(["Launch Mission", "Launch Data", "Country", "Habitation"]);
		d3.select('#grid')
			.datum(data.map(map_mis))
			.call(grid)
			.selectAll(".row")
		    .on("click", function(d) {
		    	graph.update(create_mis_graph(d));
		    })
		    .on('mouseover', function (d) {
		    });
	}
}