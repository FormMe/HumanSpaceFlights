
function astr_graph(astr) {
	var nodes = [{
		id: astr.Name,
		type: 'astronaut',
		value: astr,
    	selected: false
	}];
	var links = [];
	if (astr.Country != "Other") {
		missions
			.filter(mis => astr.Missions.includes(mis["Launch Mission"]))
			.forEach(function (mis) {
				nodes.push({
	    			id: mis["Launch Mission"],
	    			type: 'mission',
	    			value: mis,
	    			selected: false
	    		});
	    		links.push({
	    			"source": mis["Launch Mission"],
	    			"target": astr.Name
	    		});
			});
	}
	return {
		'links': links,
		'nodes': nodes
	};
}

function mis_graph(mis) {
	var members = [];
	var links = [];
	var nodes = [{
		id: mis["Launch Mission"],
		type: 'mission',
		value: mis,
    	selected: false
	}];
	mis.Crew.forEach(function (c) {
		members = members.concat(c.Members);
		c.Members.forEach(function (astr) {			
    		links.push({
    			"source": mis["Launch Mission"],
    			"target": astr
    		});
		})
	});
	astronauts
		.filter(astr => members.includes(astr.Name))
		.forEach(function (astr) {
    		nodes.push({
    			id: astr.Name,
    			type: 'astronaut',
    			value: astr,
    			selected: false
    		});
    		members.splice(members.indexOf(astr.Name), 1);
		});
	members.forEach(function (astr) {
		nodes.push({
			id: astr,
			type: 'astronaut',
			value: {Name: astr, Country: "Other"},
			selected: false
		});
	})
	return {
		'links': links,
		'nodes': nodes
	};
}

function merge_graph(g1, g2){
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


function create_astr_graph(astr) {
	var G = astr_graph(astr);
	G.nodes.filter(n => n.type == 'mission')
		.map(m => mis_graph(m.value))
		.forEach(function (g) { G = merge_graph(G, g); });
	G.nodes.find(n => n.id == astr.Name).selected = true;
	return G;
}

function create_mis_graph(mis) {
	var G = mis_graph(mis);
	G.nodes.filter(n => n.type == 'astronaut')
		.map(a => astr_graph(a.value))
		.forEach(function (g) { G = merge_graph(G, g); });
	G.nodes.find(n => n.id == mis["Launch Mission"]).selected = true;
	return G;
};
