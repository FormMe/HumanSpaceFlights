
let flightsChart = new FlightsChart(900, 500);
let sunburstStat = new SunburstStat();
let missions, astronauts;
var Countries = ["USSR/Russia", "USA", "China", "Other"]

function group_missions(missions) {
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

function filter_status(astrData){
    var status = d3.select("#Status").node().value;
    return astrData.filter(function (astr) {
        if (status == "All") return true;
        return astr.Status == status;
    });
}

function group_astronauts(astrData, misData){

    var yearGroupMis = d3.nest()
                    .key(function(d) { return d['Launch Year']; })
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
        
        found = filter_status(found);

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

function filter() {
    var fMis = filter_habitation(filter_fatality(missions));  
    var dataType = d3.select("#DataType").node().value; 
    if (dataType == "Astonauts"){    
        flightsChart.update(group_astronauts(astronauts, fMis), false);   
    }
    else if (dataType == "Missions"){
        flightsChart.update(group_missions(fMis), true);   
    }
}


d3.csv("data/all_astronauts.csv", function (error, astronautsData) {
    astronautsData.forEach(function (astr) {
        astr.Missions = astr.Missions.split(',').map(name => name.trim())
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

    d3.select("#FatalityY").on("change",filter);
    d3.select("#FatalityN").on("change",filter);
    flightsChart.drawLegend();
    flightsChart.raise_up(group_astronauts(astronauts, missions), false);       
    sunburstStat.update([]);
});
