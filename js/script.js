
let flightsChart = new FlightsChart();


d3.csv("data/missions.csv", function (error, missionsData) {

  var aggrMissions = d3.nest()
        .key(function(d) { return d['Launch Mission']; })
        .rollup(function(v) {
            var info = v[0];
            obj = {
                "Brief Mission Summary": info["Brief Mission Summary"],
                "Country": info["Country"],
                "Fatality": info["Fatality"],
                "Moon": info["Moon"],
                "Sub Orbital": info["Sub Orbital"],
                "Launch Data": info["Launch Data"],
                "Launch Mission": info["Launch Mission"],
                "Launch Year": info["Launch Year"],
                "Habitation": info["Habitation"],
                "Crew": v.map(function (part) {
                    return {
                        "Members": part["Crew"].split(',').map(name => name.trim()),
                        "Prolongation": part["Prolongation"],
                        "Return Data": part["Return Data"],
                        "Return Mission": part["Return Mission"]
                    }
                })
            }
            return obj;
        }) 
        .entries(missionsData)
        .map(d => d.value);


  flightsChart.update(aggrMissions);
});
