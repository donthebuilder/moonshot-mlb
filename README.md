# Moonshot MLB

The MLB HR dashboard — the original Next.js UI, reading the published `data`
branch of `MLB-HR-DASHBOARD-STREAMLIT`.

**This repo is read-only by design.** No bot, no workflows, no `.github/`.
It cannot write to the data branch and cannot interfere with the Streamlit repo.

## Run

```bash
npm install
npm run dev        # 0.0.0.0:8080
```

On Replit the run command is already set in `.replit` (port 8080 -> 80).

## Where data comes from

Everything flows through `lib/dataSource.js`:

```
https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data
```

Override with `NEXT_PUBLIC_DATA_BASE` (note: `NEXT_PUBLIC_*` is inlined at
build time, so changing it requires a rebuild).

| File | Feeds |
|---|---|
| `current/today_slim.json` | Games, HR Board, player cards |
| `current/today.txt` | Bot tab |
| `current/results_live.json` | Results |
| `current/pair_builder_latest.json` | Pairs |
| `current/pair_history_summary.json` | Pairs history |
| `pitch/batter_<id>.json` | Hot zone + spray heatmaps |

Heatmaps fetch one small file per player, on click — the page never loads
them up front.

## Smoke test

```bash
node scripts/smoke.mjs
```

Checks every required file resolves non-empty, then runs the real slate
through `normalizeData()` and asserts players come out with names, teams and
scores. Run it first when something looks wrong — it separates "bad data" from
"bad UI" in one step.

Against a local fixture:

```bash
FIXTURE=public/data/current/today_slim.json \
NEXT_PUBLIC_DATA_BASE=http://127.0.0.1:8080/data node scripts/smoke.mjs
```

## Known gap

`pitch/batter_<id>.json` is **not currently published** to the data branch.
`make_slim.py` strips per-player zone and contact logs because the Streamlit
UI never drew them — but this UI does. Until those files are published the
heatmaps render empty; nothing else is affected.
