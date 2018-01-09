var margin = {top: 66, right: 110, bottom: 20, left: 70},
    width = 1200 - margin.left - margin.right,
    height = 340 - margin.top - margin.bottom,
    innerHeight = height - 2;

var devicePixelRatio = 1;


var Countries = ["USSR/Russia", "USA", "China", "Other"]
var color = d3.scaleOrdinal()
            .range(["#7c587f", "#a4bcbc", "#007f97", "#4c3f77"])
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
var misDimensions = [
  {
    key: "Country",
    description: "Country",
    type: types["String"],
    axis: d3.axisLeft()
      .tickFormat(function(d,i) {
        return d;
      })
  },
  {
    key: "Habitation",
    description: "Habitation",
    type: types["String"],
    axis: d3.axisLeft()
      .tickFormat(function(d,i) {
        return d;
      })
  },
  {
    key: "Year",
    type: types["Number"],
    description: "Launch Year"
  },
  {
    key: "Crew size",
    type: types["Number"],
    description: "Crew size",
    axis: d3.axisLeft()
        .tickFormat(function(e){
            if(Math.floor(e) != e) return;
            return e;
        })
  },
  {
    key: "Duration",
    description: "Duration (days)",
    type: types["Number"]
  }
];


var astrDimensions = [
  {
    key: "Country",
    description: "Country",
    type: types["String"],
    axis: d3.axisLeft()
      .tickFormat(function(d,i) {
        return d;
      })
  },
  {
    key: "Gender",
    description: "Gender",
    type: types["String"],
    axis: d3.axisLeft()
      .tickFormat(function(d,i) {
        return d;
      })
  },
  {
    key: "Birth Year",
    type: types["Date"],
    description: "Birth Year"
  },
  {
    key: "Year",
    description: "Selection Year",
    type: types["Number"]
  },
  {
    key: "Status",
    description: "Status",
    type: types["String"],
    axis: d3.axisLeft()
      .tickFormat(function(d,i) {
        return d;
      })
  },
  {
    key: "Space Flights",
    type: types["Number"],
    description: "Count of Space Flights"
  },
  {
    key: "Space Flight (hr)",
    type: types["Number"],
    description: "Space Flights (hr)"
  },
  {
    key: "Space Walks",
    type: types["Number"],
    description: "Count of Space Walks"
  },
  {
    key: "Space Walks (hr)",
    type: types["Number"],
    description: "Space Walks (hr)"
  },
  {
    key: "Death Year",
    description: "Death Year",
    type: types["Date"]
  }
];


var container = d3.select("body").append('div')
    .classed("view parcoords",  true)
    .style('margin-left', "30px")
    .style("width", width + margin.left + margin.right + "px")
    .style("height", height + margin.top*2 + margin.bottom + "px");

var header = container.append('label').attr('class', 'title');
container.append('hr');

var svg = container.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var canvas = container.append("canvas")
    .attr("width", width )
    .attr("height", height )
    .style("width", width + "px")
    .style("height", height + "px")
    .style("margin-top", margin.top + "px")
    .style("margin-left", margin.left + "px");

var ctx = canvas.node().getContext("2d");
ctx.globalCompositeOperation = 'darken';
ctx.globalAlpha = 0.25;
ctx.lineWidth = 1.5;
ctx.scale(devicePixelRatio, devicePixelRatio);

function draw(d) {

  function cmp(d1, d2) {
      return isMissions ? d1["Launch Mission"] == d2["Launch Mission"] : d1["Name"] == d2["Name"];
  }

  var hl = d.highlighted || (info.d && cmp(info.d, d));
  ctx.strokeStyle = hl ? "red" : color(d.Country);   
  ctx.lineWidth = hl ? 3 : 1.5; 
  ctx.globalAlpha = hl ? 1 : 0.25; 
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
      dim.domain = d3_functor(dim.type.extent)(data.map(function(d) { return d[dim.key]; }));
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
      .attr("text-anchor", "start")
      .text(function(d) { return "description" in d ? d.description : d.key; });

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
