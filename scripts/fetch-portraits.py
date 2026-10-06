#!/usr/bin/env python3
"""Download freely licensed candidate portraits from Wikimedia Commons.

A portrait is kept only when the Wikipedia article matches the candidate's
name and state, and the file license allows reuse (public domain, CC0,
CC BY, or CC BY-SA). Fair-use images are skipped.
"""

from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "portraits"
OUT_JSON = ROOT / "src" / "data" / "portraits.json"
PROGRESS = ROOT / "scripts" / ".portrait-progress.json"

UA = "BallotIQ/1.0 (https://github.com/roconnell-code/BallotIQ; candidate portraits)"
API = "https://en.wikipedia.org/w/api.php"

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

NICKNAMES = {
    "dan": "daniel", "danny": "daniel", "tom": "thomas", "tommy": "thomas",
    "bill": "william", "billy": "william", "will": "william", "bob": "robert",
    "bobby": "robert", "rob": "robert", "mike": "michael", "mikey": "michael",
    "jim": "james", "jimmy": "james", "jamie": "james", "joe": "joseph",
    "joey": "joseph", "chris": "christopher", "matt": "matthew",
    "jeff": "jeffrey", "dave": "david", "steve": "steven", "stephen": "steven",
    "nick": "nicholas", "ben": "benjamin", "sam": "samuel", "alex": "alexander",
    "pat": "patrick", "tony": "anthony", "rick": "richard", "dick": "richard",
    "chuck": "charles", "charlie": "charles", "ted": "theodore", "ed": "edward",
    "eddie": "edward", "ken": "kenneth", "kenny": "kenneth", "don": "donald",
    "ron": "ronald", "ronnie": "ronald", "andy": "andrew", "drew": "andrew",
    "gabe": "gabriel", "abby": "abigail", "kate": "katherine", "katie": "katherine",
    "kathy": "katherine", "liz": "elizabeth", "beth": "elizabeth",
    "jack": "john", "johnny": "john", "jerry": "gerald", "gerry": "gerald",
    "jon": "jonathan", "nate": "nathaniel", "tim": "timothy", "zach": "zachary",
    "zack": "zachary", "peggy": "margaret", "maggie": "margaret",
    "sue": "susan", "cindy": "cynthia", "becky": "rebecca", "debbie": "deborah",
    "deb": "deborah", "cathy": "catherine", "greg": "gregory", "doug": "douglas",
    "pete": "peter", "phil": "philip", "hal": "harold", "hank": "henry",
    "harry": "henry", "larry": "lawrence", "terry": "terrence", "ray": "raymond",
    "fred": "frederick", "freddy": "frederick", "bert": "albert", "al": "albert",
    "sandy": "sandra", "jen": "jennifer", "jenny": "jennifer", "jess": "jessica",
    "mandy": "amanda", "vicky": "victoria", "vicki": "victoria", "tony": "anthony",
}

POLITICAL = (
    "politician", "senator", "senate", "representative", "congress",
    "governor", "mayor", "legislature", "assembly", "democrat", "republican",
    "candidate", "house of representatives", "attorney general", "secretary of state",
    "lieutenant governor", "state senator", "state representative",
)

SKIP_IMAGE = (
    "flag", "seal", "logo", "map", "signature", "coat_of_arms", "coa",
    "ballot", "election", "placeholder", "question", "no_free_image",
    "disambiguation", "wordmark", "banner", "campaign_logo",
)


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def strip_html(value: str) -> str:
    parser = TextExtractor()
    parser.feed(html.unescape(value or ""))
    return re.sub(r"\s+", " ", "".join(parser.parts)).strip()


def strip_suffix(name: str) -> list[str]:
    parts = name.replace(",", " ").split()
    suffixes = {"jr", "sr", "ii", "iii", "iv"}
    while len(parts) > 2 and parts[-1].lower().rstrip(".") in suffixes:
        parts.pop()
    return parts


def last_name(name: str) -> str:
    parts = strip_suffix(name)
    return parts[-1].lower() if parts else ""


def middle_initial(name: str) -> str | None:
    parts = strip_suffix(name)
    if len(parts) >= 3 and len(parts[1].rstrip(".")) == 1:
        return parts[1].rstrip(".").lower()
    return None


def first_token(name: str) -> str:
    parts = strip_suffix(name)
    return parts[0].lower().rstrip(".") if parts else ""


def api_get(params: dict) -> dict:
    params = {"format": "json", **params}
    url = API + "?" + urllib.parse.urlencode(params)
    delay = 1.0
    last_error = None
    for _ in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(last_error)


def download(url: str) -> tuple[bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=40) as response:
        data = response.read()
        mime = response.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
    return data, mime


def collect_candidates() -> list[dict]:
    senate = json.loads((ROOT / "src/data/senate.json").read_text())
    governors = json.loads((ROOT / "src/data/governors.json").read_text())
    house = json.loads((ROOT / "src/data/house.json").read_text())
    future = json.loads((ROOT / "src/data/future.json").read_text())
    people = []

    def add(name, abbr):
        if not name or abbr not in STATES:
            return
        people.append({"name": name, "state": abbr, "state_name": STATES[abbr]})

    for race in senate:
        for candidate in race["candidates"]:
            add(candidate["name"], race["state"])
    for race in governors:
        for candidate in race["candidates"]:
            add(candidate["name"], race["state"])
    for abbr, districts in house.items():
        for district in districts:
            for candidate in district["candidates"]:
                add(candidate["name"], abbr)
    for cycle in future["cycles"]:
        for race in cycle["senate"] + cycle["governors"]:
            for candidate in race.get("candidates") or []:
                add(candidate["name"], race["state"])

    unique = {}
    for person in people:
        unique[(person["name"], person["state"])] = person
    return list(unique.values())


def state_in_text(state_name: str, blob: str) -> bool:
    if state_name.lower() in blob:
        return True
    if state_name == "District of Columbia":
        return any(token in blob for token in ("district of columbia", "washington, d.c", "d.c. mayor"))
    return False


def first_name_ok(name: str, blob: str) -> bool:
    first = first_token(name)
    if len(first) <= 1:
        return True
    if re.search(rf"\b{re.escape(first)}\b", blob):
        return True
    formal = NICKNAMES.get(first)
    if formal and re.search(rf"\b{re.escape(formal)}\b", blob):
        return True
    return False


def middle_ok(name: str, extract: str) -> bool:
    initial = middle_initial(name)
    if not initial:
        return True
    opening = extract.split(".")[0]
    if re.search(rf"\b{initial}\b\.?", opening, re.I):
        return True
    tokens = re.findall(r"[A-Za-z][A-Za-z'’-]+", opening)
    last = last_name(name)
    first = first_token(name)
    formal = NICKNAMES.get(first, first)
    for token in tokens:
        low = token.lower()
        if low in {first, formal, last}:
            continue
        if low[:1] == initial and low not in {"is", "an", "of", "the", "and", "born"}:
            return True
    return False


def page_ok(page: dict, person: dict) -> bool:
    title = page.get("title") or ""
    if "disambiguation" in title.lower():
        return False
    blob = " ".join([
        title,
        page.get("extract") or "",
        " ".join((page.get("terms") or {}).get("description") or []),
    ]).lower()
    if last_name(person["name"]) not in title.lower():
        return False
    if not any(word in blob for word in POLITICAL):
        return False
    if not state_in_text(person["state_name"], blob):
        return False
    if not first_name_ok(person["name"], blob):
        return False
    if not middle_ok(person["name"], page.get("extract") or ""):
        return False
    image = (page.get("pageimage") or "").lower()
    if not image:
        return False
    if image.endswith(".svg") or image.endswith(".gif") or image.endswith(".tif"):
        return False
    if any(token in image for token in SKIP_IMAGE):
        return False
    thumb = page.get("thumbnail") or {}
    width = thumb.get("width") or 0
    height = thumb.get("height") or 0
    if width and height and width > height * 1.45:
        return False
    return True


def lookup(person: dict) -> dict | None:
    query = f"\"{person['name']}\" {person['state_name']}"
    payload = api_get({
        "action": "query",
        "generator": "search",
        "gsrsearch": query,
        "gsrlimit": "4",
        "gsrnamespace": "0",
        "prop": "pageimages|extracts|pageterms",
        "piprop": "thumbnail|name",
        "pithumbsize": "240",
        "exintro": "1",
        "explaintext": "1",
        "exchars": "500",
        "wbptterms": "description",
    })
    pages = list((payload.get("query") or {}).get("pages", {}).values())
    pages.sort(key=lambda page: page.get("index", 99))
    for page in pages:
        if page_ok(page, person):
            thumb = page.get("thumbnail") or {}
            return {
                "name": person["name"],
                "state": person["state"],
                "title": page.get("title"),
                "pageimage": page.get("pageimage"),
                "thumb": thumb.get("source"),
            }
    return None


def license_ok(short_name: str, license_id: str) -> bool:
    blob = f"{short_name} {license_id}".lower()
    if any(token in blob for token in ("non-free", "fair use", "fairuse", "all rights reserved")):
        return False
    allowed = (
        "cc-by-sa", "cc by-sa", "cc-by", "cc by", "cc0", "cc-zero", "cc zero",
        "public domain", "pd-", "gfdl", "no restrictions", "copyrighted free use",
    )
    return any(token in blob for token in allowed)


def review_files(found: list[dict]) -> dict[str, dict]:
    files = {}
    for item in found:
        files.setdefault(item["pageimage"], []).append(item)
    names = list(files)
    reviewed = {}
    for start in range(0, len(names), 20):
        batch = names[start:start + 20]
        payload = api_get({
            "action": "query",
            "titles": "|".join(f"File:{name}" for name in batch),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|mime|size",
        })
        for page in (payload.get("query") or {}).get("pages", {}).values():
            title = (page.get("title") or "").removeprefix("File:").replace(" ", "_")
            info = (page.get("imageinfo") or [None])[0]
            if not info:
                continue
            meta = info.get("extmetadata") or {}
            short_name = strip_html((meta.get("LicenseShortName") or {}).get("value", ""))
            license_id = strip_html((meta.get("License") or {}).get("value", ""))
            if not license_ok(short_name, license_id):
                continue
            artist = strip_html((meta.get("Artist") or {}).get("value", ""))
            artist = re.sub(r"\s+", " ", artist)
            if len(artist) > 80:
                artist = artist.split(",")[0].strip()
            reviewed[title] = {
                "license": short_name or license_id,
                "credit": artist or "Wikimedia Commons",
                "file": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(title.replace(" ", "_")),
                "mime": info.get("mime") or "",
            }
        time.sleep(0.2)
    return reviewed


def slug(name: str, state: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{base}-{state.lower()}"


def extension_for(mime: str, url: str) -> str:
    if "png" in mime or url.lower().split("?")[0].endswith(".png"):
        return "png"
    if "webp" in mime or url.lower().split("?")[0].endswith(".webp"):
        return "webp"
    return "jpg"


def main() -> None:
    people = collect_candidates()
    progress = {}
    if PROGRESS.exists():
        progress = json.loads(PROGRESS.read_text())
    pending = [person for person in people if f"{person['name']}|{person['state']}" not in progress]
    print(f"candidates {len(people)} cached {len(progress)} pending {len(pending)}", flush=True)

    def task(person: dict):
        key = f"{person['name']}|{person['state']}"
        try:
            return key, lookup(person)
        except Exception as error:  # noqa: BLE001
            return key, {"error": str(error)}

    done = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(task, person) for person in pending]
        for future in as_completed(futures):
            key, result = future.result()
            progress[key] = result
            done += 1
            if done % 25 == 0 or done == len(pending):
                PROGRESS.write_text(json.dumps(progress))
                found = sum(1 for value in progress.values() if isinstance(value, dict) and value.get("pageimage"))
                print(f"looked up {done}/{len(pending)} matched {found}", flush=True)

    found = [value for value in progress.values() if isinstance(value, dict) and value.get("pageimage")]
    print(f"reviewing {len({item['pageimage'] for item in found})} files", flush=True)
    reviewed = review_files(found)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    portraits = {}
    saved = 0
    skipped_license = 0
    for item in found:
        meta = reviewed.get(item["pageimage"])
        if not meta or not item.get("thumb"):
            skipped_license += 1
            continue
        ext = extension_for(meta["mime"], item["thumb"])
        filename = f"{slug(item['name'], item['state'])}.{ext}"
        path = OUT_DIR / filename
        if not path.exists() or path.stat().st_size < 800:
            try:
                data, mime = download(item["thumb"])
            except Exception as error:  # noqa: BLE001
                print("download failed", item["name"], error, flush=True)
                continue
            if len(data) < 800 or len(data) > 450_000:
                continue
            if not mime.startswith("image/"):
                continue
            path.write_bytes(data)
        key = f"{item['name']}|{item['state']}"
        portraits[key] = {
            "src": f"/portraits/{filename}",
            "credit": meta["credit"],
            "license": meta["license"],
            "file": meta["file"],
        }
        saved += 1

    # Same person in one state can share a name key. Mike Rogers is the
    # collision: Alabama's representative and Michigan's Senate candidate.
    by_name: dict[str, list[tuple[str, dict]]] = {}
    for key, record in portraits.items():
        name = key.rsplit("|", 1)[0]
        by_name.setdefault(name, []).append((key, record))

    public = {}
    for name, entries in by_name.items():
        sources = {entry[1]["src"] for entry in entries}
        if len(sources) == 1:
            public[name] = entries[0][1]
        else:
            for key, record in entries:
                public[key] = record

    OUT_JSON.write_text(json.dumps(public, indent=2, ensure_ascii=False) + "\n")
    print(f"saved {len(public)} portraits, license skips {skipped_license}", flush=True)


if __name__ == "__main__":
    main()
