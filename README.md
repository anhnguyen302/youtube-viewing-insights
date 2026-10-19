# YouTube Viewing Insights

**Live site: https://anhnguyen302.github.io/youtube-viewing-insights/**

![Site preview](assets/preview.png)

I exported 2.5 years of my own YouTube history (13,700 raw entries) from Google Takeout, cleaned it with Python and analyzed it with SQL.

## What I found

- **46% of my "watch history" was ads.** Takeout mixes 6,238 ad views in with real videos, so cleaning had to come first.
- **Binges are rare but dominate.** Only 6% of my viewing sessions are 20+ videos long, but they account for 37% of everything I watch.
- **I watch more Vietnamese content when I'm away from Vietnam:** 55% of videos in Chicago vs. 46.5% at home.
- **Half of my plays are replays.** Just 123 videos, mostly music, make up 29% of everything I play.
- **A long tail with a loyal core:** 61% of channels I watched only once, while 71 channels account for half of my plays.

## Interesting engineering problems

| Problem | Solution |
|---|---|
| Ads are mixed into the watch history | Drop entries tagged "From Google Ads" (Python) |
| Every timestamp is in UTC, but I live in two countries | For each month, test both time zones and pick the one where I'm least active from 2am to 8am. The detected months match my real calendar. |
| No language field | Classify each title with regex on Vietnamese diacritics, Korean Hangul and Japanese kana |
| What counts as a "session"? | SQL window functions: `LAG` finds the gap between videos, and a running `SUM` gives each session an ID after a 30-minute gap |

## How it works

```
Takeout JSON ──► pipeline.py (clean, time zones, language) ──► SQLite ──► sql/*.sql ──► docs/data.json ──► docs/index.html
```

## Run it on your own history

1. Go to [Google Takeout](https://takeout.google.com) and export **YouTube and YouTube Music → history** in JSON format.
2. Run the pipeline. It only needs Python 3.9 or newer:

```bash
python3 pipeline.py "path/to/watch-history.json"
python3 -m http.server --directory docs     # open http://localhost:8000
```

The raw history file stays on your computer and is excluded by `.gitignore`. Only aggregated numbers are published in `docs/data.json`: no video titles or channel names.

---
Built by [Quin Nguyen](https://www.linkedin.com/in/hmt-quin), Information & Decision Sciences student at the University of Illinois Chicago.
