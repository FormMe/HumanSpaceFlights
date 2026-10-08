#!/usr/bin/env python3
"""Download raw human-spaceflight data from Wikidata and English Wikipedia.

Stage 1 of the data pipeline (needs internet access):

    python scripts/fetch_data.py          # writes data/raw/*.json
    python scripts/build_data.py          # turns data/raw/*.json into the app CSVs

What is downloaded:
  * Wikidata: every person with an "astronaut mission" (P450) and every
    mission with a "crew member" (P1029), plus details of both
    (launch/landing dates, birth/death, citizenship, time in space, ...).
  * Wikipedia: the infobox of every astronaut article (EVA count, EVA time,
    selection, status, ...) and the intro of every mission article
    (used as a short mission summary).

The raw snapshot is committed to the repository, so the build step can be
re-run and debugged offline.
"""

import json
import os
import re
import sys
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw")

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
HEADERS = {
    "User-Agent": "HumanSpaceFlightsBot/1.0 "
                  "(https://github.com/FormMe/HumanSpaceFlights; data visualization project)",
}

session = requests.Session()
session.headers.update(HEADERS)


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def request(method, url, retries=5, **kwargs):
    for attempt in range(retries):
        try:
            resp = session.request(method, url, timeout=120, **kwargs)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError("HTTP %s" % resp.status_code)
            resp.raise_for_status()
            return resp
        except (requests.RequestException, ValueError) as err:
            wait = 2 ** (attempt + 1)
            log("  request failed (%s), retry in %ss" % (err, wait))
            time.sleep(wait)
    raise RuntimeError("giving up on %s" % url)


# --------------------------------------------------------------------------
# Wikidata
# --------------------------------------------------------------------------

def sparql(query):
    resp = request("POST", WIKIDATA_SPARQL, data={"query": query, "format": "json"},
                   headers={"Accept": "application/sparql-results+json"})
    rows = []
    for b in resp.json()["results"]["bindings"]:
        rows.append({k: v["value"] for k, v in b.items()})
    return rows


def qid(uri):
    return uri.rsplit("/", 1)[-1]


def chunks(items, size):
    items = list(items)
    for i in range(0, len(items), size):
        yield items[i:i + size]


def fetch_links():
    """Person <-> mission links from both directions (P450 and P1029)."""
    log("Wikidata: person -> mission (P450)")
    a = sparql("""
        SELECT DISTINCT ?person ?mission WHERE {
          ?person wdt:P450 ?mission ; wdt:P31 wd:Q5 .
        }""")
    log("Wikidata: mission -> crew (P1029)")
    b = sparql("""
        SELECT DISTINCT ?person ?mission WHERE {
          ?mission wdt:P1029 ?person . ?person wdt:P31 wd:Q5 .
        }""")
    links = set()
    for row in a + b:
        links.add((qid(row["person"]), qid(row["mission"])))
    log("  %d links" % len(links))
    return sorted(links)


MISSION_FIELDS = {
    "label": '?item rdfs:label ?value FILTER(LANG(?value) = "en")',
    "description": '?item schema:description ?value FILTER(LANG(?value) = "en")',
    "article": '?value schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/>',
    "launch": "?item wdt:P619 ?value",
    "landing": "?item wdt:P620 ?value",
    "instance": "?item wdt:P31 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "operator": "?item wdt:P137 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "country": "?item wdt:P17 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "vehicle": "?item wdt:P375 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "part_of": "?item wdt:P361 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "destination": "?item wdt:P1444 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "follows": "?item wdt:P155 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
}

PEOPLE_FIELDS = {
    "label": '?item rdfs:label ?value FILTER(LANG(?value) = "en")',
    "alt_labels": '?item skos:altLabel ?value FILTER(LANG(?value) = "en")',
    "description": '?item schema:description ?value FILTER(LANG(?value) = "en")',
    "article": '?value schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/>',
    "birth": "?item wdt:P569 ?value",
    "death": "?item wdt:P570 ?value",
    "gender": "?item wdt:P21 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "birth_place": "?item wdt:P19 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "citizenship": "?item wdt:P27 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "citizenship_code": "?item wdt:P27/wdt:P297 ?value",
    "time_in_space_s": "?item p:P2873/psn:P2873/wikibase:quantityAmount ?value",
    "educated_at": "?item wdt:P69 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "military_rank": "?item wdt:P410 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
    "military_branch": "?item wdt:P241 ?v . ?v rdfs:label ?value FILTER(LANG(?value) = \"en\")",
}


def fetch_details(ids, fields, what, batch_size=200):
    """One small query per property: avoids cartesian blow-up of OPTIONALs."""
    log("Wikidata: details of %d %s" % (len(ids), what))
    result = {i: {} for i in ids}
    for batch in chunks(sorted(ids), batch_size):
        values = " ".join("wd:" + q for q in batch)
        for field, pattern in fields.items():
            rows = sparql("SELECT DISTINCT ?item ?value WHERE { VALUES ?item { %s } %s }"
                          % (values, pattern))
            for row in rows:
                result[qid(row["item"])].setdefault(field, set()).add(row["value"])
            time.sleep(0.3)
    for item in result.values():
        for field in item:
            item[field] = sorted(item[field])
    return result


def fetch_missions(ids):
    return fetch_details(ids, MISSION_FIELDS, "missions")


def fetch_people(ids):
    return fetch_details(ids, PEOPLE_FIELDS, "people")


# --------------------------------------------------------------------------
# Wikipedia
# --------------------------------------------------------------------------

def article_title(url):
    if not url:
        return None
    return requests.utils.unquote(url.rsplit("/wiki/", 1)[-1]).replace("_", " ")


def extract_infobox(wikitext):
    """Return the text of the first {{Infobox ...}} template (balanced braces)."""
    m = re.search(r"\{\{\s*Infobox", wikitext, re.I)
    if not m:
        return None
    depth, i = 0, m.start()
    while i < len(wikitext) - 1:
        pair = wikitext[i:i + 2]
        if pair == "{{":
            depth += 1
            i += 2
            continue
        if pair == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return wikitext[m.start():i]
            continue
        i += 1
    return wikitext[m.start():]


def fetch_infoboxes(titles):
    log("Wikipedia: infoboxes of %d articles" % len(titles))
    result = {}
    for batch in chunks(sorted(titles), 50):
        resp = request("GET", WIKIPEDIA_API, params={
            "action": "query", "format": "json", "formatversion": 2,
            "prop": "revisions", "rvprop": "content", "rvslots": "main",
            "redirects": 1, "titles": "|".join(batch),
        })
        data = resp.json()["query"]
        alias = {}
        for kind in ("normalized", "redirects"):
            for r in data.get(kind, []):
                alias[r["to"]] = r["from"]
        for page in data.get("pages", []):
            revs = page.get("revisions")
            if not revs:
                continue
            text = revs[0]["slots"]["main"]["content"]
            title = page["title"]
            original = title
            while original in alias:
                original = alias[original]
            result[original] = extract_infobox(text)
        time.sleep(1)
    return result


def fetch_extracts(titles):
    log("Wikipedia: intros of %d articles" % len(titles))
    result = {}
    for batch in chunks(sorted(titles), 20):
        resp = request("GET", WIKIPEDIA_API, params={
            "action": "query", "format": "json", "formatversion": 2,
            "prop": "extracts", "exintro": 1, "explaintext": 1, "exsentences": 3,
            "exlimit": "max", "redirects": 1, "titles": "|".join(batch),
        })
        data = resp.json()["query"]
        alias = {}
        for kind in ("normalized", "redirects"):
            for r in data.get(kind, []):
                alias[r["to"]] = r["from"]
        for page in data.get("pages", []):
            title = page["title"]
            while title in alias:
                title = alias[title]
            if page.get("extract"):
                result[title] = page["extract"]
        time.sleep(1)
    return result


def save(name, obj):
    path = os.path.join(RAW_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
    log("saved %s" % os.path.relpath(path, ROOT))


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    links = fetch_links()
    people = fetch_people({p for p, _ in links})
    missions = fetch_missions({m for _, m in links})

    # Keep only real flights (with a launch date); drops ISS expeditions etc.
    flights = {k: v for k, v in missions.items() if v.get("launch")}
    links = [(p, m) for p, m in links if m in flights]
    flyers = {p for p, _ in links}
    people = {k: v for k, v in people.items() if k in flyers}

    infoboxes = fetch_infoboxes(
        {article_title(p["article"][0]) for p in people.values() if p.get("article")})
    extracts = fetch_extracts(
        {article_title(m["article"][0]) for m in flights.values() if m.get("article")})

    save("wikidata_links.json", [list(l) for l in links])
    save("wikidata_people.json", people)
    save("wikidata_missions.json", flights)
    save("wikipedia_infoboxes.json", infoboxes)
    save("wikipedia_extracts.json", extracts)
    save("meta.json", {"fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                       "people": len(people), "missions": len(flights), "links": len(links)})


if __name__ == "__main__":
    main()
