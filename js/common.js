// Shared by every view: the countries and their colours, the phone
// breakpoint, the data mode, and small helpers. Loaded right after d3.

var Countries = ["USSR/Russia", "USA", "China", "Other"];
var color = d3.scaleOrdinal()
    .range(["#e5578b", "#3987e5", "#c98500", "#8a92a6"])
    .domain(Countries);

// the same breakpoint as in css/style.css
var PHONE = window.matchMedia("(max-width: 760px)");
var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

// "Missions" or "Astronauts": the select #DataType is the single source
function isMissionMode() {
    var select = document.getElementById("DataType");
    return !select || select.value === "Missions";
}

// text from Wikipedia / Wikidata going into HTML
function esc(s) {
    return String(s === undefined || s === null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// only http(s) links from the data end up in href
function safeUrl(url) {
    return /^https?:\/\//i.test(String(url || "")) ? esc(url) : "";
}

// days in space of a mission; for a crew still in orbit, the days so far
function missionDays(d) {
    if (d["Return Data"]) return +d.Duration || 0;
    return (Date.now() - new Date(d["Launch Data"])) / 864e5;
}

// how long a mission flew, worded the same in the tooltip, the list and the card:
// hours and minutes for short flights ("9 h 13 min"), days otherwise
function durationText(d) {
    if (!d["Return Data"]) return "in orbit";
    var days = missionDays(d);
    if (days < 2 && d["Flight Time"]) return d["Flight Time"];
    if (days < 1) return "<1 day";
    var n = Math.round(days);
    return d3.format(",")(n) + (n == 1 ? " day" : " days");
}

// images are loaded only from Wikimedia (the data could carry any URL)
function wikimediaUrl(url) {
    return /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(String(url || "")) ? url : "";
}
