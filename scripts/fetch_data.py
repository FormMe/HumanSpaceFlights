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


def retry_after(resp, wait):
    """The server says how long to back off (seconds; capped at 2 minutes)."""
    try:
        return max(wait, min(int(resp.headers.get("Retry-After", 0)), 120))
    except (TypeError, ValueError):
        return wait


def request(method, url, retries=5, **kwargs):
    """HTTP request, retried on 429, 5xx and network errors only: any other
    4xx is a mistake in the request, a retry would only fail again."""
    for attempt in range(retries):
        wait = 2 ** (attempt + 1)
        try:
            resp = session.request(method, url, timeout=(10, 60), **kwargs)
        except (requests.ConnectionError, requests.Timeout) as err:
            log("  request failed (%s), retry in %ss" % (err, wait))
            time.sleep(wait)
            continue
        if resp.status_code == 429 or resp.status_code >= 500:
            wait = retry_after(resp, wait)
            log("  HTTP %s, retry in %ss" % (resp.status_code, wait))
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    raise RuntimeError("giving up on %s" % url)


class ApiError(RuntimeError):
    def __init__(self, code, info):
        super().__init__("API error %s: %s" % (code, info))
        self.code = code


def mw_api(url, params, retries=5):
    """One MediaWiki API call (Wikipedia or Wikidata). maxlag=5 makes the
    servers refuse work while they are lagging; that is waited out. Any other
    API error raises: a silently empty answer would drop data."""
    params = dict(params, format="json", maxlag=5)
    for attempt in range(retries):
        resp = request("GET", url, params=params)
        data = resp.json()
        error = data.get("error")
        if not error:
            return data
        if error.get("code") != "maxlag":
            raise ApiError(error.get("code"), error.get("info"))
        wait = retry_after(resp, 5 * (attempt + 1))
        log("  servers lagging, retry in %ss" % wait)
        time.sleep(wait)
    raise RuntimeError("giving up on %s (maxlag)" % url)


def mw_query(params, url=None):
    """action=query, following "continue" until the answer is complete; the
    pieces are merged (pages by title, normalized/redirects lists added up)."""
    params = dict(params, action="query", formatversion=2)
    merged, pages = {}, {}
    while True:
        data = mw_api(url or WIKIPEDIA_API, params)
        query = data.get("query", {})
        for key, value in query.items():
            if key == "pages":
                for page in value:
                    old = pages.setdefault(page["title"], {})
                    for k, v in page.items():
                        if isinstance(v, list) and isinstance(old.get(k), list):
                            old[k] = old[k] + [x for x in v if x not in old[k]]
                        elif k not in old or not old[k]:
                            old[k] = v
            elif isinstance(value, list):
                merged.setdefault(key, []).extend(value)
            else:
                merged[key] = value
        if "continue" not in data:
            break
        params = dict(params, **data["continue"])
    merged["pages"] = list(pages.values())
    return merged


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
    for n, i in enumerate(range(0, len(items), size)):
        if n and n % 10 == 0:
            log("    %d/%d" % (i, len(items)))       # progress in the CI log
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


HUMAN_SPACEFLIGHT = "Q752783"      # class "human spaceflight" (alias "crewed spaceflight")


def fetch_recent_flights(since="2017-01-01"):
    """Crewed flights found by class, so missions without crew links are not missed.

    The class is matched by its QID; the old match by English label stays as
    a fallback ('mul' too: Wikidata drops English labels equal to 'mul')."""
    log("Wikidata: human spaceflights since %s" % since)
    rows = sparql("""
        SELECT DISTINCT ?mission WHERE {
          { VALUES ?c { wd:%s } }
          UNION
          { VALUES ?cls { "human spaceflight"@en "crewed spaceflight"@en
                          "human spaceflight"@mul "crewed spaceflight"@mul }
            ?c rdfs:label ?cls . }
          ?mission wdt:P31 ?c ; wdt:P619 ?launch .
          FILTER(?launch >= "%sT00:00:00Z"^^xsd:dateTime)
        }""" % (HUMAN_SPACEFLIGHT, since))
    found = {qid(r["mission"]) for r in rows}
    log("  %d flights" % len(found))
    return found


# Fields read for missions and people (see API_PROPS for the properties).
MISSION_FIELDS = ["label", "description", "article", "launch", "landing", "instance",
                  "operator", "country", "vehicle", "part_of", "destination", "follows",
                  "commons_image", "commons_logo"]   # commons_*: free files on Wikimedia Commons
PEOPLE_FIELDS = ["label", "alt_labels", "description", "article", "birth", "death", "gender",
                 "birth_place", "citizenship", "citizenship_code", "time_in_space_s",
                 "educated_at", "military_rank", "military_branch", "commons_image"]


WIKIDATA_API = "https://www.wikidata.org/w/api.php"
DIAGNOSTICS = {}

# property -> (field, kind) used by the wbgetentities fallback
API_PROPS = {
    "P569": ("birth", "time"), "P570": ("death", "time"),
    "P619": ("launch", "time"), "P620": ("landing", "time"),
    "P21": ("gender", "item"), "P19": ("birth_place", "item"),
    "P27": ("citizenship", "item"), "P69": ("educated_at", "item"),
    "P410": ("military_rank", "item"), "P241": ("military_branch", "item"),
    "P31": ("instance", "item"), "P137": ("operator", "item"), "P17": ("country", "item"),
    "P375": ("vehicle", "item"), "P361": ("part_of", "item"),
    "P1444": ("destination", "item"), "P155": ("follows", "item"),
    "P2873": ("time_in_space_s", "quantity"),
    "P18": ("commons_image", "file"), "P154": ("commons_logo", "file"),
}
SECONDS = {"Q11574": 1, "Q7727": 60, "Q25235": 3600, "Q573": 86400, "Q577": 31557600}


def wbgetentities(ids, props):
    """Raises on an API error (an empty answer would silently drop 50 items),
    except for a deleted item: that one is skipped and noted in diagnostics."""
    def get(batch):
        try:
            data = mw_api(WIKIDATA_API, {
                "action": "wbgetentities", "ids": "|".join(batch),
                "props": props, "languages": "en|mul", "sitefilter": "enwiki",
            })
        except ApiError as err:
            if err.code != "no-such-entity":
                raise
            if len(batch) == 1:
                DIAGNOSTICS.setdefault("wikidata_deleted_items", []).append(batch[0])
                return {}
            out = {}
            for q in batch:          # find the deleted one
                out.update(get([q]))
            return out
        return data.get("entities", {})

    out = {}
    for batch in chunks(sorted(ids), 50):
        out.update(get(batch))
        time.sleep(0.5)
    return out


def fetch_details_api(ids, fields):
    """Details of Wikidata items: {qid: {field: [values]}}, read with the API.

    The query service sometimes misses items (its index lags behind or drops
    entities); the API reads the live item, and follows redirects itself.
    Item values are the labels of the items (en, else mul); dates keep their
    precision after a slash: '1977-01-01T00:00:00Z/9' (9 year, 10 month, 11 day).
    """
    if not ids:
        return {}
    log("  Wikidata API: %d items" % len(ids))
    entities = wbgetentities(ids, "labels|aliases|descriptions|claims|sitelinks")
    refs, raw = set(), {}
    for q in ids:
        e = entities.get(q, {})
        if "redirects" in e:
            e = entities.get(e["redirects"]["to"], e)
        item = {}
        labels = e.get("labels", {})
        label = (labels.get("en") or labels.get("mul") or {}).get("value")
        if label:
            item["label"] = [label]
        aliases = [a["value"] for lang in ("en", "mul") for a in e.get("aliases", {}).get(lang, [])]
        if aliases and "alt_labels" in fields:
            item["alt_labels"] = sorted(aliases)
        desc = e.get("descriptions", {}).get("en", {}).get("value")
        if desc:
            item["description"] = [desc]
        title = e.get("sitelinks", {}).get("enwiki", {}).get("title")
        if title:
            item["article"] = ["https://en.wikipedia.org/wiki/" + requests.utils.quote(title.replace(" ", "_"), safe="()/,:'!$*;@~")]
        for prop, (field, kind) in API_PROPS.items():
            if field not in fields:
                continue
            claims = [c for c in e.get("claims", {}).get(prop, []) if c.get("rank") != "deprecated"]
            if any(c.get("rank") == "preferred" for c in claims):   # like wdt: in SPARQL
                claims = [c for c in claims if c.get("rank") == "preferred"]
            for claim in claims:
                v = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
                if v is None:
                    continue
                if kind == "time":
                    # '+1977-00-00T00:00:00Z' (year precision) -> '1977-01-01T00:00:00Z/9': the
                    # build must know that '2027-01-01' of a planned flight is no real date
                    t = re.sub(r"^(\d{4})-00-00", r"\1-01-01", v["time"].lstrip("+"))
                    t = re.sub(r"^(\d{4}-\d\d)-00", r"\1-01", t)
                    item.setdefault(field, []).append("%s/%s" % (t, v.get("precision", 11)))
                elif kind == "item":
                    refs.add(v["id"])
                    item.setdefault("_" + field, []).append(v["id"])
                elif kind == "file":          # Commons file name
                    item.setdefault(field, []).append(v)
                elif kind == "quantity":
                    unit = v.get("unit", "").rsplit("/", 1)[-1]
                    if unit in SECONDS:
                        item.setdefault(field, []).append(str(float(v["amount"]) * SECONDS[unit]))
        raw[q] = item
        if not item.get("label"):
            DIAGNOSTICS.setdefault("wikidata_api_empty", {})[q] = json.dumps(e)[:400]
    ref_entities = wbgetentities(refs, "labels|claims") if refs else {}

    def ref_label(r):
        labels = ref_entities.get(r, {}).get("labels", {})
        return (labels.get("en") or labels.get("mul") or {}).get("value")

    result = {}
    for q, item in raw.items():
        for key in [k for k in item if k.startswith("_")]:
            field = key[1:]
            item[field] = sorted({ref_label(r) for r in item[key] if ref_label(r)})
            if field == "citizenship" and "citizenship_code" in fields:
                codes = set()
                for r in item[key]:
                    for c in ref_entities.get(r, {}).get("claims", {}).get("P297", []):
                        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
                        if v:
                            codes.add(v)
                item["citizenship_code"] = sorted(codes)
            del item[key]
        result[q] = {k: sorted(set(v)) for k, v in item.items() if v}
    return result


# Details are read from the Wikidata API (wbgetentities): the query service is
# often overloaded (429, 502, 60 s timeouts) and a weekly run then fails,
# while the API serves 50 items per request reliably.
def fetch_missions(ids):
    log("Wikidata: details of %d missions" % len(ids))
    return fetch_details_api(ids, MISSION_FIELDS)


def fetch_people(ids):
    log("Wikidata: details of %d people" % len(ids))
    return fetch_details_api(ids, PEOPLE_FIELDS)


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
        data = mw_query({
            "prop": "revisions", "rvprop": "content", "rvslots": "main",
            "redirects": 1, "titles": "|".join(batch),
        })
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


CREW_FIELDS = ("crew_members", "crew_launching", "crew_landing", "launching", "landing", "crew")


def crew_link_titles(infobox):
    """Titles of the people linked in the crew fields of a spaceflight infobox."""
    titles = set()
    if not infobox:
        return titles
    try:
        import mwparserfromhell
        tpl = mwparserfromhell.parse(infobox).filter_templates(recursive=False)[0]
        values = [str(p.value) for p in tpl.params
                  if str(p.name).strip().lower() in CREW_FIELDS]
    except (ImportError, IndexError):
        values = [infobox]
    for value in values:
        for link in re.findall(r"\[\[([^\]|#]+)", value):
            titles.add(link.strip())
    return titles


def infobox_link_titles(infobox, fields):
    try:
        import mwparserfromhell
        tpl = mwparserfromhell.parse(infobox or "").filter_templates(recursive=False)[0]
        values = [str(p.value) for p in tpl.params if str(p.name).strip().lower() in fields]
    except (ImportError, IndexError):
        return set()
    titles = set()
    for value in values:
        for link in re.findall(r"\[\[([^\]|#]+)", value):
            if not re.match(r"(file|image|category):", link, re.I):
                titles.add(link.strip())
    return titles


def fetch_wikidata_ids(titles):
    """Wikipedia article title -> Wikidata QID (follows redirects)."""
    log("Wikipedia: Wikidata ids of %d articles" % len(titles))
    result = {}
    for batch in chunks(sorted(titles), 50):
        data = mw_query({
            "prop": "pageprops", "ppprop": "wikibase_item|disambiguation",
            "redirects": 1, "titles": "|".join(batch),
        })
        alias = {}
        for kind in ("normalized", "redirects"):
            for r in data.get(kind, []):
                alias.setdefault(r["to"], []).append(r["from"])
        for page in data.get("pages", []):
            props = page.get("pageprops", {})
            item = props.get("wikibase_item")
            if not item or "disambiguation" in props:
                continue
            todo = [page["title"]]
            while todo:
                t = todo.pop()
                result[t] = item
                todo += alias.get(t, [])
        time.sleep(1)
    return result


def fetch_page_images(titles, size=960):
    """Lead image of each article (a free image chosen by Wikipedia's PageImages)."""
    log("Wikipedia: lead images of %d articles" % len(titles))
    result = {}
    for batch in chunks(sorted(titles), 50):
        data = mw_query({
            "prop": "pageimages", "piprop": "thumbnail|name", "pithumbsize": size,
            "pilimit": 50, "redirects": 1, "titles": "|".join(batch),
        })
        alias = {}
        for kind in ("normalized", "redirects"):
            for r in data.get(kind, []):
                alias.setdefault(r["to"], []).append(r["from"])
        for page in data.get("pages", []):
            thumb = page.get("thumbnail", {}).get("source")
            if not thumb:
                continue
            todo = [page["title"]]
            while todo:
                t = todo.pop()
                result[t] = {"thumb": thumb, "file": page.get("pageimage", "")}
                todo += alias.get(t, [])
        time.sleep(1)
    return result


def infobox_file(infobox, fields):
    """First file named in the given infobox parameters ('Foo.jpg' or [[File:Foo.jpg|..]])."""
    try:
        import mwparserfromhell
        tpl = mwparserfromhell.parse(infobox or "").filter_templates(recursive=False)[0]
    except (ImportError, IndexError):
        return None
    for p in tpl.params:
        if str(p.name).strip().lower() not in fields:
            continue
        value = str(p.value)
        m = re.search(r"(?:File|Image):([^|\]\n]+\.(?:jpe?g|png|svg|gif|webp|tiff?))", value, re.I) or \
            re.search(r"^\s*([^|\]\[{}\n]+\.(?:jpe?g|png|svg|gif|webp|tiff?))", value, re.I)
        if m:
            return m.group(1).strip()
    return None


def fetch_file_info(files, width=960):
    """Thumbnail, author and licence of image files (only free files are kept by the build)."""
    log("Wikipedia: info about %d image files" % len(files))
    result = {}
    for batch in chunks(sorted(files), 50):
        data = mw_query({
            "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": width,
            "iiextmetadatafilter": "LicenseShortName|LicenseUrl|AttributionRequired|NonFree|Artist|Credit",
            "titles": "|".join("File:" + f for f in batch),
        })
        alias = {}
        for r in data.get("normalized", []):
            alias[r["to"]] = r["from"]
        for page in data.get("pages", []):
            info = (page.get("imageinfo") or [{}])[0]
            if not info.get("thumburl"):
                continue
            meta = info.get("extmetadata") or {}
            if not isinstance(meta, dict):          # the API returns [] when there is none
                meta = {}

            def field(name):
                v = meta.get(name) or {}
                return v.get("value", "") if isinstance(v, dict) else ""

            name = alias.get(page["title"], page["title"]).split(":", 1)[1]
            result[name] = {
                "thumb": info["thumburl"],
                "page": info.get("descriptionurl", ""),
                "license": field("LicenseShortName"),
                "license_url": field("LicenseUrl"),
                "attribution_required": str(field("AttributionRequired")).lower() in ("true", "1", "yes"),
                "nonfree": str(field("NonFree")).lower() in ("true", "1", "yes"),
                # HTML stripped here, entities unescaped and the text cut (on a
                # word) by the build; the Credit is the attribution of CC BY
                # files that name no Artist
                "artist": re.sub(r"<[^>]+>", "", str(field("Artist"))).strip()[:400],
                "credit": re.sub(r"<[^>]+>", "", str(field("Credit"))).strip()[:400],
            }
        time.sleep(1)
    return result


def fetch_extracts(titles, sentences=3):
    log("Wikipedia: intros of %d articles" % len(titles))
    result = {}
    for batch in chunks(sorted(titles), 20):
        data = mw_query({
            "prop": "extracts", "exintro": 1, "explaintext": 1, "exsentences": sentences,
            "exlimit": "max", "redirects": 1, "titles": "|".join(batch),
        })
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
    """Write atomically: a killed run never leaves half a JSON file behind."""
    path = os.path.join(RAW_DIR, name)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)
    log("saved %s" % os.path.relpath(path, ROOT))


MAX_DROP = 0.10     # a count falling by more than this means a broken fetch


def check_counts(counts):
    """Compare with the previous snapshot (data/raw/meta.json). A sudden drop
    (a query that timed out half way, Wikidata dropping English labels...)
    would quietly remove missions and people from the site: stop instead."""
    path = os.path.join(RAW_DIR, "meta.json")
    try:
        with open(path, encoding="utf-8") as f:
            previous = json.load(f)
    except (OSError, ValueError):
        return
    bad = ["%s %d -> %d" % (k, previous[k], n) for k, n in counts.items()
           if isinstance(previous.get(k), int) and n < previous[k] * (1 - MAX_DROP)]
    if bad:
        log("counts dropped by more than %d%%: %s" % (MAX_DROP * 100, ", ".join(bad)))
        log("raw files NOT written; check the sources (or delete data/raw/meta.json to accept)")
        sys.exit(1)


def legacy_names():
    import csv
    names = set()
    src = os.path.join(ROOT, "data", "source")
    with open(os.path.join(src, "missions_legacy.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            names |= {c.strip() for c in row["Crew"].split(",") if c.strip()}
    with open(os.path.join(src, "astronauts_legacy.csv"), encoding="utf-8") as f:
        names |= {row["Name"].strip() for row in csv.DictReader(f)}
    return names


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    links = fetch_links()
    mission_ids = {m for _, m in links} | fetch_recent_flights()
    missions = fetch_missions(mission_ids)

    # Keep only real flights (with a launch date); drops ISS expeditions etc.
    flights = {k: v for k, v in missions.items() if v.get("launch")}
    links = [(p, m) for p, m in links if m in flights]

    mission_boxes = fetch_infoboxes(
        {article_title(m["article"][0]) for m in flights.values() if m.get("article")})
    crew_titles = set()
    for box in mission_boxes.values():
        crew_titles |= crew_link_titles(box)
    title_ids = fetch_wikidata_ids(crew_titles)

    # Names used in the hand-curated legacy CSV files, looked up as Wikipedia
    # titles: gives a direct name -> person link even when Wikidata has no
    # "astronaut mission" statements for that person.
    legacy_titles = {}
    for name in legacy_names():
        for variant in (name, name + " (astronaut)", name + " (cosmonaut)"):
            legacy_titles[variant] = name
    legacy_ids = fetch_wikidata_ids(set(legacy_titles))

    people = fetch_people({p for p, _ in links} | set(title_ids.values()) | set(legacy_ids.values()))
    people = {k: v for k, v in people.items() if v.get("label")}
    # Article titles: Wikidata sitelinks, or the titles linked from the
    # spaceflight infoboxes (some items lack the enwiki sitelink in the query service).
    for t, q in list(title_ids.items()) + list(legacy_ids.items()):
        if q in people and not people[q].get("article"):
            people[q]["article"] = ["https://en.wikipedia.org/wiki/" + requests.utils.quote(t.replace(" ", "_"))]
    # people known only by their Wikipedia article (Wikidata returned nothing)
    orphan_titles = {t for t, q in title_ids.items() if q not in people}
    orphan_titles |= {t for t, q in legacy_ids.items() if q not in people and q in set(title_ids.values())}
    DIAGNOSTICS["people_without_wikidata"] = {t: title_ids.get(t) or legacy_ids.get(t)
                                              for t in sorted(orphan_titles)}
    person_boxes = fetch_infoboxes(
        {article_title(p["article"][0]) for p in people.values() if p.get("article")} | orphan_titles)
    person_extracts = fetch_extracts(orphan_titles)

    # Second round: flights listed in astronaut infoboxes but unknown to Wikidata
    # queries above (e.g. a mission item without crew statements).
    known_articles = {article_title(m["article"][0]) for m in flights.values() if m.get("article")}
    mission_titles = set()
    for box in person_boxes.values():
        mission_titles |= infobox_link_titles(box, ("mission", "missions"))
    mission_titles = {t for t in mission_titles
                      if t not in known_articles and not re.match(r"expedition|list of", t, re.I)}
    extra_ids = fetch_wikidata_ids(mission_titles)
    extra = fetch_missions(set(extra_ids.values()) - set(flights))
    extra = {k: v for k, v in extra.items() if v.get("launch")}
    log("  %d extra flights from astronaut infoboxes" % len(extra))
    extra_articles = {article_title(m["article"][0]) for m in extra.values() if m.get("article")}
    missing_flights = {t for t, q in extra_ids.items()
                       if q not in flights and q not in extra and t not in extra_articles}
    flights.update(extra)
    extra_boxes = fetch_infoboxes(extra_articles | missing_flights)
    # only spaceflight infoboxes of the flights unknown to Wikidata are kept
    for t in missing_flights:
        if not re.search(r"\{\{\s*Infobox spaceflight", extra_boxes.get(t) or "", re.I):
            extra_boxes.pop(t, None)
    DIAGNOSTICS["flights_without_wikidata"] = sorted(t for t in missing_flights if t in extra_boxes)
    mission_boxes.update(extra_boxes)
    extra_titles = set()
    for box in extra_boxes.values():
        extra_titles |= crew_link_titles(box)
    extra_title_ids = fetch_wikidata_ids(extra_titles - set(title_ids))
    title_ids.update(extra_title_ids)
    new_people = set(extra_title_ids.values()) - set(people)
    if new_people:
        more = fetch_people(new_people)
        more = {k: v for k, v in more.items() if v.get("label")}
        people.update(more)
        person_boxes.update(fetch_infoboxes(
            {article_title(p["article"][0]) for p in more.values() if p.get("article")}))

    extracts = fetch_extracts(
        {article_title(m["article"][0]) for m in flights.values() if m.get("article")})

    # short biographies and lead images (photos) of people and missions
    person_titles = set(person_boxes)
    person_extracts.update(fetch_extracts(person_titles - set(person_extracts), sentences=4))
    mission_titles_all = {article_title(m["article"][0]) for m in flights.values() if m.get("article")}
    images = fetch_page_images(person_titles | mission_titles_all | set(mission_boxes))
    # missions: the real photo of the infobox and the mission patch, separately
    mission_files = {}
    for title, box in mission_boxes.items():
        mission_files[title] = {"image": infobox_file(box, ("image",)),
                                "crew_photo": infobox_file(box, ("crew_photo",)),
                                "insignia": infobox_file(box, ("insignia",))}
    # people: the infobox portrait, in case the lead image is missing
    person_files = {t: infobox_file(box, ("image",)) for t, box in person_boxes.items()}
    person_files = {t: f for t, f in person_files.items() if f}
    wanted = {f for v in mission_files.values() for f in v.values() if f}
    wanted |= set(person_files.values())
    # the same images on Wikidata (free files on Commons): the fallback when
    # Wikipedia's file is not free or there is none
    for item in list(people.values()) + list(missions.values()) + list(flights.values()):
        wanted |= set(item.get("commons_image", [])) | set(item.get("commons_logo", []))
    wanted |= {v["file"] for v in images.values() if v.get("file")}
    file_info = fetch_file_info(wanted)

    counts = {"people": len(people), "missions": len(flights), "links": len(links)}
    check_counts(counts)
    save("wikidata_links.json", [list(l) for l in links])
    save("wikidata_people.json", people)
    save("wikidata_missions.json", flights)
    save("wikipedia_title_ids.json", title_ids)
    save("wikipedia_legacy_ids.json", {t: q for t, q in legacy_ids.items() if t in legacy_titles})
    save("wikipedia_mission_infoboxes.json", mission_boxes)
    save("wikipedia_infoboxes.json", person_boxes)
    save("wikipedia_extracts.json", extracts)
    save("wikipedia_person_extracts.json", person_extracts)
    save("wikipedia_images.json", images)
    save("wikipedia_mission_files.json", mission_files)
    save("wikipedia_person_files.json", person_files)
    save("wikipedia_file_info.json", file_info)
    save("diagnostics.json", DIAGNOSTICS)
    save("meta.json", dict(counts, fetched_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())))


if __name__ == "__main__":
    main()
