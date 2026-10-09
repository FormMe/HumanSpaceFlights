// The page controller: loads the data, applies the filters and feeds every
// view (bar chart, parameters plot, list, summary, graph, details card).

let missions, astronauts;
let info = new Info();
let graph = new Graph(color, info);
let selectionList = new SelectionList(color, graph, info);
let flightsChart = new FlightsChart(color);
let summaryChart = new SummaryChart(color);
let curMis = [], curAstrs = [];
var notFound = [];

// ---- grouping for the bar chart: per year, per country ----------------------

function stackCountries(groups) {
    var values = Countries.map(c => groups.find(g => g.key == c)).filter(Boolean);
    values.forEach(function (c, i) {
        c.prev = i == 0 ? 0 : values[i - 1].values.length + values[i - 1].prev;
    });
    return values;
}

function group_missions(misData) {
    return d3.nest()
        .key(d => d['Year'])
        .key(d => d['Country'])
        .entries(misData)
        .map(function (y) {
            y.values = stackCountries(y.values);
            return y;
        });
}

// people launched per year (a person flying twice counts in both years)
function group_astronauts(astrData, misData) {
    curAstrs = [];
    notFound = [];
    var known = new Set(astronauts.map(a => a.Name));

    var grouped = d3.nest()
        .key(d => d['Year'])
        .entries(misData)
        .map(function (y) {
            var astrs = [];
            y.values.forEach(function (mis) {
                mis.Crew.forEach(function (crew) {
                    crew.Members.forEach(function (n) {
                        astrs.push({ Name: n, "Year Mission": mis["Launch Mission"] });
                    });
                });
            });
            // the mission of each person in this year, kept with the bar (writing
            // it on the shared astronaut object made the last year win everywhere)
            var missionOf = {};
            astrs.forEach(function (a) { if (!(a.Name in missionOf)) missionOf[a.Name] = a["Year Mission"]; });

            var found = filter_status(filter_gender(filter_walk(astrData.filter(astr => astr.Name in missionOf))));
            curAstrs = curAstrs.concat(found);

            var groups = d3.nest().key(d => d['Country']).entries(found);
            var nFound = astrs.filter(astr => !known.has(astr.Name));
            if (nFound.length) {
                nFound.forEach(d => { d.Country = "Other"; });
                groups.push({ key: "Other", values: nFound });
                notFound = notFound.concat(nFound);
            }
            groups.forEach(g => { g.missionOf = missionOf; });
            y.values = stackCountries(groups);
            return y;
        });
    curAstrs = [...new Set(curAstrs)];
    return grouped;
}

// ---- filters ---------------------------------------------------------------------

function selected(id) { return document.getElementById(id).value; }

function filter_status(astrData) {
    var status = selected("Status");
    return status == "All" ? astrData : astrData.filter(astr => astr.Status == status);
}

function filter_gender(astrData) {
    var gender = selected("Gender");
    return gender == "All" ? astrData : astrData.filter(astr => astr.Gender == gender);
}

function filter_walk(astrData) {
    var walk = selected("SpaceWalk");
    if (walk == "All") return astrData;
    return astrData.filter(astr => (+astr["Space Walks"] > 0) === (walk == "Yes"));
}

function filter_habitation(misData) {
    var habitation = selected("Habitation");
    return habitation == "All" ? misData : misData.filter(m => m["Habitation"] == habitation);
}

function filter_outcome(misData) {
    var outcome = selected("Outcome");
    if (outcome == "All") return misData;
    return misData.filter(m => m.Fatality == (outcome == "Fatality" ? "Y" : "N"));
}

// every filter change and the Missions / Astronauts switch
function filter() {
    if (!missions || !astronauts) return;
    curMis = filter_habitation(filter_outcome(missions));
    if (isMissionMode()) {
        flightsChart.update(group_missions(curMis), true);
        paracoords_update(curMis, true);
    } else {
        flightsChart.update(group_astronauts(astronauts, curMis), false);
        // axes keep the range of all astronauts, whatever is filtered
        paracoords_update(curAstrs, false, astronauts);
    }
    // the charts say it when the filters match nothing
    var none = isMissionMode() ? !curMis.length : !curAstrs.length;
    d3.selectAll(".stacked, .parcoords")
        .classed("is-empty", none)
        .attr("data-empty", "No " + (isMissionMode() ? "missions" : "astronauts") + " match these filters");
    graph.clear();
    info.remove();
}

// the astronaut filters are only shown in the Astronauts view
function filter_astr() {
    if (!isMissionMode()) filter();
}

function complete_graph() {
    info.remove();
    var G = { 'links': [], 'nodes': [] };
    var create = isMissionMode() ? create_mis_graph : create_astr_graph;
    selectionList.data.forEach(function (row) {
        G = merge_graph(G, create(row));
    });
    G.nodes.forEach(function (n) { n.selected = false; });  // nothing is "the" selected node here
    graph.update(G);
}

function get_country_html(d) {
    var code = (d["Country Code"] || "").toLowerCase();
    if (/^[a-z]{2}$/.test(code) && ["us", "ru", "cn"].indexOf(code) == -1) {
        return "<img src='pics/flags/" + code + ".svg' width='22' height='15' alt='" + code.toUpperCase() +
               "' title='" + esc(d.Nationality || d.Country) + "'>";
    }
    switch (d.Country) {
        case 'USA': return "<img src='pics/usa_flag.png' width='22' height='12' alt='' title='USA'>";
        case 'USSR/Russia':
            return +d.Year < 1991
                ? "<img src='pics/ussr_flag.png' width='22' height='12' alt='' title='USSR'>"
                : "<img src='pics/rus_flag.png' width='22' height='12' alt='' title='Russia'>";
        case "China": return "<img src='pics/china_flag.png' width='22' height='12' alt='' title='China'>";
    }
    return "";
}

// ---- data ----------------------------------------------------------------------------

// a country outside the palette would get a random colour and lose its bar
function knownCountry(c) { return Countries.indexOf(c) >= 0 ? c : "Other"; }
function num(v) { return v === "" || v == null ? 0 : +v; }

function prepareAstronauts(rows) {
    rows.forEach(function (astr) {
        astr.Missions = astr.Missions.split(',').map(name => name.trim()).filter(Boolean);
        astr.Country = knownCountry(astr.Country);
        // numbers once, here: views compare and sort them
        ["Space Flights", "Space Flight (hr)", "Space Walks", "Space Walks (hr)"].forEach(function (k) {
            astr[k] = num(astr[k]);
        });
        astr["Country Flag"] = get_country_html(astr);
        astr["Birth Year"] = astr["Birth Date"];
        astr["Death Year"] = astr["Death Date"];
        astr["highlighted"] = false;
        astr["Year"] = astr["Year"] == "" ? null : astr["Year"];
    });
    return rows;
}

// one row per launch: crews that returned on another ship are separate CSV rows
function prepareMissions(rows) {
    return d3.nest()
        .key(d => d['Launch Mission'])
        .rollup(function (v) {
            var row = v[0];
            var obj = {
                "Brief Mission Summary": row["Brief Mission Summary"],
                "Country": knownCountry(row["Country"]),
                "Country Flag": get_country_html(row),
                "Fatality": row["Fatality"],
                "Moon": row["Moon"],
                "Sub Orbital": row["Sub Orbital"],
                "Launch Data": row["Launch Data"],
                "Launch Mission": row["Launch Mission"],
                "Year": row["Year"],
                "Habitation": row["Habitation"] == "" ? "Space" : row["Habitation"],
                "Rocket": row["Rocket"], "Spacecraft": row["Spacecraft"],
                "Launch Site": row["Launch Site"], "Landing Site": row["Landing Site"],
                "Callsign": row["Callsign"], "Operator": row["Operator"], "Flight Time": row["Flight Time"],
                "Wikipedia": row["Wikipedia"], "Description": row["Description"],
                "Photo URL": row["Photo URL"], "Photo Credit": row["Photo Credit"], "Photo Page": row["Photo Page"],
                "Patch URL": row["Patch URL"], "Patch Credit": row["Patch Credit"], "Patch Page": row["Patch Page"],
                "highlighted": false,
                "Crew": v.map(part => ({
                    "Members": part["Crew"].split(',').map(name => name.trim()).filter(Boolean),
                    "Duration": parseInt(part["Prolongation"]),
                    "Return Data": part["Return Data"],
                    "Return Mission": part["Return Mission"]
                }))
            };
            obj["Duration"] = d3.max(obj.Crew, c => c.Duration);
            obj["Return Data"] = d3.max(obj.Crew, c => c["Return Data"]);
            obj["Crew size"] = d3.sum(obj.Crew, c => c.Members.length);
            obj["Members"] = [].concat.apply([], obj.Crew.map(c => c.Members));
            return obj;
        })
        .entries(rows)
        .map(d => d.value)
        .sort((a, b) => d3.ascending(a["Launch Data"], b["Launch Data"]));
}

function showStats(meta) {
    if (meta.built_at)
        d3.select("#DataUpdated").text(" · updated " + meta.built_at.slice(0, 10));
    var stats = [[meta.missions, "missions"], [meta.astronauts, "astronauts"],
                 ["1961–" + String(meta.last_launch || "").slice(0, 4), ""]];
    d3.select("#Stats").selectAll(".stat").data(stats).enter()
        .append("span").attr("class", "stat")
        .style("animation-delay", (d, i) => (0.3 + i * 0.1) + "s")
        .html(d => "<b>" + esc(d[0]) + "</b>" + (d[1] ? " " + d[1] : ""));
}

function loadFailed(error) {
    console.error(error);
    d3.select("#Stats").html("").append("span").attr("class", "stat stat-error")
        .text("The data could not be loaded. Please reload the page.");
}

// both tables first: clicks before the second one arrived used to throw
d3.queue()
    .defer(d3.csv, "data/missions.csv")
    .defer(d3.csv, "data/all_astronauts.csv")
    .await(function (error, missionRows, astronautRows) {
        if (error || !missionRows || !astronautRows) return loadFailed(error);
        astronauts = prepareAstronauts(astronautRows);
        missions = prepareMissions(missionRows);
        curMis = missions;

        flightsChart.drawLegend();
        flightsChart.update(group_missions(missions), true);
        paracoords_update(missions, true);
        // the switch works once there is something to switch to
        d3.selectAll("#DataType, .mode-switch button").property("disabled", false);
        // a select restored by the browser (back / forward) applies at once
        if (!isMissionMode() || ["Habitation", "Outcome"].some(id => selected(id) != "All")) filter();

        var barScroll = document.querySelector('.stacked .scroll-x');
        if (barScroll) barScroll.scrollLeft = barScroll.scrollWidth;
    });

d3.json("data/meta.json", function (error, meta) {
    if (!error && meta) showStats(meta);
});
