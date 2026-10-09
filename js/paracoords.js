var margin = {top: 42, right: 110, bottom: 20, left: 84},
    width = 1200 - margin.left - margin.right,
    height = 340 - margin.top - margin.bottom,
    innerHeight = height - 2;

var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);


var Countries = ["USSR/Russia", "USA", "China", "Other"]
var color = d3.scaleOrdinal()
            .range(["#e5578b", "#3987e5", "#c98500", "#8a92a6"])
            .domain(Countries);

var types = {
  "Number": {
    key: "Number",
    coerce: function(d) { return +d; },
    extent: d3.extent,
    within: function(d, extent, dim) { return extent[0] <= dim.scale(d) && dim.scale(d) <= extent[1]; },
    defaultScale: d3.scaleLinear().range([innerHeight, 0])
  },
  "String": {
    key: "String",
    coerce: String,
    extent: function (data) { return data.sort(); },
    within: function(d, extent, dim) { return extent[0] <= dim.scale(d) && dim.scale(d) <= extent[1]; },
    defaultScale: d3.scalePoint().range([0, innerHeight])
  },
  "Date": {
    key: "Date",
    coerce: function(d) { return new Date(d); },
    extent: d3.extent,
    within: function(d, extent, dim) { return extent[0] <= dim.scale(d) && dim.scale(d) <= extent[1]; },
    defaultScale: d3.scaleTime().range([innerHeight, 0])
  }
};

var dimensions, xscale, isMissions;
// Integer ticks only (counts, years).
function intAxis() {
  return d3.axisLeft().tickFormat(function (e) { return Math.floor(e) === e ? e : ""; });
}

// Categorical axes list their values in a meaningful order (top to bottom),
// not alphabetically; values missing from the list are appended at the end.
function ordered(order) {
  return function (values) {
    var present = d3.set(values.filter(function (v) { return v != null; })).values();
    var known = order.filter(function (v) { return present.indexOf(v) >= 0; });
    var rest = present.filter(function (v) { return order.indexOf(v) < 0; }).sort();
    return known.concat(rest);
  };
}

var countryOrder = ["USSR/Russia", "USA", "China", "Other"];
var habitationOrder = ["Space", "Moon", "Salyut 1", "Salyut 3", "Salyut 4", "Salyut 5",
                       "Salyut 6", "Salyut 7", "Skylab", "Mir", "ISS",
                       "Tiangong 1", "Tiangong 2", "Tiangong"];
var statusOrder = ["Active", "Management", "Retired", "Deceased"];

var misDimensions = [
  { key: "Country", description: "Country", type: types["String"], order: ordered(countryOrder) },
  { key: "Habitation", description: "Habitation", type: types["String"], order: ordered(habitationOrder) },
  { key: "Year", description: "Launch year", type: types["Number"], axis: intAxis() },
  { key: "Crew size", description: "Crew size", type: types["Number"], axis: intAxis() },
  { key: "Duration", description: "Duration\n(days)", type: types["Number"] }
];

var astrDimensions = [
  { key: "Country", description: "Country", type: types["String"], order: ordered(countryOrder) },
  { key: "Gender", description: "Gender", type: types["String"], order: ordered(["Female", "Male"]) },
  { key: "Birth Year", description: "Born", type: types["Date"] },
  { key: "Year", description: "Selected", type: types["Number"], axis: intAxis() },
  { key: "Space Flights", description: "Flights", type: types["Number"], axis: intAxis() },
  { key: "Space Flight (hr)", description: "Hours\nin space", type: types["Number"] },
  { key: "Space Walks", description: "Spacewalks", type: types["Number"], axis: intAxis() },
  { key: "Space Walks (hr)", description: "Spacewalk\nhours", type: types["Number"] },
  { key: "Status", description: "Status", type: types["String"], order: ordered(statusOrder) },
  { key: "Death Year", description: "Died", type: types["Date"] }
];


var svgWidth = width + margin.left + margin.right,
    svgHeight = height + margin.top + margin.bottom;

var container = d3.select("#parcoords");

var header = container.append('h2').attr('class', 'title');

// The plot keeps its original coordinate system (viewBox) and is scaled
// to the card width with CSS; the canvas is positioned in percentages so
// it always stays aligned with the svg axes.
var plot = container.append('div')
    .attr('class', 'scroll-x')
  .append('div')
    .attr('class', 'parcoords-plot')
    .style('aspect-ratio', svgWidth + ' / ' + svgHeight);

var svg = plot.append("svg")
    .attr("viewBox", "0 0 " + svgWidth + " " + svgHeight)
    .attr("preserveAspectRatio", "xMinYMin meet")
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var canvas = plot.append("canvas")
    .attr("width", width * pixelRatio)
    .attr("height", height * pixelRatio)
    .style("left", (100 * margin.left / svgWidth) + "%")
    .style("top", (100 * margin.top / svgHeight) + "%")
    .style("width", (100 * width / svgWidth) + "%")
    .style("height", (100 * height / svgHeight) + "%");

var ctx = canvas.node().getContext("2d");
ctx.globalCompositeOperation = 'source-over';
ctx.globalAlpha = 0.25;
ctx.lineWidth = 1.5;
ctx.scale(pixelRatio, pixelRatio);

function draw(d) {

  function cmp(d1, d2) {
      return isMissions ? d1["Launch Mission"] == d2["Launch Mission"] : d1["Name"] == d2["Name"];
  }

  var hl = d.highlighted || (info.d && cmp(info.d, d));
  ctx.strokeStyle = hl ? "#ffffff" : color(d.Country);
  ctx.lineWidth = hl ? 2.5 : 1.2;
  ctx.globalAlpha = hl ? 1 : 0.2;
  ctx.beginPath();
  var coords = dimensions.map(function(p,i) {
                    // check if data element has property and contains a value
                    if (!(p.key in d) || d[p.key] === null) 
                      return null;
                    return [xscale(i),p.scale(d[p.key])];
                  });
  coords.forEach(function(p,i) {
    // this tricky bit avoids rendering null values as 0
    if (p === null) {
      // this bit renders horizontal lines on the previous/next
      // dimensions, so that sandwiched null values are visible
      if (i > 0) {
        var prev = coords[i-1];
        if (prev !== null) {
          ctx.moveTo(prev[0],prev[1]);
          ctx.lineTo(prev[0]+6,prev[1]);
        }
      }
      if (i < coords.length-1) {
        var next = coords[i+1];
        if (next !== null) {
          ctx.moveTo(next[0]-6,next[1]);
        }
      }
      return;
    }
    
    if (i == 0) {
      ctx.moveTo(p[0],p[1]);
      return;
    }

    ctx.lineTo(p[0],p[1]);
  });
  ctx.stroke();
}

var curData;
function renderList(_data, isMissions) {
  if(_data == null) _data = curData;
  ctx.clearRect(0,0,width,height);
  _data.forEach(draw);
}

function paracoords_update(data, isMis) {
  curData = data;
  isMissions = isMis;
  if (isMissions) {
    dimensions = misDimensions;
    header.text('Missions parameters');
  }
  else{
    dimensions = astrDimensions;
    header.text('Astronauts parameters');
  }

  svg.selectAll(".axis").remove();

  xscale = d3.scalePoint()
      .domain(d3.range(dimensions.length))
      .range([0, width]);

  var yAxis = d3.axisLeft();

  var axes = svg.selectAll(".axis")
      .data(dimensions)
    .enter().append("g")
      .attr("class", function(d) { return "axis " + d.key.replace(/ /g, "_"); })
      .attr("transform", function(d,i) { return "translate(" + xscale(i) + ")"; });

  data.forEach(function(d) {
    dimensions.forEach(function(p) {
        d[p.key] = d[p.key] != 0 && !d[p.key] ? null : p.type.coerce(d[p.key]);
    });
  });

  // type/dimension default setting happens here
  dimensions.forEach(function(dim) {
    if (!("domain" in dim)) {
      // detect domain using dimension type's extent function
      var values = data.map(function(d) { return d[dim.key]; });
      dim.domain = dim.order ? dim.order(values) : d3_functor(dim.type.extent)(values);
    }
    if (!("scale" in dim)) {
      // use type's default scale for dimension
      dim.scale = dim.type.defaultScale.copy();
    }
    dim.scale.domain(dim.domain);
  });

  var render = renderQueue(draw).rate(15);
  ctx.clearRect(0,0,width,height);
  ctx.globalAlpha = d3.min([0.85/Math.pow(data.length,0.3),1]);
  render(data);
  selectionList.update(data, isMissions);
  summaryChart.update(data, isMissions);

  axes.append("g")
      .each(function(d) {
        var renderAxis = "axis" in d
          ? d.axis.scale(d.scale)  // custom axis
          : yAxis.scale(d.scale);  // default axis
        d3.select(this).call(renderAxis);
      })
    .append("text")
      .attr("class", "title")
      .attr("text-anchor", "middle")
      .each(function(d) {
        // one or two lines, the last one just above the axis
        var lines = ("description" in d ? d.description : d.key).split("\n");
        var text = d3.select(this);
        lines.forEach(function(line, i) {
          text.append("tspan")
              .attr("x", 0)
              .attr("dy", i === 0 ? (-(lines.length - 1) * 1.15) + "em" : "1.15em")
              .text(line);
        });
      });

  // Add and store a brush for each axis.
  axes.append("g")
      .attr("class", "brush")
      .each(function(d) {
        d3.select(this).call(d.brush = d3.brushY()
          .extent([[-10,0], [10,height]])
          .on("start", brushstart)
          .on("brush", brush)
          .on("end", function () {
            var selected = brush();
            summaryChart.update(selected, isMissions);
            if (isMissions) {
              flightsChart.update(group_missions(selected), isMissions);  
            }
            else{
              flightsChart.update(group_astronauts(selected, curMis), isMissions); 
            }
          } )
        )
      })
    .selectAll("rect")
      .attr("x", -8)
      .attr("width", 16);

  d3.selectAll(".axis.Country .tick text")
    .style("fill", color);
    
  function brushstart() {
    d3.event.sourceEvent.stopPropagation();
  }

  // Handles a brush event, toggling the display of foreground lines.
  function brush() {
    // render.invalidate();

    var actives = [];
    svg.selectAll(".axis .brush")
      .filter(function(d) {
        return d3.brushSelection(this);
      })
      .each(function(d) {
        actives.push({
          dimension: d,
          extent: d3.brushSelection(this)
        });
      });

    var selected = data.filter(function(d) {
      if (actives.every(function(active) {
          var dim = active.dimension;
          // test if point is within extents for each active brush
          return dim.type.within(d[dim.key], active.extent, dim);
        })) {
        return true;
      }
    });

    curData = selected;
    renderList(selected, isMissions);    
    selectionList.update(selected, isMissions);
    return selected;
  }
}

function d3_functor(v) {
  return typeof v === "function" ? v : function() { return v; };
};
