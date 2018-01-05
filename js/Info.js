class Info{

	update(data, isMission){
		if(isMission){
			data = {
				caption: data["Launch Mission"],
				table: [["Country", data["Country Flag"] + "  " + data.Country],
						["Launch date", data["Launch Data"]],
						["Return date", data["Return Data"]],
						["Mission duration", parseInt(data["Duration"]) + " days"],
						["Habitation", data["Habitation"]],
						["Crew size",  data["Crew size"]],
						["Members", data["Members"].map(function (m) {
							return m + "<br/>";
						}).join("")],						
						["Summary", data["Brief Mission Summary"]],
				]
			}
		}
		else{
			data = {
				caption: data["Name"],
				table: [["ssds"]]
			}
		}

		var table = d3.select('#Info').select("table")
						.attr("id", "Table")
						.attr("width", '350px');
	    var tbody = table.select("tbody");

	    table.select("caption").html(data.caption)
	    	 .classed("infoTitle", true);

		var new_rows = tbody.selectAll('tr.row').data(data.table);
	    new_rows
	        .exit()
	        .remove();
	    new_rows = new_rows
	        .enter()
	        .append("tr").attr("class", "row").merge(new_rows);

	    var n_cells = new_rows
	        .selectAll('td')
	        .data(function (d) {
	        	return d;
	        });

	    n_cells.exit()
	        .remove();
	    n_cells = n_cells
	        .enter()
	        .append('td');

	    tbody.selectAll('td')
	    	 .attr('width', function (d, i) {
	    	 	return i % 2 == 0 ? "25%" : "75%";
	    	 })
	    	 .html(function (d) { return d; });
	}

	remove(){
		var table = d3.select('#Info').select("table");
		table.select("tbody")
			 .selectAll('td')
			 .html('');
	    table.select("caption").html("")
	    	 .classed("infoTitle", false);
	}
}