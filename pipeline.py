"""YouTube viewing insights pipeline.

Reads a Google Takeout watch-history JSON file, cleans it, loads it into SQLite,
runs every query in sql/ and writes the results to docs/data.json for the website.

    python3 pipeline.py "path/to/watch-history.json"

The raw history never leaves your computer: only the aggregated results in
docs/data.json are published. Uses only the Python standard library.
"""
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).parent
DB = ROOT / "data" / "youtube.db"
SQL_DIR = ROOT / "sql"
OUT = ROOT / "docs" / "data.json"

# Takeout writes titles in the account's language: "Watched <title>" or "Đã xem <title>".
WATCHED_PREFIXES = ("Watched ", "Đã xem ")
ZONES = {"Vietnam": ZoneInfo("Asia/Ho_Chi_Minh"), "Chicago": ZoneInfo("America/Chicago")}
UTC_OFFSET = {"Vietnam": 7, "Chicago": -5}

HANGUL = re.compile(r"[가-힣]")
VIETNAMESE = re.compile(r"[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]", re.I)
JAPANESE = re.compile(r"[぀-ヿ]")


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def language(title):
    if HANGUL.search(title):
        return "Korean"
    if JAPANESE.search(title):
        return "Japanese"
    if VIETNAMESE.search(title):
        return "Vietnamese"
    return "English"


def detect_locations(events):
    """Guess, for each month, whether the viewer was in Vietnam or Chicago.

    People rarely watch videos between 2am and 8am local time. For each month we count
    activity in that window under each candidate time zone and pick the quieter one.
    """
    by_month = defaultdict(lambda: [0] * 24)
    for e in events:
        t = parse_time(e["time"])
        by_month[t.strftime("%Y-%m")][t.hour] += 1

    def night_activity(hours, zone):
        return sum(hours[(h - UTC_OFFSET[zone]) % 24] for h in range(2, 8))

    return {m: min(ZONES, key=lambda z: night_activity(h, z)) for m, h in by_month.items()}


def clean(events):
    location = detect_locations(events)
    rows, ads = [], 0
    for e in events:
        if "details" in e:  # "From Google Ads"
            ads += 1
            continue
        title = e.get("title", "")
        prefix = next((p for p in WATCHED_PREFIXES if title.startswith(p)), None)
        if not prefix:
            continue
        title = title[len(prefix):]
        utc = parse_time(e["time"])
        place = location[utc.strftime("%Y-%m")]
        local = utc.astimezone(ZONES[place])
        removed = title.startswith("https://")  # deleted or private videos only keep their URL
        rows.append((
            e.get("titleUrl"),
            None if removed else title,
            e["subtitles"][0]["name"] if e.get("subtitles") else None,
            local.strftime("%Y-%m-%d %H:%M:%S"),
            place,
            None if removed else language(title),
        ))
    return rows, ads


def load(conn, rows, ads):
    conn.executescript("""
        DROP TABLE IF EXISTS watches;
        CREATE TABLE watches (
            url TEXT, title TEXT, channel TEXT,
            watched_at TEXT,      -- local time where the viewer was
            location TEXT,        -- Vietnam or Chicago, detected per month
            language TEXT
        );
        DROP TABLE IF EXISTS meta;
        CREATE TABLE meta (key TEXT, value REAL);
    """)
    conn.executemany("INSERT INTO watches VALUES (?, ?, ?, ?, ?, ?)", rows)
    conn.execute("INSERT INTO meta VALUES ('ads', ?)", (ads,))
    conn.commit()
    print(f"Loaded {len(rows):,} videos watched ({ads:,} ads removed)")


def run_queries(conn):
    results = {}
    for path in sorted(SQL_DIR.glob("*.sql")):
        cursor = conn.execute(path.read_text())
        columns = [d[0] for d in cursor.description]
        results[path.stem] = [dict(zip(columns, row)) for row in cursor.fetchall()]
        print(f"Ran {path.name:28} {len(results[path.stem]):>4} rows")
    return results


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    events = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    rows, ads = clean(events)
    DB.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB)
    load(conn, rows, ads)
    results = run_queries(conn)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(results, indent=1, ensure_ascii=False))
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
