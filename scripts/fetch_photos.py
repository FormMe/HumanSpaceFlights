#!/usr/bin/env python3
"""Download photos and mission patches into small packs the page loads lazily.

Stage 3 of the data pipeline (needs internet access), after build_data.py:

    python scripts/fetch_photos.py

Reads the "Photo URL" / "Patch URL" columns of data/missions.csv and
data/all_astronauts.csv (free Wikimedia images chosen by build_data.py),
downloads the thumbnails, shrinks them to WebP and stores them as data URIs
in data/photos/pack-*.json, with data/photos/index.json mapping each key
("a:<astronaut>", "m:<mission>", "p:<mission patch>") to its pack. Portraits
and patches also get a tiny copy ("t:a:<astronaut>", "t:p:<mission>") for
avatars and tooltips; mission photos get one too ("t:m:<mission>"): the page loads
all tiny copies up front and shows one at once while the big image loads.

Only new or changed images are downloaded; images no longer used are dropped.
A few hundred small files would not fit the limits of every host, so the
images are packed: the page fetches a pack only when it shows a photo from it.
"""

import base64
import csv
import glob
import io
import json
import os
import sys
import time
import zlib

import requests
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "photos")
# packs per kind: mission photos are the biggest, so they get many small packs
PACKS = {"m": 128, "a": 16, "p": 8, "t": 6}
# longest side kept per kind, about 2x the size shown on a phone or a retina
# screen: mission photos fill the details card, portraits sit next to the
# name, patches are badges, "t" are avatars in lists and tooltips
MAX_SIDE = {"m": 800, "a": 480, "p": 320, "t": 112}
# a tiny copy of a mission photo is shown blurred over the full card width
# while the big one loads, so a few more pixels are worth it
TINY_SIDE = {"m": 160}
QUALITY = {"m": 76, "a": 78, "p": 80, "t": 72}

session = requests.Session()
session.headers.update({"User-Agent": "HumanSpaceFlightsBot/1.0 "
                                      "(https://github.com/FormMe/HumanSpaceFlights; data visualization project)"})


def log(*args):
    print(*args, file=sys.stderr, flush=True)


def wanted():
    keys = {}
    with open(os.path.join(DATA, "missions.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("Photo URL"):
                keys["m:" + r["Launch Mission"]] = r["Photo URL"]
            if r.get("Patch URL"):
                keys["p:" + r["Launch Mission"]] = r["Patch URL"]
    with open(os.path.join(DATA, "all_astronauts.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("Photo URL"):
                keys["a:" + r["Name"]] = r["Photo URL"]
    return keys


def pack_of(key):
    kind = key[0]
    return "%s%02d" % (kind, zlib.crc32(key.encode("utf-8")) % PACKS[kind])


def load_existing():
    have = {}
    for path in glob.glob(os.path.join(OUT, "pack-*.json")):
        with open(path, encoding="utf-8") as f:
            have.update(json.load(f))
    return have


def download(url):
    for attempt in range(5):
        try:
            resp = session.get(url, timeout=60)
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError("HTTP %s" % resp.status_code)
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as err:
            wait = 2 ** (attempt + 1)
            log("  %s: %s, retry in %ss" % (url.rsplit("/", 1)[-1][:60], err, wait))
            time.sleep(wait)
    return None


def shrink(raw, kind, side=None):
    img = Image.open(io.BytesIO(raw))
    img.load()
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() or img.info.get("transparency") is not None else "RGB")
    side = side or MAX_SIDE[kind]
    img.thumbnail((side, side), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=QUALITY[kind], method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main():
    os.makedirs(OUT, exist_ok=True)
    keys = wanted()
    have = load_existing()
    result, fetched, failed = {}, 0, 0
    for key, url in sorted(keys.items()):
        small = "t:" + key       # tiny copy: instant preview, avatars, tooltips
        old, old_small = have.get(key), have.get(small) if small else None
        # reuse when the source and the size are the same as last time
        if (old and old.get("src") == url and old.get("side") == MAX_SIDE[key[0]]
                and (not small or (old_small and old_small.get("src") == url))):
            result[key] = old
            if small:
                result[small] = old_small
            continue
        raw = download(url)
        time.sleep(0.25)          # be gentle with upload.wikimedia.org
        if not raw:
            failed += 1
            if old:
                result[key] = old
            if old_small:
                result[small] = old_small
            continue
        try:
            result[key] = {"src": url, "side": MAX_SIDE[key[0]], "data": shrink(raw, key[0])}
            if small:
                tiny = TINY_SIDE.get(key[0], MAX_SIDE["t"])
                result[small] = {"src": url, "side": tiny, "data": shrink(raw, "t", tiny)}
            fetched += 1
        except Exception as err:          # broken or unsupported image
            log("  skip %s: %s" % (key, err))
            failed += 1
    packs = {}
    for key in sorted(result):
        packs.setdefault(pack_of(key), {})[key] = result[key]
    for path in glob.glob(os.path.join(OUT, "pack-*.json")):
        os.remove(path)
    for name, pack in packs.items():
        with open(os.path.join(OUT, "pack-%s.json" % name), "w", encoding="utf-8") as f:
            json.dump(pack, f, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({k: pack_of(k) for k in sorted(result)}, f, ensure_ascii=False, separators=(",", ":"))
    size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, "pack-*.json")))
    log("photos: %d wanted, %d downloaded, %d reused, %d failed, %.1f MB in %d packs"
        % (len(keys), fetched, len(keys) - fetched - failed, failed, size / 1e6, len(packs)))


if __name__ == "__main__":
    main()
