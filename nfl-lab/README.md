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

## WHERE THIS ACTUALLY LIVES NOW (2026-08-14)

This folder is the lab — scratch, notes, the original market spec. The
**running bot moved to `MLB-HR-DASHBOARD-STREAMLIT/bots/nfl/`**, alongside the
MLB bot, because moonshot-mlb is read-only and must never gain a workflows
directory. It publishes to that repo's `data` branch via the same
`publish_data.sh` the MLB bot uses.

The **site is not a fork** either. NFL lives inside moonshot-mlb behind a
sport toggle in the header (`lib/sport.js`), sharing DenseTable, Explain,
PaletteButton and the rest. `nfl-lab/site/` is superseded; it stays for now
only as a record of the preseason landing page.

```
MLB-HR-DASHBOARD-STREAMLIT/bots/nfl/
├── nfl_features.py    weekly feature table (trailing / pregame / outcome, kept apart)
├── nfl_scoring.py     the seven market models
├── nfl_espn.py        schedule + live scores, incl. preseason (nflverse has none)
├── nfl_bot.py         builds nfl_week.json + nfl_meta.json
├── export_report.py   builds nfl_report_card.json
├── nfl_backtest.py    the report card, in the terminal
└── SCORING.md         every weight, why it's there, and what it scored

moonshot-mlb/
├── lib/sport.js       the toggle
├── lib/nfl/           theme (emerald→cyan), dataSource
└── components/nfl/    header, dashboard, modal, 5 tabs
```

## Build-order status

1. ~~`fetch_nflverse.py` — pull last season~~ **done**
2. ~~verify `nfl_markets.py` aliases against real headers~~ **done — 9/9 resolve
   on the first candidate, no drift.** Separately found that
   `stats_player_reg_*.csv` is season-aggregated with no `week` column, so it
   cannot grade a weekly market; `stats_player_week_*.csv` is the right grain.
3. ~~backtest harness~~ **done** — see SCORING.md. Weights tuned on 2025, run
   untouched on 2024. Three markets beat naive form in both seasons; two fail
   out of sample and the site says so in red.
4. ~~bot: weekly slate builder → published JSON~~ **done**
5. ~~site~~ **done** — toggle, not fork.
6. live layer — ESPN scoreboard is wired for schedule and scores. Play-level
   live data is still unproven; do NOT ship a fake Live Wire.

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
