
let flightsChart = new FlightsChart();
let missions;

function filterHabitation() {
    var habitation = d3.select("#Habitation").node().value; 
    var filtered =  missions.filter(function (m) {
        if (habitation == "All") return true;
        return m["Habitation"] == habitation;
    });

    flightsChart.update(groupMissions(filtered));
}

function groupMissions(missions) {
    var Countries = ["USSR/Russia", "USA", "China", "Other"]
    return d3.nest()
            .key(function(d) { return d['Launch Year']; })
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

d3.csv("data/missions.csv", function (error, missionsData) {

  missions = d3.nest()
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

    
    flightsChart.drawLegend();
    flightsChart.update(groupMissions(missions));

});
