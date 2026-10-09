class Info{

	update(data, isMission){
		this.remove()
		this.d = data;
		var rows = [];
		function add(label, value) {
			if (value !== undefined && value !== null && String(value).trim() !== "" && value !== "NaN")
				rows.push([label, value]);
		}
		function list(items) {
			return items.map(m => "<span class='info-chip'>" + m + "</span>").join("");
		}

		if(isMission){
			var inOrbit = data["Return Data"] == "";
			add("Country", data["Country Flag"] + "  " + data.Country);
			add("Launch date", data["Launch Data"]);
			add("Return date", inOrbit ? "in orbit" : data["Return Data"]);
			add("Duration", inOrbit ? "in orbit" : parseInt(data["Duration"]) + " days");
			add("Where", data["Habitation"]);
			add("Rocket", data["Rocket"]);
			add("Spacecraft", data["Spacecraft"]);
			add("Launch site", data["Launch Site"]);
			add("Landing site", data["Landing Site"]);
			add("Callsign", data["Callsign"]);
			add("Operator", data["Operator"]);
			add("Crew (" + data["Crew size"] + ")", list(data["Members"]));
			this.draw({
				caption: data["Launch Mission"],
				sub: data.Year + " · " + data.Country,
				lead: data["Description"] || data["Brief Mission Summary"],
				table: rows
			});
			this.media("m:" + data["Launch Mission"], data["Photo URL"], "p:" + data["Launch Mission"], !!data["Patch URL"]);
			this.links(data["Wikipedia"], [
				["Photo", data["Photo Credit"], data["Photo Page"], data["Photo URL"]],
				["Patch", data["Patch Credit"], data["Patch Page"], data["Patch URL"]]]);
		}
		else{
			add("Country", (data["Country Flag"] || "") + "  " + (data.Nationality || data.Country));
			add("Gender", data["Gender"]);
			add("Born", data["Birth Date"] + (data["Birth Place"] ? "<small>" + data["Birth Place"] + "</small>" : ""));
			if (data["Death Date"]) add("Died", data["Death Date"]);
			add("Death mission", data["Death Mission"]);
			add("Selected", data["Year"] ? parseInt(data["Year"]) : "");
			add("Status", data["Status"]);
			add("Space flights", parseInt(data["Space Flights"]) + " · " +
				d3.format(",")(Math.round((+data["Space Flight (hr)"] || 0) / 24)) + " days in space");
			add("Spacewalks", +data["Space Walks"] ? parseInt(data["Space Walks"]) + " · " + Math.round(+data["Space Walks (hr)"] || 0) + " hours" : "none");
			add("Missions", list(data["Missions"]));
			add("Education", data["Alma Mater"]);
			add("Military", [data["Military Rank"], data["Military Branch"]].filter(Boolean).join(", "));
			this.draw({
				caption: data["Name"],
				sub: data["Agency"] || (data.Nationality || data.Country),
				lead: data["Bio"],
				table: rows
			});
			this.media("a:" + data["Name"], data["Photo URL"], null, false, true);
			this.links(data["Wikipedia"], [["Photo", data["Photo Credit"], data["Photo Page"], data["Photo URL"]]]);
		}
	}

	// photo (and mission patch): small packed copy at once, sharp original if allowed
	media(photoKey, photoUrl, patchKey, hasPatch, portrait) {
		var box = document.getElementById("InfoMedia");
		var photo = document.getElementById("InfoPhoto");
		var patch = document.getElementById("InfoPatch");
		box.classList.toggle("portrait", !!portrait);
		box.hidden = !photoUrl && !hasPatch;
		box.classList.toggle("no-photo", !photoUrl);
		if (photoUrl) Photos.show(photo, photoKey, photoUrl); else { photo.hidden = true; photo.dataset.key = ""; }
		if (hasPatch) Photos.show(patch, patchKey, null); else { patch.hidden = true; patch.dataset.key = ""; }
	}

	links(wiki, credits) {
		var el = document.getElementById("InfoLinks");
		var html = "";
		if (wiki) html += "<a class='info-wiki' href='" + wiki + "' target='_blank' rel='noopener'>" +
			"<svg width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round'><path d='M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M9 2h5v5M14 2L7.5 8.5'/></svg>" +
			"Read on Wikipedia</a>";
		var lines = credits.filter(c => c[3]).map(c =>
			"<span>" + c[0] + ": " + (c[2] ? "<a href='" + c[2] + "' target='_blank' rel='noopener'>" + (c[1] || "Wikimedia Commons") + "</a>"
			                              : (c[1] || "Wikimedia Commons")) + "</span>");
		if (lines.length) html += "<p class='info-credits'>" + lines.join("") + "</p>";
		el.innerHTML = html;
		el.hidden = !html;
	}

	draw(data){
		var table = d3.select('#Info').select("table").attr("id", "Table");
	    var tbody = table.select("tbody");

	    table.select("caption")
	    	.html(data.caption ? "<span class='info-name'>" + data.caption + "</span>" +
	    	      (data.sub ? "<span class='info-sub'>" + data.sub + "</span>" : "") +
	    	      (data.lead ? "<p class='info-lead'>" + data.lead + "</p>" : "") : "")
	    	.classed("infoTitle", !!data.caption);

		var new_rows = tbody.selectAll('tr.row').data(data.table);
	    new_rows.exit().remove();
	    new_rows = new_rows.enter().append("tr").attr("class", "row").merge(new_rows);

	    var n_cells = new_rows.selectAll('td').data(d => d);
	    n_cells.exit().remove();
	    n_cells.enter().append('td');

	    tbody.selectAll('td')
	    	 .classed("header", (d, i) => i % 2 == 0)
	    	 .html(d => d);
	}

	remove(){
		if (this.d) this.d.highlighted = false;
		this.draw({caption:"", table:[]});
		var media = document.getElementById("InfoMedia");
		if (media) {
			media.hidden = true;
			document.getElementById("InfoPhoto").dataset.key = "";
			document.getElementById("InfoPatch").dataset.key = "";
			document.getElementById("InfoLinks").hidden = true;
		}
	}
}
