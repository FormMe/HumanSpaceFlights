
let flightsChart = new FlightsChart();


d3.csv("data/missions.csv", function (error, missionsData) {
    flightsChart.update(missionsData);
});
