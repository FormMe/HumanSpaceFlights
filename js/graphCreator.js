
// lookups built once per data set: who is who, and who flew which missions
// (scanning every astronaut and mission for each node made "Draw all" slow)
var lookups = { missions: null, astronauts: null };
function lookup() {
	if (lookups.missions !== missions || lookups.astronauts !== astronauts) {
		var byName = new Map(), missionsOf = new Map();
		astronauts.forEach(a => byName.set(a.Name, a));
		missions.forEach(function (m) {
			m.Members.forEach(function (n) {
				if (!missionsOf.has(n)) missionsOf.set(n, new Set());
				missionsOf.get(n).add(m);
			});
		});
		lookups = { missions: missions, astronauts: astronauts, byName: byName, missionsOf: missionsOf };
	}
	return lookups;
}

function astr_graph(astr) {
	var nodes = [{
		id: astr.Name,
		type: 'astronaut',
		value: astr,
    	selected: false
	}];
	var links = [];
	if (!astr.stub) {
		var crewOf = lookup().missionsOf.get(astr.Name) || new Set();
		missions
			// by name, and by crew membership (one spelling mistake must not break a link)
			.filter(mis => crewOf.has(mis) || astr.Missions.includes(mis["Launch Mission"]))
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
	var byName = lookup().byName;
	members.slice().map(n => byName.get(n)).filter(Boolean)
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
			value: {Name: astr, Country: "Other", stub: true},
			selected: false
		});
	})
	return {
		'links': links,
		'nodes': nodes
	};
}

// Union of two graphs. Lookups go through hash maps kept on g1, so merging
// hundreds of graphs ("Draw all") stays linear instead of quadratic.
function merge_graph(g1, g2){
	if (!g1._ids) {
		g1._ids = new Set(g1.nodes.map(n => n.id));
		g1._links = new Set(g1.links.map(l => l.source + "\u0000" + l.target));
	}
	g2.nodes.forEach(function (node2) {
		if (!g1._ids.has(node2.id)) {
			g1._ids.add(node2.id);
			g1.nodes.push(node2);
		}
	});
	g2.links.forEach(function (link2) {
		var key = link2.source + "\u0000" + link2.target;
		if (!g1._links.has(key)) {
			g1._links.add(key);
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
