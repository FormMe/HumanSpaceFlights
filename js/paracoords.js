var margin = {top: 42, right: 110, bottom: 20, left: 100},
    width = 1200 - margin.left - margin.right,
    height = 340 - margin.top - margin.bottom,
    plotHeight = height - 2;

var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);



var types = {
  "Number": {
    key: "Number",
    coerce: function(d) { return +d; },
    extent: d3.extent,
    within: function(d, extent, dim) { return extent[0] <= dim.scale(d) && dim.scale(d) <= extent[1]; },
    defaultScale: d3.scaleLinear().range([plotHeight, 0])
  },
  "String": {
    key: "String",
    coerce: String,
    extent: function (data) { return data.sort(); },
    within: function(d, extent, dim) { return extent[0] <= dim.scale(d) && dim.scale(d) <= extent[1]; },
    // half a step of space at both ends: the values sit inside the axis,
    // not on its ends (Female / Male at a quarter and three quarters)
    defaultScale: d3.scalePoint().range([0, plotHeight]).padding(0.5)
  },
  "Date": {
    key: "Date",
    coerce: function(d) { return new Date(d); },
    extent: d3.extent,
    within: function(d, extent, dim) { return extent[0] <= dim.scale(d) && dim.scale(d) <= extent[1]; },
    defaultScale: d3.scaleTime().range([plotHeight, 0])
  }
};

var dimensions, xscale, isMissions;
// Integer ticks only (counts, years).
function intFormat(e) { return Math.floor(e) === e ? e : ""; }

// Desktop: axes side by side, values up the axis. Phones: the plot is turned
// by 90 degrees, axes are rows one under another and values run to the right,
// so every axis fits the screen with readable labels (no sideways scrolling).
var vertical = false, plotW = width, plotH = height, lastFull = null;
// script.js declares globals with the same names (margin, width, height):
// keep this plot's own sizes
var PC_DESKTOP = { m: { top: margin.top, right: margin.right, bottom: margin.bottom, left: margin.left }, w: width, h: height };
var phone = PHONE;

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

var countryOrder = Countries;
var habitationOrder = ["Space", "Moon", "Salyut 1", "Salyut 3", "Salyut 4", "Salyut 5",
                       "Salyut 6", "Salyut 7", "Skylab", "Mir", "ISS",
                       "Tiangong 1", "Tiangong 2", "Tiangong"];
var statusOrder = ["Active", "Management", "Retired", "Deceased"];

var misDimensions = [
  { key: "Country", description: "Country", type: types["String"], order: ordered(countryOrder) },
  { key: "Habitation", description: "Habitation", type: types["String"], order: ordered(habitationOrder) },
  { key: "Year", description: "Launch year", type: types["Number"], int: true },
  { key: "Crew size", description: "Crew size", type: types["Number"], int: true },
  { key: "Duration", description: "Duration\n(days)", type: types["Number"] }
];

var astrDimensions = [
  { key: "Country", description: "Country", type: types["String"], order: ordered(countryOrder) },
  { key: "Gender", description: "Gender", type: types["String"], order: ordered(["Female", "Male"]) },
  { key: "Birth Year", description: "Born", type: types["Date"] },
  { key: "Year", description: "Selected", type: types["Number"], int: true },
  { key: "Space Flights", description: "Flights", type: types["Number"], int: true },
  { key: "Space Flight (hr)", description: "Hours\nin space", type: types["Number"] },
  { key: "Space Walks", description: "Spacewalks", type: types["Number"], int: true },
  { key: "Space Walks (hr)", description: "Spacewalk\nhours", type: types["Number"] },
  { key: "Status", description: "Status", type: types["String"], order: ordered(statusOrder) },
  { key: "Death Year", description: "Died", type: types["Date"] }
];


var svgWidth = width + margin.left + margin.right,
    svgHeight = height + margin.top + margin.bottom;

var container = d3.select("#parcoords");

var header = container.append('h2').attr('class', 'title');

// how to use it, then (once something is picked) how many rows are left
var pcBar = container.append('div').attr('class', 'pc-bar');
var pcHint = pcBar.append('p').attr('class', 'pc-hint');
pcHint.html("<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' " +
          "stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3'/></svg>" +
          "<span></span>");
var pcStatus = pcBar.append('p').attr('class', 'pc-status').attr('aria-live', 'polite');
pcStatus.append('span').attr('class', 'pc-count');
pcStatus.append('button').attr('type', 'button').attr('class', 'pc-reset').text('Reset')
    .on('click', function () { clearBrushes(); });

function showCount(n, total) {
  var on = n < total;
  pcBar.classed('filtered', on);
  pcStatus.select('.pc-count').html(on ? "<b>" + n.toLocaleString("en-US") + "</b> of " + total.toLocaleString("en-US") +
                                       (isMissions ? " missions" : " astronauts") : "");
}

// every brush back to nothing (each one sends its own end event: the views follow)
function clearBrushes() {
  snapshot();
  svg.selectAll(".axis .brush").each(function (d) {
    if (d3.brushSelection(this)) d3.select(this).call(d.brush.move, null);
  });
}

// The plot keeps its original coordinate system (viewBox) and is scaled
// to the card width with CSS; the canvas is positioned in percentages so
// it always stays aligned with the svg axes.
var plot = container.append('div')
    .attr('class', 'scroll-x')
  .append('div')
    .attr('class', 'parcoords-plot');

var svgRoot = plot.append("svg")
    .attr("preserveAspectRatio", "xMinYMin meet");
var svg = svgRoot.append("g");

var canvas = plot.append("canvas");
var ctx = canvas.node().getContext("2d");
// the picture before a change, over the new one, fading out: lines cross-fade
// instead of being repainted in chunks
var prevCanvas = plot.append("canvas").attr("class", "pc-prev").attr("aria-hidden", "true");

// Coordinate system of the plot for the current orientation.
function layout(dims) {
  vertical = phone.matches;
  var m = PC_DESKTOP.m, w = PC_DESKTOP.w, h = PC_DESKTOP.h;
  if (vertical) {
    var W = Math.max(280, container.node().clientWidth);
    m = { top: 34, right: 18, bottom: 30, left: 14 };
    w = W - m.left - m.right;
    h = 78 * (dims.length - 1);          // a row per axis
  }
  var W2 = w + m.left + m.right, H2 = h + m.top + m.bottom;
  plotW = w; plotH = h;
  plot.classed('vertical', vertical).style('aspect-ratio', W2 + ' / ' + H2);
  pcHint.select('svg').style('transform', vertical ? null : 'rotate(90deg)');   // along the axes
  pcHint.select('span').text(vertical
      ? "Slide a finger along any axis to pick a range. Pick on several axes to combine."
      : "Drag along any axis to pick a range. Pick on several axes to combine; click an axis to clear it.");
  svgRoot.attr("viewBox", "0 0 " + W2 + " " + H2);
  svg.attr("transform", "translate(" + m.left + "," + m.top + ")");
  d3.selectAll([canvas.node(), prevCanvas.node()])     // same box for both
    .attr("width", Math.round(w * pixelRatio))
    .attr("height", Math.round(h * pixelRatio))
    .style("left", (100 * m.left / W2) + "%")
    .style("top", (100 * m.top / H2) + "%")
    .style("width", (100 * w / W2) + "%")
    .style("height", (100 * h / H2) + "%");
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

// a point of a line: position of the axis, value along it
function point(i, v) { return vertical ? [v, xscale(i)] : [xscale(i), v]; }

function draw(d) {
  var c = ctx;

  function cmp(d1, d2) {
      return isMissions ? d1["Launch Mission"] == d2["Launch Mission"] : d1["Name"] == d2["Name"];
  }

  var hl = d.highlighted || (info.d && cmp(info.d, d));
  c.strokeStyle = hl ? "#ffffff" : color(d.Country);
  c.lineWidth = hl ? 2.5 : 1.2;
  c.globalAlpha = hl ? 1 : 0.22;
  c.beginPath();
  var coords = dimensions.map(function(p,i) {
                    // check if data element has property and contains a value
                    if (!(p.key in d) || d[p.key] === null) 
                      return null;
                    return point(i, p.scale(d[p.key]));
                  });
  coords.forEach(function(p,i) {
    // this tricky bit avoids rendering null values as 0
    if (p === null) {
      // this bit renders horizontal lines on the previous/next
      // dimensions, so that sandwiched null values are visible
      if (i > 0) {
        var prev = coords[i-1];
        if (prev !== null) {
          c.moveTo(prev[0],prev[1]);
          if (vertical) c.lineTo(prev[0],prev[1]+6); else c.lineTo(prev[0]+6,prev[1]);
        }
      }
      if (i < coords.length-1) {
        var next = coords[i+1];
        if (next !== null) {
          if (vertical) c.moveTo(next[0],next[1]-6); else c.moveTo(next[0]-6,next[1]);
        }
      }
      return;
    }
    
    if (i == 0) {
      c.moveTo(p[0],p[1]);
      return;
    }

    var q = coords[i-1];
    if (q === null) { c.lineTo(p[0],p[1]); return; }
    // a smooth S between two axes: leaves and meets each axis square on,
    // so the bundles read as flows instead of zigzags
    if (vertical) {
      var my = (q[1] + p[1]) / 2;
      c.bezierCurveTo(q[0], my, p[0], my, p[0], p[1]);
    } else {
      var mx = (q[0] + p[0]) / 2;
      c.bezierCurveTo(mx, q[1], mx, p[1], p[0], p[1]);
    }
  });
  c.stroke();
}

var curData;
// One queue for the whole plot: a new full render cancels the one in
// progress (separate queues kept painting old lines over a filtered plot).
var lineQueue = renderQueue(draw).rate(50);

// redraw every line at once (hover, brushing): stops a progressive render first
function renderList(_data) {
  if(_data == null) _data = curData;
  lineQueue.invalidate();
  ctx.clearRect(0,0,plotW,plotH);
  _data.forEach(draw);
  if (fadePending) { fadePending = false; crossFade(); }
}

// ---- smooth changes -----------------------------------------------------------
var FADE_MS = 450, fadePending = false;
function animated() { return !REDUCED_MOTION.matches && !document.hidden; }
// keep what is on screen now; the next renderList fades it into the new lines
function snapshot() {
  if (!animated()) return;
  var p = prevCanvas.node(), c = p.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, p.width, p.height);
  c.drawImage(canvas.node(), 0, 0);
  fadePending = true;
}
function crossFade() {
  var old = prevCanvas.node(), now = canvas.node();
  old.style.transition = now.style.transition = "none";
  old.style.opacity = "0.9";
  now.style.opacity = "0";
  old.getBoundingClientRect();                 // commit the start
  old.style.transition = now.style.transition = "opacity " + FADE_MS + "ms ease";
  old.style.opacity = "0";
  now.style.opacity = "";
}

// data: the rows drawn; domainData: the rows the axes span when they are
// set up the first time (all astronauts, even if a filter is on)
function paracoords_update(data, isMis, domainData, quiet) {
  // other axes (Missions <-> Astronauts): the whole plot fades through;
  // same axes, other rows (filters): the lines cross-fade
  var switching = dimensions && isMis !== isMissions && animated() && !quiet;
  if (switching || (!quiet && plot.classed("pc-out"))) {   // a newer call while fading: it wins
    plot.classed("pc-out", true);
    clearTimeout(paracoords_update.timer);
    paracoords_update.timer = setTimeout(function () {
      paracoords_update(data, isMis, domainData, true);
      plot.classed("pc-out", false);
    }, 180);
    return;
  }
  if (dimensions && !quiet && isMis === isMissions) snapshot();
  curData = data;
  lastFull = data;
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
  layout(dimensions);

  xscale = d3.scalePoint()
      .domain(d3.range(dimensions.length))
      .range([0, vertical ? plotH : plotW]);

  var axes = svg.selectAll(".axis")
      .data(dimensions)
    .enter().append("g")
      .attr("class", function(d) { return "axis " + d.key.replace(/ /g, "_"); })
      .attr("transform", function(d,i) { return vertical ? "translate(0," + xscale(i) + ")" : "translate(" + xscale(i) + ")"; });

  // a soft rail along each axis: it is the thing to drag on
  axes.append("rect")
      .attr("class", "rail")
      .attr("rx", 3)
      .attr("x", vertical ? -3 : -3).attr("y", vertical ? -3 : -3)
      .attr("width", vertical ? plotW + 6 : 6)
      .attr("height", vertical ? 6 : plotH + 6);

  var spanned = domainData || data;
  [data, spanned].forEach(function (rows) {
    rows.forEach(function(d) {
      dimensions.forEach(function(p) {
          d[p.key] = d[p.key] != 0 && !d[p.key] ? null : p.type.coerce(d[p.key]);
      });
    });
  });

  // type/dimension default setting happens here
  dimensions.forEach(function(dim) {
    if (!("domain" in dim)) {
      // detect domain using dimension type's extent function
      var values = spanned.map(function(d) { return d[dim.key]; });
      dim.domain = dim.order ? dim.order(values) : d3_functor(dim.type.extent)(values);
    }
    // use type's default scale for dimension, in the current orientation:
    // bigger values up on the desktop, to the right on phones
    dim.scale = dim.type.defaultScale.copy();
    if (vertical) dim.scale.range(dim.type.key === "String" ? [0, plotW] : [0, plotW]);
    else dim.scale.range(dim.type.key === "String" ? [0, plotH] : [plotH, 0]);
    dim.scale.domain(dim.domain);
  });

  showCount(data.length, data.length);
  renderList(data);           // all at once: it fades in instead of being painted in chunks
  selectionList.update(data, isMissions);
  summaryChart.update(data, isMissions);

  axes.append("g")
      .each(function(d) {
        var axis = (vertical ? d3.axisBottom() : d3.axisLeft()).scale(d.scale);
        if (d.int) axis.tickFormat(intFormat);
        if (vertical && d.type.key !== "String") axis.ticks(5);
        var g = d3.select(this).call(axis);
        // phones: many categories on one row take two staggered lines of labels
        // phones: many categories on one row take two or three staggered lines of labels
        if (vertical && d.type.key === "String" && d.domain.length > 5) {
          var levels = d.domain.length > 10 ? 3 : 2;
          g.selectAll(".tick text").attr("dy", function (v, i) { return (0.71 + 1.2 * (i % levels)) + "em"; });
        }
        // phones: a label close to an end stays inside the card
        if (vertical && d.type.key === "String")
          g.selectAll(".tick text").style("text-anchor", function (v) {
            var x = d.scale(v);
            return x < 34 ? "start" : x > plotW - 34 ? "end" : "middle";
          });
      })
    .append("text")
      .attr("class", "title")
      .attr("text-anchor", vertical ? "start" : "middle")
      .each(function(d) {
        var lines = ("description" in d ? d.description : d.key).split("\n");
        var text = d3.select(this);
        if (vertical) {          // one line above the row
          text.append("tspan").attr("x", 0).text(lines.join(" "));
          return;
        }
        // one or two lines, the last one just above the axis
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
        d3.select(this).call(d.brush = (vertical
            ? d3.brushX().extent([[0, -11], [plotW, 11]])
            : d3.brushY().extent([[-10, 0], [10, plotH]]))
          .on("start", brushstart)
          .on("brush", brush)
          .on("end", function (d) {
            // a range on a category axis that misses every value (dropped
            // between two of them) takes the nearest one instead of nothing
            var sel = d3.event.selection;
            if (d3.event.sourceEvent && sel && d.type.key === "String" &&
                !d.domain.some(function (v) { var x = d.scale(v); return sel[0] <= x && x <= sel[1]; })) {
              var mid = (sel[0] + sel[1]) / 2, half = Math.max(8, d.scale.step() * 0.3);
              var x = d.scale(d.domain.reduce(function (a, b) {
                return Math.abs(d.scale(b) - mid) < Math.abs(d.scale(a) - mid) ? b : a;
              }));
              snapshot();
              d3.select(this).call(d.brush.move, [x - half, x + half]);   // sends its own end event
              return;
            }
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
      .each(function () {
        if (vertical) d3.select(this).attr("y", -11).attr("height", 22);
        else d3.select(this).attr("x", -8).attr("width", 16);
      });

  d3.selectAll(".axis.Country .tick text")
    .style("fill", color);

  addDemo(axes);
    
  function brushstart() {
    // a pointer or a finger (brush.move has no DOM event behind it)
    var e = d3.event.sourceEvent;
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
      stopDemo(true);
    }
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
    axes.classed("filtered", function (d) { return actives.some(function (a) { return a.dimension === d; }); });
    showCount(selected.length, data.length);
    scheduleBrushRender(selected);
    return selected;
  }
}

// brushing fires on every pointer move: the lines and the list follow once per frame
var brushFrame = null;
function scheduleBrushRender(rows) {
  if (brushFrame) cancelAnimationFrame(brushFrame);
  brushFrame = requestAnimationFrame(function () {
    brushFrame = null;
    renderList(rows);
    selectionList.update(rows, isMissions);
  });
}

// A finger (a dot) draws a range on one axis, twice, the first
// time the plot comes into view; never again once somebody has brushed.
// It is only a picture: nothing is filtered.
var demoSeen = false, demoObserver = null;
try { demoSeen = localStorage.getItem("pcBrushed") === "1"; } catch (e) {}

function stopDemo(used) {
  svg.selectAll(".pc-demo").remove();
  if (used && !demoSeen) {
    demoSeen = true;
    try { localStorage.setItem("pcBrushed", "1"); } catch (e) {}
  }
}

function addDemo(axes) {
  if (demoSeen || REDUCED_MOTION.matches) return;
  // a numeric axis in the middle: launch year / year selected
  var target = axes.filter(function (d) { return d.key === "Year"; });
  if (target.empty()) return;
  var a = 0.28, b = 0.7, demo = target.append("g").attr("class", "pc-demo " + (vertical ? "h" : "v"));
  if (vertical) {
    demo.attr("transform", "translate(" + (plotW * a) + ",0)").style("--run", (plotW * (b - a)) + "px");
    demo.append("rect").attr("class", "pc-demo-sel").attr("x", 0).attr("y", -9).attr("width", plotW * (b - a)).attr("height", 18).attr("rx", 4);
  } else {
    demo.attr("transform", "translate(0," + (plotH * b) + ")").style("--run", (-plotH * (b - a)) + "px");
    demo.append("rect").attr("class", "pc-demo-sel").attr("x", -8).attr("y", -plotH * (b - a)).attr("width", 16).attr("height", plotH * (b - a)).attr("rx", 4);
  }
  demo.append("circle").attr("class", "pc-demo-dot").attr("r", 9);
  if (demoObserver) demoObserver.disconnect();
  if (!window.IntersectionObserver) { demo.classed("play", true); return; }
  demoObserver = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    demoObserver.disconnect();
    setTimeout(function () { demo.classed("play", true); }, 500);
    demo.select(".pc-demo-sel").on("animationend", function () { stopDemo(false); });
  }, { threshold: 1 });
  demoObserver.observe(demo.node());
}

function d3_functor(v) {
  return typeof v === "function" ? v : function() { return v; };
};

// turning the phone or crossing the breakpoint: draw again in the right orientation
(function () {
  var timer = null, lastW = 0;
  function redraw() {
    if (!lastFull) return;
    var w = container.node().clientWidth;
    if (phone.matches === vertical && (!vertical || Math.abs(w - lastW) < 8)) return;
    lastW = w;
    // brushes do not survive the new axes: the bars go back to the same rows
    paracoords_update(lastFull, isMissions, null, true);
    flightsChart.update(isMissions ? group_missions(lastFull) : group_astronauts(astronauts, curMis), isMissions);
  }
  window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(redraw, 200); });
})();
