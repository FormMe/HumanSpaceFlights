
margin = {top: 20, right: 10, bottom: 15, left: 30};
svgWidth = 900;
svgHeight = 400;
var Countries = ["USSR/Russia", "USA", "China", "Other"]
var color = d3.scaleOrdinal()
            .range(["#7c587f", "#a4bcbc", "#007f97", "#4c3f77"])
            .domain(Countries);

let missions, astronauts;
let info = new Info();
let graph = new Graph(color, info);
let selectionList = new SelectionList(color, graph, info);
let flightsChart = new FlightsChart(svgHeight, svgWidth, margin, selectionList, color);
let sunburstStat = new SunburstStat();
let curMis = [], curAstrs = [];
var brush;
var firstParaCoord = true;

function group_missions(missions) {
    return d3.nest()
            .key(function(d) { return d['Year']; })
            .key(function(d) { return d['Country']; })
            .entries(missions)
            .map(function (d) {     
                d.values = Countries.map(function (c) {
                    return d.values.find(function (a) {
                        return a.key == c;
                    });
                }).filter(c => c != undefined);                     
                d.values.forEach(function (c, i) {
                    d.values[i].prev = i == 0 ? 0 : d.values[i-1].values.length + d.values[i-1].prev;
                });
                return d;
            });
}

function filter_status(astrData){
    var status = d3.select("#Status").node().value;
    return astrData.filter(function (astr) {
        if (status == "All") return true;
        return astr.Status == status;
    });
}

function filter_gender(astrData){ 
    var gender = d3.select("#Gender").node().value;
    return astrData.filter(function (astr) {
        if (gender == "All") return true;
        return astr.Gender == gender;
    });
}

function filter_walk(astrData){
    var walk = d3.select("#SpaceWalk").node().value;
    return astrData.filter(function (astr) {
        switch (walk) {
          case "All": return true;
          case "No": return astr["Space Walks"] == "" || astr["Space Walks"] == 0.0;
          case "Yes": return astr["Space Walks"] != "" || astr["Space Walks"] > 0.0;
        } 
    });
}


function group_astronauts(astrData, misData){

    curAstrs = [];
    var yearGroupMis = d3.nest()
                    .key(function(d) { return d['Year']; })
                    .entries(misData);
    return yearGroupMis.map(function (y) {
        var astrs = [];
        y.values.forEach(function (mis) {
            mis.Crew.forEach(function (crew) {
                var members = crew.Members.map(function (n) {
                    return{
                        Name: n,
                        "Year Mission": mis["Launch Mission"]
                    }
                })
                astrs = astrs.concat(members);
            })
        });
        astrs = [...new Set(astrs)];
        found = astrData.filter(function (astr) {
                    return astrs.find(a => a.Name == astr.Name) != undefined;
                });
        
        found.forEach(function (astr) {
                astr["Year Mission"] = astrs.find(a => a.Name == astr.Name)["Year Mission"];
            });
        var notFound = [...new Set(astrs.filter(astr => found.find(a => a.Name == astr.Name) == undefined))];

        found = filter_status(filter_gender(filter_walk(found)));
        curAstrs = curAstrs.concat(found);

        var grouped = d3.nest()
                        .key(d => d['Country'])
                        .entries(found);

        if(notFound.length != 0){
            grouped.push({
                key: "Other",
                values: notFound
            });
        }
        y.values = Countries.map(function (c) {
            return grouped.find(function (a) {
                return a.key == c;
            });
        }).filter(c => c != undefined);                     
        y.values.forEach(function (c, i) {
            y.values[i].prev = i == 0 ? 0 : y.values[i-1].values.length + y.values[i-1].prev;
        });
        curAstrs = [... new Set(curAstrs)];
        return y;
    });           
}


function filter_habitation(misData) {
    var habitation = d3.select("#Habitation").node().value; 
    return misData.filter(function (m) {
                if (habitation == "All") return true;
                return m["Habitation"] == habitation;
            });
}

function filter_fatality(misData) {
    var outcome = d3.select("#Outcome").node().value; 
    return misData.filter(function (m) {
                switch (outcome) {
                  case "All": return true;
                  case "Fatality": return m.Fatality == "Y";
                  case "Success": return m.Fatality == "N";
                }   
            });
}

function filter() {
    var dataType = d3.select("#DataType").node().value; 
    curMis = filter_habitation(filter_fatality(missions));  
    if (dataType == "Astonauts"){  
        flightsChart.update(group_astronauts(astronauts, curMis), false);   
    	if(firstParaCoord){
    		paracoords_update(astronauts, false);
    		firstParaCoord = false;
    	}
    	paracoords_update(curAstrs, false);
    }
    else if (dataType == "Missions"){
        flightsChart.update(group_missions(curMis), true);   
    	paracoords_update(curMis, true);
    }
    d3.select('#FlightsChart').select('.brush').call(brush.move, null);
    d3.select("#Graph").selectAll('g').remove();
    info.remove();
}

function filter_astr() {
    var dataType = d3.select("#DataType").node().value; 
    if (dataType == "Astonauts"){
        curMis = filter_habitation(filter_fatality(missions));  
        flightsChart.update(group_astronauts(astronauts, curMis), false); 
    	if(firstParaCoord){
    		paracoords_update(astronauts, false);
    		firstParaCoord = false;
    	}
    	paracoords_update(curAstrs, false);

    }
    d3.select('#FlightsChart').select('.brush').call(brush.move, null);
    d3.select("#Graph").selectAll('g').remove();
    info.remove();
}


function create_year_brush(){

    brush = d3.brushX()
              .extent([[margin.left, svgHeight - margin.top - margin.bottom],
                       [svgWidth - margin.left - margin.right, svgHeight - 3]])
              // .on("brush", brushed)
              .on("end", brushed);
    function brushed() {
	    var s = d3.event.selection;
	    var dataType = d3.select("#DataType").node().value; 
	    var fMis = curMis;
	    if (s != null) {
	        var years = d3.select(".Xaxis").selectAll('.tick')
	                        .filter(function (d) {
	                            var x = d3.select(this)._groups[0][0].transform.animVal[0].matrix.e;
	                            return x >= s[0] && x <= s[1];
	                        })._groups[0]
	                        .map(d => parseInt(d.__data__));
	        fMis = fMis.filter(d => years.includes(d["Year"]));
	    }
    	if (dataType == "Astonauts"){
            group_astronauts(astronauts, fMis);
			paracoords_update(curAstrs, false);
        }
        else if (dataType == "Missions"){
			paracoords_update(fMis, true);
        }
	    
	}	              
    d3.select('#FlightsChart').select('.brush').call(brush);   
}


function complete_graph() {
    info.remove();
    var G = {'links':[], 'nodes':[]};
    var dataType = d3.select("#DataType").node().value; 
    selectionList.data.forEach(function (row) {
        if (dataType == "Astonauts"){
           G = merge_graph(G, create_astr_graph(row));
        }
        else if (dataType == "Missions"){
           G = merge_graph(G, create_mis_graph(row));
        }
    });

    graph.update(G);
}

function get_country_html(d){
    switch(d.Country){
        case 'USA': return "<img src='pics/usa_flag.png' width='22' height='12' title='USA'>";
        case 'USSR/Russia': 
            if(d.Year < 1991)
                return "<img src='pics/ussr_flag.png' width='22' height='12' title='USSR'>";
            else
                return "<img src='pics/rus_flag.png' width='22' height='12' title='Russia'>";

        case "China": return "<img src='pics/china_flag.png' width='22' height='12' title='China'>";
    }
}   

d3.csv("data/all_astronauts.csv", function (error, astronautsData) {
    astronautsData.forEach(function (astr) {
        astr.Missions = astr.Missions.split(',').map(name => name.trim());
        astr["Space Walks"] = astr["Space Walks"] == "" ? 0 : astr["Space Walks"];
        astr["Space Walks (hr)"] = astr["Space Walks (hr)"] == "" ? 0 : astr["Space Walks (hr)"];
		astr["Country Flag"] = get_country_html(astr);
		astr["Birth Year"] = astr["Birth Date"];
		astr["Death Year"] = astr["Death Date"];
		astr["highlighted"] = false;
        astr["Year"] = astr["Year"] == "" ? astr["Birth Date"] : astr["Year"];
    })
    astronauts = astronautsData;
});

d3.csv("data/missions.csv", function (error, missionsData) {

  missions = d3.nest()
        .key(function(d) { return d['Launch Mission']; })
        .rollup(function(v) {
            var info = v[0];
            obj = {
                "Brief Mission Summary": info["Brief Mission Summary"],
                "Country": info["Country"],
                "Country Flag": get_country_html(info),
                "Fatality": info["Fatality"],
                "Moon": info["Moon"],
                "Sub Orbital": info["Sub Orbital"],
                "Launch Data": info["Launch Data"],
                "Launch Mission": info["Launch Mission"],
                "Year": info["Year"],
                "Habitation": info["Habitation"] == "" ? "Space" : info["Habitation"],
                "highlighted": false,
                "Crew": v.map(function (part) {
                    return {
                        "Members": part["Crew"].split(',').map(name => name.trim()),
                        "Duration": parseInt(part["Prolongation"]),
                        "Return Data": part["Return Data"],
                        "Return Mission": part["Return Mission"]
                    }
                })
            }
            obj["Duration"] = d3.max(obj.Crew, c => c.Duration);
            obj["Return Data"] = d3.max(obj.Crew, c => c["Return Data"]);
            obj["Crew size"] = d3.sum(obj.Crew, c => c.Members.length);
            var members = [];
            obj.Crew.forEach(function (c) {
                members = members.concat(c.Members);
            });
            obj["Members"] = members;
            return obj;
        }) 
        .entries(missionsData)
        .map(d => d.value);

    curMis = missions;
    flightsChart.drawLegend();
    flightsChart.update(group_missions(missions), true);    
    sunburstStat.update([]); 
    create_year_brush();
    paracoords_update(missions, true);

});
