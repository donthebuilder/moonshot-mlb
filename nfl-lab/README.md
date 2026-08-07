# MOONSHOT · NFL — the lab

The football sibling. Same skeleton as MLB, same rules, different sport.

## Scope (locked 2026-08-07)

Markets, and ONLY these — no defensive props, ever:

| Market | The bar |
|---|---|
| Anytime TD | 1+ rushing or receiving TD |
| Receiving yards | line-based (25/40/60+) |
| Receptions | line-based (3/5/7+) |
| Rushing yards | line-based (40/60/80+) |
| Rushing attempts | line-based (10/15+) |
| Passing yards | line-based (200/250/300+) |
| Kicking points | FG×3 + PAT (6/9+) |

## Architecture — mirrors MLB exactly

```
nfl-lab (this repo, eventually its own)
├── bots/            scoring bot + graders → publish JSON to a data branch
│   ├── fetch_nflverse.py   data pull (WORKING — run it first)
│   └── nfl_markets.py      market bars + per-week outcome extraction
├── data/            local nflverse cache (gitignored eventually)
└── site/            Next.js read-only site, moonshot skeleton (LATER)
```

The site never computes; it reads published JSON. Picks lock at kickoff
(the pick-lock idea ports 1:1 — first pitch becomes kickoff per game).
Receipts before anything: the Report Card ships in v1, not later.

## Data source — nflverse (verified live 2026-08-08)

- `https://github.com/nflverse/nflverse-data/releases` — auto-updated
  public releases. Confirmed present: `stats_player` (per-season player
  summary CSVs, pattern `stats_player_{reg|post}_{YYYY}.csv`),
  `schedules`, `weekly_rosters`, `players`, `teams`, `stats_team`.
- Asset URL pattern (verified against the release page's own links):
  `https://github.com/nflverse/nflverse-data/releases/download/{tag}/{file}`
- NOT yet verified: exact column names inside the CSVs. The sandbox
  can't download the assets (proxy), so `fetch_nflverse.py` prints the
  header row on first run — check it against the aliases in
  `nfl_markets.py` before trusting any number. This is the same
  verify-fields-before-building rule the MLB side lives by.

## Build order

1. `python bots/fetch_nflverse.py --season 2025` — pulls last season for
   backtesting + this season's schedule. Prints headers for verification.
2. Verify `nfl_markets.py` aliases against those headers. Fix any drift.
3. Backtest harness: score formulas vs 2025 weekly outcomes — the NFL
   report card exists BEFORE week 1, calibrated on last season, stated
   honestly as such.
4. Bot: weekly slate builder (schedules + rosters + opponent defensive
   rates from stats_team) → published JSON, same shapes as MLB where
   possible so site components port.
5. Site: fork the moonshot skeleton — Header/DenseTable/Dashboard port
   as-is; boards become TD/RecYds/Rec/RushYds/Att/PassYds/Kicking.
6. Live layer: NFL has no free StatsAPI equivalent with play-level live
   data — investigate ESPN scoreboard JSON (unofficial) before promising
   a Live Wire. Do NOT ship a fake one.

## Cadence

NFL is weekly, not nightly: Tue (full data lands) → Wed slate → updates
through Sun kickoff lock → live Sunday → grade Mon. One receipts cycle
per week means every post carries a whole week of record — design the
digests around that rhythm from day one.
