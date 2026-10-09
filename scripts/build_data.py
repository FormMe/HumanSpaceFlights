#!/usr/bin/env python3
"""Build the CSV files used by the web app from the raw Wikidata/Wikipedia snapshot.

Stage 2 of the data pipeline (works offline):

    python scripts/build_data.py

Inputs
  data/source/missions_legacy.csv    hand-curated missions 1961-2017 (original project)
  data/source/astronauts_legacy.csv  hand-curated USA/Russia astronauts (original project)
  data/source/overrides.csv          manual corrections (crew that returned on another
                                     vehicle, launches without crew, ...)
  data/raw/*.json                    snapshot made by scripts/fetch_data.py

Outputs (same format as before, so the visualization did not change)
  data/missions.csv
  data/all_astronauts.csv
  data/meta.json                     build date, counts

The legacy data is kept as is; Wikidata adds
  * every crewed orbital mission launched after the last legacy mission,
  * astronauts of all countries that were missing (China, Japan, Europe, ...),
  * new flights / status / death date / time in space of legacy astronauts.
"""

import csv
import datetime as dt
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

try:
    import mwparserfromhell
except ImportError:  # the build still works, just without Wikipedia infobox details
    mwparserfromhell = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
RAW = os.path.join(DATA, "raw")
SOURCE = os.path.join(DATA, "source")

MISSION_COLUMNS = ["Crew", "Country", "Habitation", "Brief Mission Summary", "Fatality",
                   "Moon", "Sub Orbital", "Prolongation", "Launch Data", "Launch Mission",
                   "Return Data", "Return Mission", "Year",
                   "Rocket", "Spacecraft", "Launch Site", "Landing Site", "Callsign", "Operator",
                   "Flight Time", "Wikipedia", "Description", "Photo URL", "Photo Credit", "Photo Page",
                   "Patch URL", "Patch Credit", "Patch Page"]
ASTRONAUT_COLUMNS = ["Name", "Year", "Status", "Birth Date", "Birth Place", "Gender",
                     "Alma Mater", "Military Rank", "Military Branch", "Space Flights",
                     "Space Flight (hr)", "Space Walks", "Space Walks (hr)", "Missions",
                     "Death Date", "Death Mission", "Country", "Nationality", "Country Code", "Source",
                     "Agency", "Bio", "Wikipedia", "Photo URL", "Photo Credit", "Photo Page"]

# Not orbital human spaceflights: kept out, like in the original dataset.
SUBORBITAL = re.compile(
    r"new shepard|blue origin|\bns-\d|virgin galactic|galactic \d|unity \d|spaceship|"
    r"x-15|mercury-redstone|suborbital|sub-orbital|vss unity", re.I)

TODAY = dt.date.today()


def log(*args):
    print(*args, file=sys.stderr)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def link_people_and_missions(missions_out, astronauts_out):
    """Every astronaut's "Missions" are the exact names of the missions whose crew
    lists them, in launch order. The legacy lists used other spellings
    ("Mercury 7" for "Mercury-Atlas 7 (Aurora 7)", "ST-5", "Gemini 9" for
    "Gemini 9A") and missed flights, so links from a person to a mission broke.
    A crew name that differs only by a suffix ("Albert Sacco" / "Albert Sacco Jr.")
    is renamed to the astronaut's name."""
    def norm(name):
        name = re.sub(r",?\s+(jr|sr|ii|iii|iv)\.?$", "", name.strip(), flags=re.I)
        return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", name).lower())

    def crew(row):
        return [c.strip() for c in row["Crew"].split(",") if c.strip()]

    names = {a["Name"] for a in astronauts_out}
    by_norm = defaultdict(set)
    for a in astronauts_out:
        by_norm[norm(a["Name"])].add(a["Name"])
    for row in missions_out:
        fixed = []
        for c in crew(row):
            match = by_norm.get(norm(c), set())
            fixed.append(c if c in names or len(match) != 1 else next(iter(match)))
        row["Crew"] = ", ".join(fixed)

    flown = defaultdict(list)
    for row in sorted(missions_out, key=lambda r: r["Launch Data"]):
        for c in crew(row):
            if row["Launch Mission"] not in flown[c]:
                flown[c].append(row["Launch Mission"])
    changed = 0
    for a in astronauts_out:
        if flown.get(a["Name"]):
            joined = ", ".join(flown[a["Name"]])
            changed += joined != a["Missions"]
            a["Missions"] = joined
    log("  mission lists of %d astronauts taken from the crews" % changed)


def write_csv(path, rows, columns):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    log("wrote %s (%d rows)" % (os.path.relpath(path, ROOT), len(rows)))


def load_json(name, default):
    path = os.path.join(RAW, name)
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def first(values, default=""):
    return values[0] if values else default


def strip_accents(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def mission_key(name):
    """'STS-6 (Challenger)' -> 'sts6', 'Soyuz TMA-04M' -> 'soyuztma04m'."""
    name = re.sub(r"\(.*?\)", "", name)
    return re.sub(r"[^a-z0-9]", "", strip_accents(name).lower())


def name_tokens(name):
    name = strip_accents(name).lower()
    name = re.sub(r"\(.*?\)|\".*?\"", " ", name)
    return [t for t in re.split(r"[^a-z]+", name) if t]


def same_person(a, b):
    """Loose comparison of two spellings of a name (transliterations differ a lot)."""
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return 0
    score = 0
    if ta[-1] == tb[-1]:
        score += 2
    elif set(ta) & set(tb):
        score += 1
    elif ta[-1][:4] == tb[-1][:4]:  # Yuri/Yury, Sergei/Sergey style differences
        score += 1
    if ta[0][0] == tb[0][0]:
        score += 1
    elif {t[0] for t in ta[:-1]} & {t[0] for t in tb[:-1]}:
        score += 1  # 'Gregory R. Wiseman' vs 'Reid Wiseman'
    return score


def wd_date(value):
    return value[:10] if value else ""


def legacy_birth(text):
    """'5/17/1967' or '1959-01-03 00:00:00' -> '1967-05-17'."""
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", text or "")
    if m:
        return "%s-%02d-%02d" % (m.group(3), int(m.group(1)), int(m.group(2)))
    return (text or "")[:10]


def parse_date(text):
    try:
        return dt.date.fromisoformat(text[:10])
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------
# countries
# --------------------------------------------------------------------------

def country_category(names):
    names = " | ".join(names).lower()
    if "united states" in names:
        return "USA"
    if "russia" in names or "soviet" in names:
        return "USSR/Russia"
    if "china" in names and "taiwan" not in names:
        return "China"
    return "Other"


HISTORICAL_STATES = {"Nazi Germany", "Weimar Republic", "First Syrian Republic",
                     "United Arab Republic", "Democratic Republic of Afghanistan",
                     "Russian Soviet Federative Socialist Republic", "Russian Empire",
                     "Mandatory Palestine", "British Raj", "Dominion of India"}


def nationality(names):
    if len(names) > 1:
        names = [n for n in names if n not in HISTORICAL_STATES] or names
    cleaned = []
    for n in names:
        n = {"United States of America": "United States",
             "People's Republic of China": "China",
             "Soviet Union": "USSR",
             "Kingdom of the Netherlands": "Netherlands",
             "Kingdom of Denmark": "Denmark"}.get(n, n)
        if n not in cleaned:
            cleaned.append(n)
    return " / ".join(cleaned)


def country_code(category, codes):
    preferred = {"USA": "US", "USSR/Russia": "RU", "China": "CN"}.get(category)
    if preferred:
        return preferred
    codes = [c for c in codes if c not in ("US", "RU", "CN")] or codes
    # dissolved states -> successor flag available in pics/flags
    codes = sorted({{"DD": "DE", "SU": "RU", "CS": "CZ", "YU": "RS"}.get(c, c) for c in codes})
    return codes[0] if codes else ""


def mission_country(name, mission):
    n = name.lower()
    if n.startswith("soyuz") or n.startswith("vostok") or n.startswith("voskhod"):
        return "USSR/Russia"
    if n.startswith("shenzhou") or n.startswith("mengzhou"):
        return "China"
    if re.match(r"(spacex|crew|axiom|ax-|inspiration|polaris|fram|boeing|starliner|artemis|sts|apollo|gemini)", n):
        return "USA"
    cat = country_category(mission.get("country", []) + mission.get("operator", []))
    if cat == "Other":
        ops = " ".join(mission.get("operator", [])).lower()
        if "nasa" in ops or "spacex" in ops:
            return "USA"
        if "roscosmos" in ops:
            return "USSR/Russia"
        if "cmsa" in ops or "china" in ops:
            return "China"
    return cat


def habitation(name, mission, extract):
    text = " ".join([name] + mission.get("destination", []) + mission.get("description", [])
                    + mission.get("part_of", []) + [extract or ""]).lower()
    m = re.match(r"shenzhou (\d+)", name.lower())
    if m and int(m.group(1)) >= 12:
        return "Tiangong"
    if "artemis" in name.lower():
        return "Moon"
    if "international space station" in text or re.search(r"\biss\b", text):
        return "ISS"
    if re.match(r"(soyuz ms|spacex crew|crew-|axiom|ax-|boeing|crew dragon demo)", name.lower()):
        return "ISS"
    if "tiangong" in text or "chinese space station" in text:
        return "Tiangong"
    return ""


# --------------------------------------------------------------------------
# Wikipedia infobox parsing
# --------------------------------------------------------------------------

def parse_infobox(text):
    """Parameters of an infobox, including embedded ones.

    Many biographies use {{Infobox person}} with {{Infobox astronaut|embed=yes}}
    (and {{Infobox military person}}) nested inside a parameter; the astronaut
    fields (time in space, EVAs, selection, status) live in the embedded box.
    """
    if not text or mwparserfromhell is None:
        return {}
    try:
        code = mwparserfromhell.parse(text)
    except ValueError:
        return {}
    boxes = [t for t in code.filter_templates(recursive=True)
             if str(t.name).strip().lower().startswith("infobox")]
    # astronaut / spaceflight boxes first: their values win
    boxes.sort(key=lambda t: 0 if re.search(r"astronaut|spaceflight", str(t.name), re.I) else 1)
    out = {}
    for tpl in boxes:
        for p in tpl.params:
            key = str(p.name).strip().lower().replace(" ", "_")
            value = str(p.value).strip()
            if value and not value.lower().startswith("{{infobox") and key not in out:
                out[key] = value
    return out


def plain(value):
    if not value:
        return ""
    if mwparserfromhell is not None:
        value = mwparserfromhell.parse(value).strip_code()
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" ,;")


def duration_hours(raw):
    """'{{Duration|d=328|h=13|m=58}}', '665d 22h 22m', '15 hours, 17 minutes' -> hours."""
    if not raw:
        return None
    raw = re.sub(r"(?<=\d),(?=\d{3})", "", raw.replace("&nbsp;", " "))
    parts = {}
    for unit in ("y", "d", "h", "m"):
        m = re.search(r"\|\s*%s\s*=\s*(\d+)" % unit, raw)
        if m:
            parts[unit] = int(m.group(1))
    if not parts:
        text = plain(raw).lower()
        for unit, pattern in (("y", r"(\d+)\s*(?:years?|yr)"),
                              ("d", r"(\d+)\s*(?:days?|d\b)"),
                              ("h", r"(\d+)\s*(?:hours?|hrs?|h\b)"),
                              ("m", r"(\d+)\s*(?:minutes?|mins?|m\b)")):
            m = re.search(pattern, text)
            if m:
                parts[unit] = int(m.group(1))
    if not parts:
        return None
    return parts.get("y", 0) * 8766 + parts.get("d", 0) * 24 + parts.get("h", 0) + parts.get("m", 0) / 60


def first_int(raw):
    m = re.search(r"\d+", plain(raw))
    return int(m.group(0)) if m else None


def selection_year(raw):
    m = re.search(r"\b(19[5-9]\d|20[0-4]\d)\b", raw or "")
    return m.group(1) if m else ""


def status_from(raw, death, retired=""):
    if death:
        return "Deceased"
    m = re.search(r"\b(19|20)\d\d\b", plain(retired or ""))
    if m and int(m.group(0)) <= TODAY.year:
        return "Retired"
    text = plain(raw).lower()
    if "deceased" in text or "died" in text:
        return "Deceased"
    if "active" in text and "inactive" not in text:
        return "Active"
    if text:
        return "Retired"
    return ""


def summarize(extract, description):
    if extract:
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", extract.strip())
        summary = " ".join(sentences[:2])
        return summary[:400]
    if description:
        return description[0][:1].upper() + description[0][1:] + "."
    return ""


def fmt_number(value):
    if value in (None, ""):
        return ""
    value = float(value)
    if value == 0:
        return "0"
    return str(int(round(value))) if value >= 1 else str(round(value, 1))


# --------------------------------------------------------------------------
# overrides
# --------------------------------------------------------------------------

def load_overrides():
    path = os.path.join(SOURCE, "overrides.csv")
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(line for line in f if not line.startswith("#")):
            rows.append({k: (v or "").strip() for k, v in row.items()})
    return rows


# --------------------------------------------------------------------------
# main build
# --------------------------------------------------------------------------

MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], 1)}


def wiki_date(raw):
    """Date from an infobox value: {{Start date|2021|04|09|...}} or '9 April 2021'."""
    if not raw:
        return ""
    m = re.search(r"\{\{\s*[a-z -]*date[a-z -]*\|"
                  r"(?:[^|}]*=[^|}]*\|)*\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", raw, re.I)
    if m:
        y, mo, d = (int(x) for x in m.groups())
    else:
        text = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", " ", raw, flags=re.S)
        text = re.sub(r"\{\{\s*(?:nbsp|snd|ndash|spaces)\s*\}\}", " ", text, flags=re.I)
        text = re.sub(r"\{\{[^{}|]*\|", " ", text).replace("}}", " ")
        text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)
        text = re.sub(r"&nbsp;", " ", text).lower()
        m1 = re.search(r"(\d{1,2})\s+(%s)\s+(\d{4})" % "|".join(MONTHS), text)
        m2 = re.search(r"(%s)\s+(\d{1,2}),?\s+(\d{4})" % "|".join(MONTHS), text)
        if m1:
            d, mo, y = int(m1.group(1)), MONTHS[m1.group(2)], int(m1.group(3))
        elif m2:
            mo, d, y = MONTHS[m2.group(1)], int(m2.group(2)), int(m2.group(3))
        else:
            return ""
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return ""


def field_raw(box_text, field):
    """Raw value of an infobox parameter (works without mwparserfromhell, keeps links)."""
    m = re.search(r"\|\s*%s\s*=(.*?)(?=\n\s*\|\s*[a-z_ ]+=|\Z)" % field, box_text or "", re.S | re.I)
    return m.group(1).strip() if m else None


def link_titles(raw):
    return [t.strip() for t in re.findall(r"\[\[([^\]|#]+)", raw or "")]


AGENCY_COUNTRY = [
    (r"NASA|United States", "United States", "US"), (r"Roscosmos|Russia|Soviet", "Russia", "RU"),
    (r"CNSA|CMSA|China|PLA", "China", "CN"), (r"JAXA|NASDA|Japan", "Japan", "JP"),
    (r"CSA|Canad", "Canada", "CA"), (r"ISRO|India", "India", "IN"),
    (r"Ital", "Italy", "IT"), (r"German|DLR", "Germany", "DE"), (r"CNES|Franc", "France", "FR"),
]


def wiki_url(title):
    return "https://en.wikipedia.org/wiki/" + title.replace(" ", "_")


def person_from_wikipedia(title, box_text, extract):
    """Minimal Wikidata-like record from an astronaut article."""
    box = parse_infobox(box_text)
    if not box or not re.search(r"astronaut|cosmonaut|taikonaut|spaceflight",
                                box_text + extract, re.I):
        return None
    birth = wiki_date(box.get("birth_date"))
    words = re.findall(r"\b(she|her|hers|he|his|him)\b", extract.lower())
    female = sum(w in ("she", "her", "hers") for w in words)
    male = len(words) - female
    gender = "female" if female > male else "male" if male > female else ""
    origin = plain(box.get("nationality", "")) + " " + plain(box.get("type", ""))
    citizenship, codes = [], []
    for pattern, country, code in AGENCY_COUNTRY:
        if re.search(pattern, origin):
            citizenship, codes = [country], [code]
            break
    rec = {
        "label": [re.sub(r"\s*\(.*?\)$", "", plain(box.get("name", "")) or title)],
        "article": [wiki_url(title)],
        "description": ["astronaut (from Wikipedia)"],
        "birth": [birth + "T00:00:00Z"] if birth else [],
        "death": [wiki_date(box.get("death_date")) + "T00:00:00Z"] if wiki_date(box.get("death_date")) else [],
        "gender": [gender] if gender else [],
        "birth_place": [plain(box.get("birth_place", ""))] if box.get("birth_place") else [],
        "citizenship": citizenship,
        "citizenship_code": codes,
    }
    return {k: v for k, v in rec.items() if v}


def mission_from_wikipedia(title, box_text, extract):
    """Spaceflight known only from its Wikipedia infobox."""
    box = parse_infobox(box_text)
    launch = wiki_date(box.get("launch_date"))
    if not launch:
        return None
    landing = wiki_date(box.get("landing_date"))
    rec = {
        "label": [title],
        "article": [wiki_url(title)],
        "launch": [launch + "T00:00:00Z"],
        "landing": [landing + "T00:00:00Z"] if landing else [],
        "description": [plain(box.get("mission_type", ""))] if box.get("mission_type") else [],
        "operator": [plain(box.get("operator", ""))] if box.get("operator") else [],
    }
    return {k: v for k, v in rec.items() if v}


AUDIT_FIELDS = ["Birth Date", "Birth Place", "Gender", "Status", "Year", "Alma Mater",
                "Space Flight (hr)", "Nationality"]


def f_never_flew(a, crew):
    return a["Name"] not in crew


def make_audit(missions, astronauts):
    """What is still missing after the build (written to data/audit.json)."""
    names = {a["Name"] for a in astronauts}
    crew = defaultdict(list)
    for r in missions:
        for c in r["Crew"].split(","):
            if c.strip():
                crew[c.strip()].append(r["Launch Mission"])
    fatal_launches = {r["Launch Mission"] for r in missions
                      if r["Fatality"] == "Y" and r["Prolongation"] in ("0", "0.0")}
    gaps = {}
    for a in astronauts:
        missing = [f for f in AUDIT_FIELDS if not str(a.get(f, "")).strip()
                   or (f == "Space Flight (hr)" and a.get(f) in ("0", "0.0")
                       and a["Name"] in crew and not all(
                           m in fatal_launches for m in crew[a["Name"]]))]
        if f_never_flew(a, crew):
            missing = [f for f in missing if f != "Year"]
        if missing:
            gaps[a["Name"]] = missing
    field_counts = defaultdict(int)
    for missing in gaps.values():
        for f in missing:
            field_counts[f] += 1
    # plausibility: a wrong person (namesake) usually shows up here
    suspicious = {}
    for a in astronauts:
        flights = sorted(r["Launch Data"] for r in missions
                         if a["Name"] in [c.strip() for c in r["Crew"].split(",")])
        born = legacy_birth(a["Birth Date"])
        if flights and born[:4].isdigit():
            age = int(flights[0][:4]) - int(born[:4])
            if not 20 <= age <= 80:
                suspicious[a["Name"]] = "age %d at first flight" % age
        died = legacy_birth(a["Death Date"])
        if flights and died[:4].isdigit() and died < flights[-1]:
            suspicious[a["Name"]] = "death date %s before flight %s" % (died, flights[-1])
    return {
        "suspicious_records": suspicious,
        "crew_without_record": {n: m for n, m in sorted(crew.items()) if n not in names},
        "missing_field_counts": dict(sorted(field_counts.items())),
        "astronauts_with_gaps": dict(sorted(gaps.items())),
        "missions_without_summary": sorted({r["Launch Mission"] for r in missions
                                            if not r["Brief Mission Summary"].strip()}),
        # free images that were not found anywhere (Wikipedia, infobox, Wikidata)
        "missions_without_photo": sorted({r["Launch Mission"] for r in missions if not r.get("Photo URL")}),
        "missions_without_patch": sorted({r["Launch Mission"] for r in missions if not r.get("Patch URL")}),
        "astronauts_without_photo": sorted(a["Name"] for a in astronauts
                                           if a.get("Missions") and not a.get("Photo URL")),
        "sources": dict(sorted(defaultdict(int, {k: sum(1 for a in astronauts if a.get("Source") == k)
                                                 for k in {a.get("Source") for a in astronauts}}).items())),
    }


def main():
    legacy_missions = read_csv(os.path.join(SOURCE, "missions_legacy.csv"))
    legacy_astronauts = read_csv(os.path.join(SOURCE, "astronauts_legacy.csv"))
    links = load_json("wikidata_links.json", [])
    people = load_json("wikidata_people.json", {})
    wd_missions = load_json("wikidata_missions.json", {})
    infoboxes = load_json("wikipedia_infoboxes.json", {})
    mission_boxes = load_json("wikipedia_mission_infoboxes.json", {})
    title_ids = load_json("wikipedia_title_ids.json", {})
    legacy_ids = load_json("wikipedia_legacy_ids.json", {})
    person_extracts = load_json("wikipedia_person_extracts.json", {})
    extracts = load_json("wikipedia_extracts.json", {})
    images = load_json("wikipedia_images.json", {})
    mission_files = load_json("wikipedia_mission_files.json", {})
    file_info = load_json("wikipedia_file_info.json", {})
    person_files = load_json("wikipedia_person_files.json", {})
    overrides = load_overrides()

    if not wd_missions:
        log("no raw data in data/raw - run scripts/fetch_data.py first")

    def article(item):
        url = first(item.get("article", []))
        if not url:
            return None
        from urllib.parse import unquote
        return unquote(url.rsplit("/wiki/", 1)[-1]).replace("_", " ")

    # Records built from Wikipedia alone, for articles whose Wikidata item
    # could not be read (see data/raw/diagnostics.json).
    for title, q in sorted(list(title_ids.items()) + list(legacy_ids.items())):
        if q in people or title not in infoboxes:
            continue
        rec = person_from_wikipedia(title, infoboxes[title], person_extracts.get(title, ""))
        if rec:
            people[q] = rec
    known_articles = {article(m) for m in wd_missions.values()}
    for title, text in sorted(mission_boxes.items()):
        if title in known_articles:
            continue
        rec = mission_from_wikipedia(title, text, extracts.get(title, ""))
        if rec:
            wd_missions["wp:" + title] = rec

    def is_person(q):
        p = people.get(q)
        return bool(p and p.get("label") and (p.get("birth") or p.get("gender")))

    # ---- legacy missions index ------------------------------------------
    legacy_by_key = {}
    legacy_crew = defaultdict(list)          # mission name -> crew names
    for row in legacy_missions:
        legacy_by_key.setdefault(mission_key(row["Launch Mission"]), row["Launch Mission"])
        legacy_crew[row["Launch Mission"]] += [c.strip() for c in row["Crew"].split(",") if c.strip()]
    legacy_dates = defaultdict(list)
    for row in legacy_missions:
        legacy_dates[row["Launch Data"]].append(row["Launch Mission"])
    cutoff = max(row["Launch Data"] for row in legacy_missions)

    # ---- crews: Wikipedia infobox (launching / landing) or Wikidata ------
    link_people = defaultdict(set)
    person_links = defaultdict(set)
    for p, m in links:
        link_people[m].add(p)
        person_links[p].add(m)

    # article title -> person, from Wikidata sitelinks and resolved infobox links
    person_by_title = dict(title_ids)
    for q, person in people.items():
        t = article(person)
        if t:
            person_by_title.setdefault(t, q)

    def crew_ids(raw):
        found = set()
        for t in link_titles(raw):
            q = person_by_title.get(t) or person_by_title.get(t[:1].upper() + t[1:])
            if q and is_person(q):
                found.add(q)
        return found

    launch_crew, landing_crew, launch_date, landing_date = {}, {}, {}, {}
    for q, m in wd_missions.items():
        box_text = mission_boxes.get(article(m) or "") or ""
        box = parse_infobox(box_text)
        both = crew_ids(box.get("crew_members"))
        up_only = crew_ids(box.get("crew_launching") or box.get("launching"))
        down_only = crew_ids(box.get("crew_landing") or box.get("landing"))
        has_fields = any(k in box for k in ("crew_members", "crew_launching", "crew_landing",
                                             "launching", "landing"))
        if has_fields and (both or up_only or down_only):
            up, down = both | up_only, both | down_only
        else:
            up = {p for p in link_people[q] if is_person(p)}
            down = set(up)
        launch_crew[q], landing_crew[q] = up, down

        wd_launch = wd_date(min(m["launch"]))
        launch_date[q] = wiki_date(box.get("launch_date")) or wd_launch
        if abs((parse_date(launch_date[q]) - parse_date(wd_launch)).days) > 3:
            launch_date[q] = wd_launch   # infobox shows a different (e.g. planned) date
        landing = wiki_date(box.get("landing_date"))
        if not landing and m.get("landing"):
            landing = wd_date(min(m["landing"]))
            if landing.endswith("-01-01"):   # Wikidata value with year precision only
                landing = ""
        if landing and parse_date(landing) > TODAY:
            landing = ""
        landing_date[q] = landing

    # ---- classify Wikidata missions ---------------------------------------
    skip_missions = {o["mission"] for o in overrides if o["field"] == "skip"}
    wd_to_legacy = {}    # wikidata qid -> legacy mission name
    new_missions = {}    # wikidata qid -> mission name
    for q, m in wd_missions.items():
        label = first(m.get("label", []))
        launch = launch_date[q]
        if not label or not launch:
            continue
        key = mission_key(label)
        if key in legacy_by_key:
            wd_to_legacy[q] = legacy_by_key[key]
            continue
        same_day = legacy_dates.get(launch, [])
        if len(same_day) == 1:
            wd_to_legacy[q] = same_day[0]
            continue
        if launch <= cutoff or parse_date(launch) > TODAY:
            continue
        text = " ".join([label] + m.get("instance", []) + m.get("vehicle", [])
                        + m.get("operator", []) + m.get("description", []))
        if SUBORBITAL.search(text):
            continue
        if any(re.search(r"module|space station$|satellite|cargo", i, re.I) for i in m.get("instance", [])):
            continue
        if label in skip_missions or not launch_crew[q]:
            continue
        new_missions[q] = label

    # ---- people: map Wikidata persons to legacy name spellings ----------
    legacy_astr_by_name = {a["Name"]: a for a in legacy_astronauts}
    new_flyers = set()
    for q in new_missions:
        new_flyers |= launch_crew[q]

    def name_scores(candidates, person):
        names = [n for n in [first(person.get("label", []))] + person.get("alt_labels", []) if n]
        return {c: max([same_person(c, n) for n in names] or [0]) for c in sorted(set(candidates))}

    def best_name(candidates, person):
        scores = name_scores(candidates, person)
        best = max(scores, key=lambda c: (scores[c], c in legacy_astr_by_name), default=None)
        return best if best and scores[best] >= 3 else None

    # direct links legacy name -> person through Wikipedia titles; only kept
    # when the article is about a space traveller (not a namesake)
    space_words = re.compile(r"astronaut|cosmonaut|taikonaut|spaceflight|space tourist|"
                             r"payload specialist|spationaut|space travel", re.I)

    def is_space_traveller(q, name):
        person = people.get(q, {})
        if person_links.get(q):
            return True
        if any(space_words.search(d) for d in person.get("description", [])):
            return True
        legacy = legacy_astr_by_name.get(name)
        return bool(legacy and legacy_birth(legacy["Birth Date"]) == wd_date(first(person.get("birth", []))))

    direct = defaultdict(list)     # qid -> legacy names
    for name in sorted(set(legacy_astr_by_name) | {c for cs in legacy_crew.values() for c in cs}):
        for variant in (name, name + " (astronaut)", name + " (cosmonaut)"):
            q = legacy_ids.get(variant)
            if q and is_person(q) and is_space_traveller(q, name):
                direct[q].append(name)
                break

    person_name = {}       # qid -> name used in the CSV files
    alias = {}             # other spellings of the same person in the legacy missions
    flew = set(person_links) | set(direct)
    for crew in list(launch_crew.values()) + list(landing_crew.values()):
        flew |= crew
    for q in sorted(people):
        person = people[q]
        # namesakes found by the title lookup (a poet called Georgy Ivanov...) are ignored
        if not is_person(q) or q not in flew:
            continue
        label = first(person["label"])
        legacy_names = []
        for m in person_links[q]:
            if m in wd_to_legacy:
                legacy_names += legacy_crew[wd_to_legacy[m]]
        name = best_name(legacy_names, person) if legacy_names else None
        if direct.get(q):
            names = sorted(direct[q], key=lambda n: (n not in legacy_astr_by_name, n))
            if name is None or name not in names:
                name = name if name in legacy_astr_by_name else names[0]
            for other in names:
                if other != name and other not in legacy_astr_by_name:
                    alias[other] = name
        if name:
            scores = name_scores(legacy_names, person)
            for other, score in scores.items():
                if other != name and score >= 3 and other not in legacy_astr_by_name \
                        and same_person(other, name) >= 3:
                    alias[other] = name
        if name is None and q in new_flyers:
            # same spelling is not enough (Clifton C. Williams vs Christopher Williams):
            # the birth date has to match too
            born = wd_date(first(person.get("birth", [])))
            same_birth = [n for n, a in legacy_astr_by_name.items()
                          if born and legacy_birth(a["Birth Date"]) == born]
            scores = name_scores(same_birth, person)
            name = max(scores, key=scores.get) if scores and max(scores.values()) >= 2 else None
        person_name[q] = name or label

    # ---- new mission rows -------------------------------------------------
    member_override = defaultdict(dict)   # (mission, member) -> {field: value}
    for o in overrides:
        member_override[(o["mission"], o["member"])][o["field"]] = o["value"]

    def override(mission, member, field):
        for key in ((mission, member), (mission, "*")):
            if field in member_override.get(key, {}):
                return member_override[key][field]
        return None

    def mission_name(q):
        return wd_to_legacy.get(q) or first(wd_missions[q].get("label", []))

    def return_flight(p, q):
        """Mission on which person p came back after launching on mission q.

        Usually the same spacecraft; otherwise the vehicle whose landing crew
        includes p and which landed after p's launch (it may have been
        launched earlier, e.g. Soyuz MS-25 crew landing in Soyuz MS-24).
        """
        if p in landing_crew.get(q, ()):
            return q
        start = parse_date(launch_date[q])
        options = []
        for b, crew in landing_crew.items():
            if b == q or p not in crew or not landing_date.get(b):
                continue
            days = (parse_date(landing_date[b]) - start).days
            if 0 <= days <= 500:
                options.append((days, b))
        return min(options)[1] if options else q

    new_rows = []
    mission_duration = {}
    for q, label in sorted(new_missions.items(), key=lambda kv: launch_date[kv[0]]):
        m = wd_missions[q]
        launch = launch_date[q]
        extract = extracts.get(article(m) or "", "")

        groups = defaultdict(list)
        for p in launch_crew[q]:
            c = person_name.get(p)
            if not c or override(label, c, "remove") is not None:
                continue
            back = return_flight(p, q)
            ret_mission = override(label, c, "return_mission") or mission_name(back)
            ret_date = override(label, c, "return_date")
            if ret_date is None:
                ret_date = landing_date.get(back, "")
            groups[(ret_mission, ret_date)].append(c)
        for o in overrides:
            if o["mission"] == label and o["field"] == "add":
                groups[(label, landing_date[q])].append(o["member"])
        if not groups:
            continue

        country = override(label, "*", "country") or mission_country(label, m)
        hab = override(label, "*", "habitation")
        if hab is None:
            hab = habitation(label, m, extract)
        summary = override(label, "*", "summary") or summarize(extract, m.get("description"))
        for (ret_mission, ret_date), members in sorted(groups.items()):
            days = ""
            if ret_date:
                days = "%.1f" % (parse_date(ret_date) - parse_date(launch)).days
            else:
                ret_mission = "in orbit"
            new_rows.append({
                "Crew": ", ".join(sorted(members)),
                "Country": country,
                "Habitation": hab,
                "Brief Mission Summary": summary,
                "Fatality": override(label, "*", "fatality") or "N",
                "Moon": "Y" if hab == "Moon" else "N",
                "Sub Orbital": override(label, "*", "sub_orbital") or "N",
                "Prolongation": days,
                "Launch Data": launch,
                "Launch Mission": label,
                "Return Data": ret_date,
                "Return Mission": ret_mission,
                "Year": launch[:4],
            })
            for member in members:
                # crews still in orbit: time in space so far
                mission_duration[(label, member)] = float(days) if days else \
                    float((TODAY - parse_date(launch)).days)

    legacy_to_wd = {v: k for k, v in wd_to_legacy.items()}
    for row in legacy_missions:
        q = legacy_to_wd.get(row["Launch Mission"])
        fixed = override(row["Launch Mission"], "*", "summary")
        if fixed:
            row["Brief Mission Summary"] = fixed
        elif not row["Brief Mission Summary"].strip() and q:
            row["Brief Mission Summary"] = summarize(
                extracts.get(article(wd_missions[q]) or "", ""), wd_missions[q].get("description"))
        crew = [c.strip() for c in row["Crew"].split(",") if c.strip()]
        row["Crew"] = ", ".join(alias.get(c, c) for c in crew)
    missions_out = legacy_missions + new_rows

    # Legacy missions that are still "in orbit" in the old file have landed by now.
    for row in missions_out:
        if row["Return Mission"] == "in orbit" and row in legacy_missions:
            q = next((k for k, v in wd_to_legacy.items() if v == row["Launch Mission"]), None)
            landing = landing_date.get(q, "") if q else ""
            ret = override(row["Launch Mission"], "*", "return_date") or landing
            if ret:
                row["Return Data"] = ret
                row["Return Mission"] = override(row["Launch Mission"], "*", "return_mission") or row["Launch Mission"]
                row["Prolongation"] = "%.1f" % (parse_date(ret) - parse_date(row["Launch Data"])).days

    # durations of the legacy flights as well (time in space fallback)
    for row in legacy_missions:
        for c in row["Crew"].split(","):
            if c.strip() and row["Prolongation"]:
                mission_duration.setdefault((row["Launch Mission"], c.strip()), float(row["Prolongation"]))

    # crew name -> missions (in order) for every person of the final dataset
    flights_of = defaultdict(list)
    for row in sorted(missions_out, key=lambda r: r["Launch Data"]):
        for c in row["Crew"].split(","):
            c = c.strip()
            if c and row["Launch Mission"] not in flights_of[c]:
                flights_of[c].append(row["Launch Mission"])

    # ---- astronauts -------------------------------------------------------
    by_name_q = {}
    for q, name in person_name.items():
        if name in flights_of:
            by_name_q.setdefault(name, q)
    # People whose legacy spelling matched nobody ("Mikhail TYuryn", "Yury
    # Usachyev"): the Wikidata crews of their missions, minus everyone already
    # matched, usually leave exactly one person.
    # A person counts as taken only when matched to an astronaut record: the
    # crew may spell the same person differently ("Albert Sacco" for the
    # record "Albert Sacco Jr.").
    taken = {q for n, q in by_name_q.items() if n in legacy_astr_by_name}
    unmatched = dict(flights_of)
    for a in legacy_astronauts:
        flown = [m.strip() for m in a["Missions"].split(",") if m.strip()]
        if flown and a["Name"] not in unmatched:
            unmatched[a["Name"]] = flown
    for name, flown in sorted(unmatched.items()):
        if name in by_name_q:
            continue
        common, seen = None, defaultdict(int)
        for mission in flown:
            mq = legacy_to_wd.get(mission) or next((q for q, l in new_missions.items() if l == mission), None)
            if not mq:
                continue
            crew = (launch_crew.get(mq, set()) | landing_crew.get(mq, set())) - taken
            common = crew if common is None else common & crew
            for q in crew:
                seen[q] += 1
        if not common and seen:
            # the legacy record mixes two people (Alexandrov: Soviet on T-9 and
            # TM-3, Bulgarian on TM-5): the one on most of the flights
            top = max(seen.values())
            common = {q for q, c in seen.items() if c == top and c >= 2}
        if not common:
            continue
        if len(common) > 1:      # several left: the closest name, if it is close at all
            scored = sorted(((same_person(name, first(people.get(q, {}).get("label", [""]))), q) for q in common),
                            reverse=True)
            if scored[0][0] < 1 or scored[0][0] == scored[1][0]:
                continue
            common = {scored[0][1]}
        q = common.pop()
        if q in people:
            by_name_q[name] = q
            taken.add(q)
            log("  matched by crew: %s -> %s" % (name, first(people[q].get("label", [q]))))

    astronauts_out = []
    seen = set()

    def wikipedia_details(q):
        person = people.get(q, {})
        return parse_infobox(infoboxes.get(article(person) or "", ""))

    for a in legacy_astronauts:
        a = dict(a)
        q = by_name_q.get(a["Name"])
        cat = a["Country"]
        a["Nationality"] = {"USA": "United States", "USSR/Russia": "USSR / Russia"}.get(cat, cat)
        a["Country Code"] = country_code(cat, [])
        a["Source"] = "legacy"
        if q:
            a["Source"] = "legacy + Wikidata/Wikipedia"
            person = people[q]
            box = wikipedia_details(q)
            if person.get("citizenship"):
                a["Nationality"] = nationality(person["citizenship"])
            death = wd_date(first(person.get("death", [])))
            if death and not a["Death Date"]:
                a["Death Date"] = death
                a["Status"] = "Deceased"
            new_flights = [m for m in flights_of.get(a["Name"], []) if m in {r["Launch Mission"] for r in new_rows}]
            old = [m.strip() for m in a["Missions"].split(",") if m.strip()]
            added = [m for m in new_flights if m not in old]
            if added:
                a["Missions"] = ", ".join(old + added)
                a["Space Flights"] = str(len(old) + len(added))
            hours = duration_hours(box.get("time_in_space") or box.get("time"))
            if hours is None and person.get("time_in_space_s"):
                hours = float(first(person["time_in_space_s"])) / 3600
            computed = float(a["Space Flight (hr)"] or 0) + sum(
                (mission_duration.get((m, a["Name"])) or 0) * 24 for m in added)
            a["Space Flight (hr)"] = fmt_number(max(hours or 0, computed))
            if not a["Death Date"]:
                st = status_from(box.get("status"), "", box.get("retired"))
                if added:
                    a["Status"] = st or "Active"
                elif st and a["Status"] != "Management":
                    a["Status"] = st
            evas = first_int(box.get("total_evas") or box.get("eva1") or "")
            if evas is not None and evas > float(a["Space Walks"] or 0):
                a["Space Walks"] = str(evas)
                eva_hours = duration_hours(box.get("total_eva_time") or box.get("eva2"))
                if eva_hours:
                    a["Space Walks (hr)"] = fmt_number(eva_hours)
        astronauts_out.append(a)
        seen.add(a["Name"])

    for name, flights in sorted(flights_of.items()):
        if name in seen:
            continue
        q = by_name_q.get(name)
        if not q:
            continue  # unknown person: the app shows such crew members as "Other"
        person = people[q]
        box = wikipedia_details(q)
        citizenship = person.get("citizenship", [])
        death = wd_date(first(person.get("death", [])))
        hours = duration_hours(box.get("time_in_space") or box.get("time"))
        if hours is None and person.get("time_in_space_s"):
            hours = float(first(person["time_in_space_s"])) / 3600
        computed = sum(mission_duration.get((m, name)) or 0 for m in flights) * 24
        hours = max(hours or 0, computed)
        evas = first_int(box.get("total_evas") or box.get("eva1") or "") or 0
        eva_hours = duration_hours(box.get("total_eva_time") or box.get("eva2")) or 0
        status = status_from(box.get("status"), death, box.get("retired"))
        if not status:
            last = max(r["Launch Data"] for r in missions_out if r["Launch Mission"] in flights)
            status = "Active" if (TODAY - parse_date(last)).days < 6 * 365 else "Retired"
        gender = first(person.get("gender", [])).lower()
        astronauts_out.append({
            "Name": name,
            "Year": selection_year(box.get("selection", "")),
            "Status": status,
            "Birth Date": wd_date(first(person.get("birth", []))),
            "Birth Place": plain(box.get("birth_place", "")) or first(person.get("birth_place", [])),
            "Gender": {"male": "Male", "female": "Female", "trans woman": "Female",
                       "trans man": "Male"}.get(gender, gender.capitalize()),
            "Alma Mater": plain(box.get("alma_mater") or box.get("education") or "").replace("\n", "; ")
                          or "; ".join([e for e in person.get("educated_at", [])
                                     if not re.search(r"high school|secondary|gymnasium|lyc[eé]e|school no", e, re.I)][:3]),
            "Military Rank": plain(box.get("rank", "")).split("\n")[0][:80]
                             or first(person.get("military_rank", [])),
            "Military Branch": first(person.get("military_branch", [])),
            "Space Flights": str(len(flights)),
            "Space Flight (hr)": fmt_number(hours),
            "Space Walks": str(evas),
            "Space Walks (hr)": fmt_number(eva_hours) or "0",
            "Missions": ", ".join(flights),
            "Death Date": death,
            "Death Mission": "",
            "Country": country_category(citizenship),
            "Nationality": nationality(citizenship),
            "Country Code": country_code(country_category(citizenship), person.get("citizenship_code", [])),
            "Source": "Wikidata/Wikipedia",
        })
        seen.add(name)

    # ---- more details: vehicle, places, biography, photo, article -------------
    def short(raw, limit=70):
        text = plain(re.sub(r"<ref[^>]*/>|<ref.*?</ref>", " ", raw or "", flags=re.S))
        text = re.split(r"\n|\s{2,}", text.strip())[0] if text else ""
        text = re.sub(r"\(\s*[,;]?\s*\)", "", text)        # templates removed by plain()
        text = re.sub(r"(^|\s)(,\s*)?or\s*$", "", text.strip())
        text = re.sub(r"\s{2,}", " ", text).strip(" ,;(")
        return text[:limit].rstrip(" ,;(")

    def flight_time(raw):
        """'9 hours, 13 minutes' or {{time interval|start|end}} -> '9 h 13 min'."""
        text = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", " ", raw or "", flags=re.S).replace("&nbsp;", " ")
        hit = re.search(r"\{\{\s*time interval\s*\|([^|}]+)\|([^|}]+)", text, flags=re.I)
        if hit:
            ends = []
            for value in hit.groups():
                value = re.sub(r"\s*(UTC|GMT)\s*$", "", value.replace(",", " ").strip())
                value = re.sub(r"\s+", " ", value).replace("Sept ", "Sep ")
                for fmt in ("%d %B %Y %H:%M:%S", "%d %B %Y %H:%M", "%B %d %Y %H:%M:%S", "%B %d %Y %H:%M",
                            "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
                            "%d %b %Y %H:%M:%S", "%d %b %Y %H:%M"):
                    try:
                        ends.append(dt.datetime.strptime(value, fmt))
                        break
                    except ValueError:
                        pass
            if len(ends) == 2 and ends[1] > ends[0]:
                minutes = int((ends[1] - ends[0]).total_seconds() // 60)
                days, rest = divmod(minutes, 1440)
                parts = [(days, "d"), (rest // 60, "h"), (rest % 60, "min")]
                if days:
                    parts = parts[:2]
                return " ".join("%d %s" % p for p in parts if p[0])
            return ""
        text = re.sub(r"\{\{[^{}]*\}\}", " ", text)
        parts = []
        for unit, label in ((r"d(ays?)?\b", "d"), (r"h(ours?|rs?)?\b", "h"), (r"m(in(ute)?s?)?\b", "min")):
            hit = re.search(r"(\d[\d,.]*)\s*" + unit, text, flags=re.I)
            if hit:
                parts.append(hit.group(1).replace(",", "") + " " + label)
        return " ".join(parts)

    def file_key(name):
        """'Soyuz_TM-2_patch.jpg' and 'Soyuz TM-2 patch.jpg' are the same file."""
        name = (name or "").replace("_", " ").strip()
        return name[:1].upper() + name[1:]

    info_by_key = {file_key(k): v for k, v in file_info.items()}
    LOOKS_LIKE_PATCH = re.compile(r"patch|insignia|emblem|logo|badge|эмблема", re.I)
    MISSION_NUMBER = re.compile(r"\b(soyuz(?: ms| tma| tm| t)?|sts|apollo|gemini|shenzhou|vostok|voskhod|"
                                r"mercury(?: atlas| redstone)?|союз)\s*(\d+)", re.I)

    def other_mission(name, mission):
        """The file is named after another flight ('USSR stamp Soyuz-12' for Soyuz 18a,
        'Soyuz MS-09 backup crew' for Soyuz MS-11)."""
        def numbers(text):
            text = re.sub(r"[_\-.]", " ", text or "").lower()
            text = re.sub(r"(soyuz|союз)\s+(?=(ms|tma|tm|t)\s*\d)", r"\1 ", text)
            return {(re.sub(r"\s+", " ", a), n) for a, n in MISSION_NUMBER.findall(text)}
        own, named = numbers(mission), numbers(name)
        if not own or not named:
            return False
        same_kind = [(kind, n, m) for kind, n in named for own_kind, m in own if kind == own_kind]
        if not same_kind:
            return False
        def same(n, m):     # 'Soyuz45-1.jpg' (Soyuz 4 docked to Soyuz 5) belongs to both
            n, m = n.lstrip("0") or "0", m.lstrip("0") or "0"
            return n == m or (len(m) == 1 and n in (m + str(int(m) + 1), str(int(m) - 1) + m))
        return not any(same(n, m) for _, n, m in same_kind)

    def free_image(name, prefix):
        """Thumbnail, credit and file page of a free image (non-free files are skipped:
        Wikipedia may use them under fair use, this site may not)."""
        info = file_info.get(name or "") or info_by_key.get(file_key(name))
        if not info or info.get("nonfree"):
            return {}
        credit = " · ".join(x for x in (info.get("artist", ""), info.get("license", "")) if x)
        return {prefix + " URL": info["thumb"], prefix + " Credit": credit[:160], prefix + " Page": info.get("page", "")}

    def article_url(title):
        return ("https://en.wikipedia.org/wiki/" + title.replace(" ", "_")) if title else ""

    mission_q = {label: q for q, label in new_missions.items()}
    mission_q.update(legacy_to_wd)
    for row in missions_out:
        q = mission_q.get(row["Launch Mission"])
        m = wd_missions.get(q, {}) if q else {}
        # a mission without its own article (Soyuz 19) can be pointed at one
        title = override(row["Launch Mission"], "*", "wikipedia") or (article(m) if m else None)
        if not title:
            continue
        box = parse_infobox(mission_boxes.get(title or "", ""))
        row["Rocket"] = short(box.get("launch_rocket")) or first(m.get("vehicle", []))
        row["Spacecraft"] = short(box.get("spacecraft") or box.get("shuttle") or box.get("spacecraft_type"))
        if not row["Rocket"] and box.get("shuttle"):
            row["Rocket"] = "Space Shuttle"
        row["Launch Site"] = short(box.get("launch_site"))
        row["Landing Site"] = short(box.get("landing_site") or box.get("landing_zone"))
        row["Callsign"] = short(box.get("crew_callsign"), 40).strip("-–— \"'()")
        row["Flight Time"] = flight_time(box.get("mission_duration"))
        row["Operator"] = short(box.get("operator")) or first(m.get("operator", []))
        row["Wikipedia"] = article_url(title)
        intro = re.sub(r"\s*\([^()]*\)", "", extracts.get(title or "", ""))
        row["Description"] = re.sub(r"\s+", " ", intro).strip()[:700]
        # Images, free ones only, from several places in order. The patch:
        # infobox 'insignia', then Wikidata's logo. The photo: infobox 'image',
        # the crew photo, the article's lead image, Wikidata's image; never the
        # patch (the lead image of many Soyuz articles is the patch).
        files = mission_files.get(title or "", {})
        patch_names = [files.get("insignia")] + m.get("commons_logo", [])
        photo_names = [files.get("image"), files.get("crew_photo"),
                       images.get(title or "", {}).get("file")] + m.get("commons_image", [])
        patch, patch_file = {}, None
        for name in patch_names:
            patch = free_image(name, "Patch")
            if patch:
                patch_file = file_key(name)
                break
        photo = {}
        for name in photo_names:
            if not name or file_key(name) == patch_file:
                continue
            if other_mission(name, row["Launch Mission"]):
                continue
            if LOOKS_LIKE_PATCH.search(name):
                if not patch:            # a patch found in the wrong field is still the patch
                    patch = free_image(name, "Patch")
                    patch_file = file_key(name) if patch else None
                continue
            photo = free_image(name, "Photo")
            if photo:
                break
        row.update(photo)
        row.update(patch)

    for a in astronauts_out:
        q = by_name_q.get(a["Name"])
        if not q or q not in people:
            continue
        title = article(people[q])
        box = wikipedia_details(q)
        a["Agency"] = short(box.get("type"), 50)
        bio = person_extracts.get(title or "", "")
        bio = re.sub(r"\s*\([^()]*\)", "", bio)          # drop "(born ...; Russian: ...)"
        a["Bio"] = re.sub(r"\s+", " ", bio).strip()[:600]
        a["Wikipedia"] = article_url(title)
        # portrait: the lead image, the infobox image, Wikidata's image (free only)
        for name in [images.get(title or "", {}).get("file"), person_files.get(title or "")] + \
                people[q].get("commons_image", []):
            photo = free_image(name, "Photo")
            if photo:
                a.update(photo)
                break

    link_people_and_missions(missions_out, astronauts_out)
    write_csv(os.path.join(DATA, "missions.csv"), missions_out, MISSION_COLUMNS)
    write_csv(os.path.join(DATA, "all_astronauts.csv"), astronauts_out, ASTRONAUT_COLUMNS)

    audit = make_audit(missions_out, astronauts_out)
    with open(os.path.join(DATA, "audit.json"), "w", encoding="utf-8") as f:
        json.dump(audit, f, ensure_ascii=False, indent=1)
    log("audit: %d crew members without astronaut record, %d astronauts with missing fields"
        % (len(audit["crew_without_record"]), len(audit["astronauts_with_gaps"])))

    fetched = load_json("meta.json", {}).get("fetched_at", "")
    meta = {
        "built_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fetched_at": fetched,
        "missions": len({r["Launch Mission"] for r in missions_out}),
        "new_missions": len({r["Launch Mission"] for r in new_rows}),
        "astronauts": len(astronauts_out),
        "last_launch": max(r["Launch Data"] for r in missions_out),
    }
    with open(os.path.join(DATA, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    log(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
