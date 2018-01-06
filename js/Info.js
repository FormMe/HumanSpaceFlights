class Info{

	update(data, isMission){
		console.log(data);
		if(isMission){
			data = {
				caption: data["Launch Mission"],
				table: [["Country", data["Country Flag"] + "  " + data.Country],
						["Launch date", data["Launch Data"]],
						["Return date", data["Return Data"] == "" ? "in orbit" : data["Return Data"]],
						["Mission duration", data["Return Data"] == "" ? "in orbit" :  parseInt(data["Duration"]) + " days"],
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
			var t = [["Country", data["Country Flag"] + "  " + data.Country],
					["Gender", data["Gender"]],
					["Birth Date", data["Birth Date"]],
					["Birth Place", data["Birth Place"]]];

			if(data["Death Date"] != "")
				t.push(["Death Date", data["Death Date"]]);		
			if(data["Death Mission"] != "")
				t.push(["Death Mission", data["Death Mission"]]);	
			if(data["Alma Mater"] != "")
				t.push(["Alma Mater", data["Alma Mater"]]);

			t = t.concat([["Selection Year", parseInt(data["Year"])],
							["Status", data["Status"]],
							["Space Flights", parseInt(data["Space Flights"]) + " ("+parseInt(data["Space Flight (hr)"])+" hr)"],
							["Space Walks", parseInt(data["Space Walks"]) + " ("+parseInt(data["Space Walks (hr)"])+" hr)"],
							["Missions",data["Missions"].map(function (m) {
								return m + "<br/>";
							}).join("")]]);

			if(data["Military Branch"] != "")
				t.push(["Military Branch", data["Military Branch"]]);		

			if(data["Military Rank"] != "")
				t.push(["Military Rank", data["Military Rank"]]);

			data = {
				caption: data["Name"],
				table: t
			}
		}
		this.draw(data);
	}

	draw(data){
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
	    	 	return i % 2 == 0 ? "30%" : "70%";
	    	 })
	    	 .classed("header", function (d, i) {
	    	 	return i % 2 == 0;
	    	 })
	    	 .html(function (d) { return d; });
	}

	remove(){
		this.draw({caption:"", table:[]});
	    d3.select('#Info').select("table")
	    	.select("caption")
	    	.classed("infoTitle", false);
	}
}