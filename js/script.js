
let flightsChart = new FlightsChart();
let missions, astronauts;

function group_missions(missions) {
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

function filter_habitation(misData) {
    var habitation = d3.select("#Habitation").node().value; 
    return misData.filter(function (m) {
                if (habitation == "All") return true;
                return m["Habitation"] == habitation;
            });
}

function filter_fatality(misData) {
    var filtered = misData;
    var N = d3.select("#FatalityN").property("checked");
    var Y = d3.select("#FatalityY").property("checked");
    if(Y){
        if(N){
            d3.select("#FatalityN").property("checked", false);
            d3.select("#FatalityY").property("checked", false);
        }
        else{
            return filtered.filter(function(d,i){return d.Fatality == "Y";});
        }
    }  
    else{
        if(N){
            return filtered.filter(function(d,i){return d.Fatality == "N";});
        }
    }
    return filtered;
}

function filter_missions() {
    flightsChart.update(group_missions(filter_habitation(filter_fatality(missions))));    
}


d3.csv("data/all_astronauts.csv", function (error, astronautsData) {
    astronautsData.forEach(function (astr) {
        astr.Missions = astr.Missions.split(',').map(name => name.trim())
    })
    astronauts = astronautsData;
    console.log(astronauts);
});

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

    d3.select("#FatalityY").on("change",filter_missions);
    d3.select("#FatalityN").on("change",filter_missions);
    flightsChart.drawLegend();
    filter_missions();
});
