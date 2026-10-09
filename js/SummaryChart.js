class SummaryChart{
	// Share of missions / astronauts per country: one rounded bar split into
	// segments, with a legend that carries the numbers.
	constructor(color){
		this.color = color;
	}

	update(data, isMissions){
		var all = isMissions ? data : data.concat(notFound);
		var len = all.length;
		var counts = d3.nest().key(d => d.Country).rollup(v => v.length).object(all);
		var rows = Countries.map(c => ({ key: c, n: counts[c] || 0 }));
		var color = this.color;

		d3.select('#sumTitle').html(
			"<b>" + len + "</b> " + (isMissions ? (len === 1 ? "mission" : "missions")
			                                     : (len === 1 ? "astronaut" : "astronauts")));

		var segs = d3.select("#SummaryBar").selectAll(".seg").data(rows, d => d.key);
		segs.enter().append("div")
			.attr("class", "seg")
			.style("background", d => color(d.key))
			.merge(segs)
			.attr("title", d => d.key + ": " + d.n)
			.style("flex-grow", d => d.n)
			.classed("empty", d => d.n === 0);

		var items = d3.select("#SummaryLegend").selectAll(".sum-item").data(rows, d => d.key);
		var enter = items.enter().append("div").attr("class", "sum-item");
		enter.append("i").style("background", d => color(d.key));
		enter.append("span").attr("class", "sum-name").text(d => d.key);
		enter.append("b");
		enter.append("span").attr("class", "sum-pct");
		items = enter.merge(items);
		items.classed("empty", d => d.n === 0);
		items.select("b").text(d => d.n);
		items.select(".sum-pct").text(d => len ? Math.round(100 * d.n / len) + "%" : "");
	}
}
