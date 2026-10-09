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
import shutil
import sys
import time
import zlib

import requests
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "photos")
# packs per kind: mission photos are the biggest, so they get many small packs
PACKS = {"m": 128, "a": 16, "p": 8, "t": {"m": 1, "p": 1, "a": 2}}
# longest side kept per kind, about 2x the size shown on a phone or a retina
# screen: mission photos fill the details card, portraits sit next to the
# name, patches are badges, "t" are avatars in lists and tooltips
MAX_SIDE = {"m": 800, "a": 480, "p": 320, "t": 112}
# a tiny copy of a mission photo is only shown blurred while the big one
# loads: 72 px is plenty. All tiny copies are loaded with the page, so they
# must stay small (about 1-3 KB each).
TINY_SIDE = {"m": 72}
TINY_VERSION = 3       # bump to re-make the tiny copies from the stored images
QUALITY = {"m": 76, "a": 78, "p": 80, "t": 60}
# that many failed downloads in a row: Wikimedia is down or blocks us, stop
# instead of retrying every image for an hour (the old images are kept)
MAX_FAILURES_IN_A_ROW = 25

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
    h = zlib.crc32(key.encode("utf-8"))
    if key.startswith("t:"):        # tiny copies by kind: "tm00", "tp00", "ta01"
        return "t%s%02d" % (key[2], h % PACKS["t"][key[2]])
    return "%s%02d" % (key[0], h % PACKS[key[0]])


def load_existing():
    have = {}
    for path in glob.glob(os.path.join(OUT, "pack-*.json")):
        with open(path, encoding="utf-8") as f:
            have.update(json.load(f))
    return have


def same_source(a, b):
    """The same file? The query string (utm_* parameters) changes now and then."""
    return bool(a and b) and a.split("?", 1)[0] == b.split("?", 1)[0]


def download(url):
    """The image, or None. Only 429, 5xx and network errors are retried (with
    the server's Retry-After); a 404 or 403 will not get better."""
    name = url.split("?", 1)[0].rsplit("/", 1)[-1][:60]
    for attempt in range(5):
        wait = 2 ** (attempt + 1)
        try:
            resp = session.get(url, timeout=60)
        except (requests.ConnectionError, requests.Timeout) as err:
            log("  %s: %s, retry in %ss" % (name, err, wait))
            time.sleep(wait)
            continue
        if resp.status_code == 429 or resp.status_code >= 500:
            try:
                wait = max(wait, min(int(resp.headers.get("Retry-After", 0)), 120))
            except ValueError:
                pass
            log("  %s: HTTP %s, retry in %ss" % (name, resp.status_code, wait))
            time.sleep(wait)
            continue
        if resp.status_code != 200:
            log("  %s: HTTP %s" % (name, resp.status_code))
            return None
        return resp.content
    return None


def write_packs(result):
    """Write the packs and the index into a new folder, then swap it in: a run
    that dies half way leaves the old photos, not a mix (or nothing)."""
    packs = {}
    for key in sorted(result):
        packs.setdefault(pack_of(key), {})[key] = result[key]
    tmp, old = OUT + ".new", OUT + ".old"
    for path in (tmp, old):
        shutil.rmtree(path, ignore_errors=True)
    os.makedirs(tmp)
    for name, pack in packs.items():
        with open(os.path.join(tmp, "pack-%s.json" % name), "w", encoding="utf-8") as f:
            json.dump(pack, f, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    with open(os.path.join(tmp, "index.json"), "w", encoding="utf-8") as f:
        json.dump({k: pack_of(k) for k in sorted(result)}, f, ensure_ascii=False, separators=(",", ":"))
    if os.path.exists(OUT):
        os.rename(OUT, old)
    os.rename(tmp, OUT)
    shutil.rmtree(old, ignore_errors=True)
    return len(packs)


def shrink(raw, kind, side=None):
    img = Image.open(io.BytesIO(raw))
    img.load()
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() or img.info.get("transparency") is not None else "RGB")
    side = side or MAX_SIDE[kind]
    img.thumbnail((side, side), Image.LANCZOS)
    if kind == "t" and img.mode == "RGBA":
        # tiny copies sit on the dark card: flattened, they are 3x smaller
        flat = Image.new("RGB", img.size, (13, 18, 30))
        flat.paste(img, mask=img.getchannel("A"))
        img = flat
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=QUALITY[kind], method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main():
    os.makedirs(OUT, exist_ok=True)
    keys = wanted()
    have = load_existing()
    result, fetched, failed, in_a_row, gave_up = {}, 0, 0, 0, False
    for key, url in sorted(keys.items()):
        small = "t:" + key       # tiny copy: instant preview, avatars, tooltips
        old, old_small = have.get(key), have.get(small)
        tiny = TINY_SIDE.get(key[0], MAX_SIDE["t"])
        fresh_small = old_small and same_source(old_small.get("src"), url) and old_small.get("v") == TINY_VERSION
        # reuse when the source and the size are the same as last time
        if old and same_source(old.get("src"), url) and old.get("side") == MAX_SIDE[key[0]]:
            result[key] = old
            if fresh_small:
                result[small] = old_small
            else:          # tiny copy from the image we already have, no download
                try:
                    raw = base64.b64decode(old["data"].split(",", 1)[1])
                    result[small] = {"src": url, "side": tiny, "v": TINY_VERSION, "data": shrink(raw, "t", tiny)}
                except Exception as err:
                    log("  tiny %s: %s" % (key, err))
            continue

        def keep_old():
            if old:
                result[key] = old
            if old_small:
                result[small] = old_small

        if gave_up:
            failed += 1
            keep_old()
            continue
        raw = download(url)
        time.sleep(0.25)          # be gentle with upload.wikimedia.org
        if not raw:
            failed += 1
            in_a_row += 1
            keep_old()
            if in_a_row >= MAX_FAILURES_IN_A_ROW:
                log("photos: %d downloads in a row failed, no more downloads in this run" % in_a_row)
                gave_up = True
            continue
        in_a_row = 0
        try:
            big = {"src": url, "side": MAX_SIDE[key[0]], "data": shrink(raw, key[0])}
            result[small] = {"src": url, "side": tiny, "v": TINY_VERSION, "data": shrink(raw, "t", tiny)}
            result[key] = big
            fetched += 1
        except Exception as err:          # broken or unsupported image: the old one stays
            log("  skip %s: %s" % (key, err))
            failed += 1
            result.pop(small, None)
            keep_old()
    count = write_packs(result)
    size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, "pack-*.json")))
    log("photos: %d wanted, %d downloaded, %d reused, %d failed, %.1f MB in %d packs"
        % (len(keys), fetched, len(keys) - fetched - failed, failed, size / 1e6, count))


if __name__ == "__main__":
    main()
