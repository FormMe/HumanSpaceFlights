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
                   "Return Data", "Return Mission", "Year"]
ASTRONAUT_COLUMNS = ["Name", "Year", "Status", "Birth Date", "Birth Place", "Gender",
                     "Alma Mater", "Military Rank", "Military Branch", "Space Flights",
                     "Space Flight (hr)", "Space Walks", "Space Walks (hr)", "Missions",
                     "Death Date", "Death Mission", "Country", "Nationality"]

# Not orbital human spaceflights: kept out, like in the original dataset.
SUBORBITAL = re.compile(
    r"new shepard|blue origin|\bns-\d|virgin galactic|galactic \d|unity \d|spaceship|"
    r"x-15|mercury-redstone|suborbital|sub-orbital", re.I)

TODAY = dt.date.today()


def log(*args):
    print(*args, file=sys.stderr)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def read_csv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


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
    return score


def wd_date(value):
    return value[:10] if value else ""


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


def nationality(names):
    cleaned = []
    for n in names:
        n = {"United States of America": "United States",
             "People's Republic of China": "China",
             "Soviet Union": "USSR",
             "Kingdom of the Netherlands": "Netherlands"}.get(n, n)
        if n not in cleaned:
            cleaned.append(n)
    return " / ".join(cleaned)


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
    if not text or mwparserfromhell is None:
        return {}
    try:
        code = mwparserfromhell.parse(text)
        tpl = code.filter_templates(recursive=False)[0]
    except (IndexError, ValueError):
        return {}
    out = {}
    for p in tpl.params:
        key = str(p.name).strip().lower().replace(" ", "_")
        out[key] = str(p.value).strip()
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
    raw = raw.replace("&nbsp;", " ")
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


def status_from(raw, death):
    if death:
        return "Deceased"
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
    m = re.search(r"\{\{\s*(?:start|end|launch|landing)?[ -]?date(?: and age)?\s*\|"
                  r"(?:[^|}]*=[^|}]*\|)*\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", raw, re.I)
    if m:
        y, mo, d = (int(x) for x in m.groups())
    else:
        text = plain(raw).lower()
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


def main():
    legacy_missions = read_csv(os.path.join(SOURCE, "missions_legacy.csv"))
    legacy_astronauts = read_csv(os.path.join(SOURCE, "astronauts_legacy.csv"))
    links = load_json("wikidata_links.json", [])
    people = load_json("wikidata_people.json", {})
    wd_missions = load_json("wikidata_missions.json", {})
    infoboxes = load_json("wikipedia_infoboxes.json", {})
    mission_boxes = load_json("wikipedia_mission_infoboxes.json", {})
    title_ids = load_json("wikipedia_title_ids.json", {})
    extracts = load_json("wikipedia_extracts.json", {})
    overrides = load_overrides()

    if not wd_missions:
        log("no raw data in data/raw - run scripts/fetch_data.py first")

    def article(item):
        url = first(item.get("article", []))
        if not url:
            return None
        from urllib.parse import unquote
        return unquote(url.rsplit("/wiki/", 1)[-1]).replace("_", " ")

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

    launch_crew, landing_crew, launch_date, landing_date = {}, {}, {}, {}
    for q, m in wd_missions.items():
        box = mission_boxes.get(article(m) or "") or ""
        raw_launching = field_raw(box, "launching")
        raw_landing = field_raw(box, "landing")
        raw_members = field_raw(box, "crew_members")

        def ids(raw):
            return {title_ids[t] for t in link_titles(raw) if t in title_ids and is_person(title_ids[t])}

        if raw_launching is not None or raw_members is not None:
            up = ids(raw_launching) if raw_launching is not None else ids(raw_members)
            down = ids(raw_landing) if raw_landing is not None else set(up)
            if raw_launching is None and not up:
                up = {p for p in link_people[q] if is_person(p)}
                down = set(up)
        else:
            up = {p for p in link_people[q] if is_person(p)}
            down = set(up)
        launch_crew[q], landing_crew[q] = up, down

        wd_launch = wd_date(min(m["launch"]))
        launch_date[q] = wiki_date(field_raw(box, "launch_date")) or wd_launch
        if abs((parse_date(launch_date[q]) - parse_date(wd_launch)).days) > 3:
            launch_date[q] = wd_launch   # infobox shows a different (e.g. planned) date
        landing = wiki_date(field_raw(box, "landing_date"))
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

    def best_name(candidates, person):
        names = [n for n in [first(person.get("label", []))] + person.get("alt_labels", []) if n]
        best, best_score = None, 0
        for cand in candidates:
            score = max([same_person(cand, n) for n in names] or [0])
            if score > best_score:
                best, best_score = cand, score
        return best if best_score >= 3 else None

    person_name = {}       # qid -> name used in the CSV files
    for q, person in people.items():
        if not is_person(q):
            continue
        label = first(person["label"])
        legacy_names = []
        for m in person_links[q]:
            if m in wd_to_legacy:
                legacy_names += legacy_crew[wd_to_legacy[m]]
        name = best_name(set(legacy_names), person) if legacy_names else None
        if name is None and q in new_flyers:
            name = best_name(legacy_astr_by_name.keys(), person)
            if name and same_person(name, label) < 3:
                name = None
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
        """Mission on which person p came back after launching on mission q."""
        later = [b for b in wd_missions if p in landing_crew.get(b, ())
                 and launch_date.get(b) and launch_date[b] >= launch_date[q]]
        if not later or q in later:
            return q
        return min(later, key=lambda b: launch_date[b])

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
                mission_duration[(label, member)] = float(days) if days else None

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
        if q:
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
            if new_flights:
                a["Missions"] = ", ".join(old + [m for m in new_flights if m not in old])
                a["Space Flights"] = str(len(old) + len([m for m in new_flights if m not in old]))
                hours = duration_hours(box.get("time"))
                if hours is None and person.get("time_in_space_s"):
                    hours = float(first(person["time_in_space_s"])) / 3600
                if hours is None:
                    hours = float(a["Space Flight (hr)"] or 0) + sum(
                        (mission_duration.get((m, a["Name"])) or 0) * 24 for m in new_flights)
                a["Space Flight (hr)"] = fmt_number(max(hours, float(a["Space Flight (hr)"] or 0)))
                st = status_from(box.get("status"), a["Death Date"])
                a["Status"] = st or "Active"
            elif not a["Death Date"]:
                st = status_from(box.get("status"), "")
                if st and a["Status"] != "Management":
                    a["Status"] = st
            evas = first_int(box.get("eva1", ""))
            if evas is not None and evas > float(a["Space Walks"] or 0):
                a["Space Walks"] = str(evas)
                eva_hours = duration_hours(box.get("eva2"))
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
        hours = duration_hours(box.get("time"))
        if hours is None and person.get("time_in_space_s"):
            hours = float(first(person["time_in_space_s"])) / 3600
        if hours is None:
            durations = [mission_duration.get((m, name)) for m in flights]
            hours = sum(d or 0 for d in durations) * 24
        evas = first_int(box.get("eva1", "")) or 0
        eva_hours = duration_hours(box.get("eva2")) or 0
        status = status_from(box.get("status"), death)
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
            "Alma Mater": plain(box.get("alma_mater", "")).replace("\n", "; ")
                          or "; ".join(person.get("educated_at", [])[:3]),
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
        })
        seen.add(name)

    write_csv(os.path.join(DATA, "missions.csv"), missions_out, MISSION_COLUMNS)
    write_csv(os.path.join(DATA, "all_astronauts.csv"), astronauts_out, ASTRONAUT_COLUMNS)

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
