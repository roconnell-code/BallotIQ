"""Build src/data/money.json from the FEC all-candidates file.

Download the current cycle file first:

  curl -fsSL -o /tmp/webl26.zip https://www.fec.gov/files/bulk-downloads/2026/webl26.zip
  unzip -p /tmp/webl26.zip webl26.txt > /tmp/webl26.txt
  python3 scripts/build-fec-money.py /tmp/webl26.txt
"""

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUFFIX = {"jr", "sr", "ii", "iii", "iv", "mr", "mrs", "ms"}
PARTICLES = {"le", "de", "van", "von", "da", "di", "del", "la", "st"}
NICK = {
    "nick": "nicholas", "bob": "robert", "rob": "robert", "bobby": "robert",
    "bill": "william", "will": "william", "billy": "william", "william": "william",
    "jim": "james", "jimmy": "james", "james": "james", "mike": "michael", "michael": "michael",
    "tom": "thomas", "thomas": "thomas", "tommy": "thomas", "dan": "daniel", "danny": "daniel",
    "daniel": "daniel", "dave": "david", "david": "david", "chris": "christopher",
    "christopher": "christopher", "chuck": "charles", "charlie": "charles", "charles": "charles",
    "dick": "richard", "rich": "richard", "rick": "richard", "ricky": "richard", "richard": "richard",
    "joe": "joseph", "joseph": "joseph", "jeff": "jeffrey", "jeffrey": "jeffrey",
    "ben": "benjamin", "benjamin": "benjamin", "pat": "patrick", "patrick": "patrick",
    "tony": "anthony", "anthony": "anthony", "steve": "steven", "steven": "steven", "stephen": "steven",
    "matt": "matthew", "matthew": "matthew", "andy": "andrew", "andrew": "andrew", "drew": "andrew",
    "ted": "theodore", "theo": "theodore", "theodore": "theodore", "ed": "edward", "eddie": "edward",
    "edward": "edward", "ken": "kenneth", "kenneth": "kenneth", "kenny": "kenneth",
    "don": "donald", "donald": "donald", "ron": "ronald", "ronald": "ronald",
    "jerry": "gerald", "gerry": "gerald", "gerald": "gerald", "liz": "elizabeth", "beth": "elizabeth",
    "elizabeth": "elizabeth", "kate": "katherine", "kathy": "katherine", "cathy": "katherine",
    "katie": "katherine", "katherine": "katherine", "catherine": "katherine",
    "jen": "jennifer", "jenny": "jennifer", "jennifer": "jennifer", "sue": "susan", "susan": "susan",
    "sam": "samuel", "samuel": "samuel", "alex": "alexander", "alexander": "alexander",
    "al": "alan", "alan": "alan", "greg": "gregory", "gregory": "gregory",
    "tim": "timothy", "timothy": "timothy", "josh": "joshua", "joshua": "joshua",
    "jon": "jonathan", "john": "john", "jonathan": "jonathan", "jack": "john",
    "angie": "angela", "angela": "angela", "doug": "douglas", "douglas": "douglas",
    "nate": "nathan", "nathan": "nathan", "peggy": "margaret", "meg": "margaret",
    "margaret": "margaret", "maggie": "margaret",
}


def strip_marks(value):
    value = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in value if not unicodedata.combining(ch))


def canon(word):
    return NICK.get(word.lower(), word.lower())


def tokens(value):
    return [token for token in re.findall(r"[A-Za-z]+", strip_marks(value)) if token.lower() not in SUFFIX]


def our_name(name):
    words = tokens(name)
    last_words = [words[-1]]
    given = words[:-1]
    while given and given[-1].lower() in PARTICLES:
        last_words.insert(0, given.pop())
    first = canon(given[0]) if given else ""
    middles = [word[0].lower() for word in given[1:]]
    last = "".join(word.lower() for word in last_words)
    return first, middles, last


def fec_name(name):
    last, _, rest = strip_marks(name).partition(",")
    given = [canon(word) for word in tokens(rest)]
    last_words = [word.lower() for word in tokens(last)]
    middles = [word[0].lower() for word in tokens(rest)[1:]]
    return given, middles, "".join(last_words), last_words


def number(fields, index):
    if index >= len(fields) or not fields[index]:
        return 0.0
    try:
        return float(fields[index])
    except ValueError:
        return 0.0


def shares(amounts):
    total = sum(amounts)
    if total <= 0:
        return [0, 0, 0]
    raw = [100 * amount / total for amount in amounts]
    floors = [int(value) for value in raw]
    leftover = 100 - sum(floors)
    order = sorted(range(3), key=lambda index: raw[index] - floors[index], reverse=True)
    for index in order[:leftover]:
        floors[index] += 1
    return floors


def similar(our_first, given):
    for word in given:
        if our_first == word:
            return True
        short, long = (our_first, word) if len(our_first) <= len(word) else (word, our_first)
        if len(short) >= 3 and long.startswith(short):
            return True
        if len(short) >= 2 and len(long) >= 4 and long.startswith(short):
            return True
    return False


def load_fec(path):
    rows = []
    for line in Path(path).read_text().splitlines():
        fields = line.split("|")
        if len(fields) < 28 or fields[0][:1] not in "SH":
            continue
        given, middles, last, last_words = fec_name(fields[1])
        rows.append({
            "id": fields[0],
            "raw": fields[1],
            "office": "senate" if fields[0][0] == "S" else "house",
            "state": fields[18],
            "district": str(int(fields[19])) if fields[19].isdigit() else fields[19],
            "given": given,
            "mids": middles,
            "last": last,
            "last_words": last_words,
            "first": given[0] if given else "",
            "receipts": number(fields, 5),
            "transfers": max(0, number(fields, 6)),
            "self": max(0, number(fields, 11)),
            "loans": max(0, number(fields, 12)) + max(0, number(fields, 13)),
            "indiv": max(0, number(fields, 17) - number(fields, 28)),
            "pacs": max(0, number(fields, 25)),
            "party_amt": max(0, number(fields, 26)),
            "through": fields[27],
        })
    grouped = {}
    for row in rows:
        middle = row["mids"][0] if row["mids"] else ""
        key = (row["office"], row["state"], row["district"], row["last"], row["first"], middle)
        if key not in grouped or row["receipts"] > grouped[key]["receipts"]:
            grouped[key] = row
    return list(grouped.values())


def load_ours():
    senate = json.loads((ROOT / "src/data/senate.json").read_text())
    house = json.loads((ROOT / "src/data/house.json").read_text())
    ours = []
    for race in senate:
        for candidate in race["candidates"]:
            first, middles, last = our_name(candidate["name"])
            ours.append({
                "key": f"senate|{race['state']}|{candidate['name']}",
                "office": "senate",
                "state": race["state"],
                "district": "0",
                "name": candidate["name"],
                "first": first,
                "mids": middles,
                "last": last,
            })
    for state, districts in house.items():
        for district in districts:
            dist = "0" if district["district"] == "at-large" else str(int(district["district"]))
            for candidate in district["candidates"]:
                first, middles, last = our_name(candidate["name"])
                ours.append({
                    "key": f"house|{state}|{district['district']}|{candidate['name']}",
                    "office": "house",
                    "state": state,
                    "district": dist,
                    "name": candidate["name"],
                    "first": first,
                    "mids": middles,
                    "last": last,
                })
    return ours


def score(ours, row):
    if ours["mids"] and row["mids"] and ours["mids"][0] != row["mids"][0]:
        return None
    if ours["last"] == row["last"]:
        value = 10
    elif ours["last"] in row["last_words"] or (len(ours["last"]) > 3 and row["last"].endswith(ours["last"])):
        value = 7
    elif ours["last"] in row["given"]:
        value = 6
    else:
        return None
    if ours["first"] and (ours["first"] == row["first"] or ours["first"] in row["given"]):
        value += 8
    if value < 14:
        return None
    if ours["mids"] and row["mids"] and ours["mids"][0] == row["mids"][0]:
        value += 4
    return value


def breakdown(row):
    individual = row["indiv"]
    pacs = row["pacs"]
    accounted = individual + pacs + row["party_amt"] + row["self"] + row["loans"] + row["transfers"]
    extra = max(0, row["receipts"] - accounted)
    other = row["party_amt"] + row["self"] + row["loans"] + extra
    base = individual + pacs + other
    if base <= 0:
        return None
    individual_pct, pac_pct, other_pct = shares([individual, pacs, other])
    through = ""
    parts = row["through"].split("/")
    if len(parts) == 3 and all(part.isdigit() for part in parts):
        month, day, year = parts
        through = f"{year}-{int(month):02d}-{int(day):02d}"
    return {
        "individual": individual_pct,
        "pacs": pac_pct,
        "other": other_pct,
        "individualDollars": round(individual),
        "pacDollars": round(pacs),
        "otherDollars": round(other),
        "through": through,
    }


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/fec/webl26.txt")
    fec_rows = load_fec(source)
    ours = load_ours()
    by_race = defaultdict(list)
    for row in fec_rows:
        by_race[(row["office"], row["state"], row["district"])].append(row)

    pairs = []
    for index, candidate in enumerate(ours):
        pool = by_race.get((candidate["office"], candidate["state"], candidate["district"]), [])
        found = False
        for row in pool:
            value = score(candidate, row)
            if value:
                pairs.append((value, index, row))
                found = True
        if found:
            continue
        same = [row for row in pool if row["last"] == candidate["last"] or candidate["last"] in row["last_words"]]
        if len(same) == 1 and similar(candidate["first"], same[0]["given"]):
            pairs.append((11, index, same[0]))

    pairs.sort(key=lambda item: -item[0])
    used_candidates = set()
    used_rows = set()
    assigned = {}
    for value, index, row in pairs:
        if index in used_candidates or row["id"] in used_rows:
            continue
        used_candidates.add(index)
        used_rows.add(row["id"])
        assigned[index] = row

    money = {}
    for index, row in assigned.items():
        item = breakdown(row)
        if item:
            money[ours[index]["key"]] = item

    destination = ROOT / "src/data/money.json"
    destination.write_text(json.dumps(money, indent=2) + "\n")
    print(f"matched {len(assigned)} of {len(ours)}; wrote {len(money)} breakdowns to {destination}")


if __name__ == "__main__":
    main()
