function create_astr_graph(astr) {
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

function create_mis_graph(mis) {
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