# moonshot-mlb — next session handoff

Paste the prompt below into a fresh chat. Connect the folder
`~/Desktop/moonshot-push` first, and make sure Chrome is open and logged into
GitHub.

---

## PASTE THIS

I'm continuing work on **moonshot-mlb**, a Next.js MLB home-run dashboard.

**Repo/folder:** `~/Desktop/moonshot-push` (connect this folder)
**Live:** https://moonshot-mlb.vercel.app/
**Data source:** read-only from `donthebuilder/MLB-HR-DASHBOARD-STREAMLIT`,
branch `data`, under `public/data/current/`. This repo has no bot and must never
get a `.github/workflows` directory.

Read `HANDOFF.md` in the repo root first — it has the architecture, the data
contract, and the conventions I care about. Then work the task list at the
bottom of it, in order.

Before you write any component: **verify the fields exist in the published
payload.** Clone the data branch (`git clone --depth 1 --branch data …`) and
check counts. Several bugs last session came from fields that looked obvious and
weren't there. Do not guess field names.

I care about the reasoning being right more than the work being fast. If a
number would be misleading, say so on the page, not just in a comment.

---

## Architecture

Single-page app, 17 tabs, all state in `components/Dashboard.js`.

**Shared components — reuse these, don't reinvent:**

| File | What it does |
|---|---|
| `components/Heatmap.js` | Sortable heatmap. Exports `ORANGE_RAMP`, `rampColor`, `inkFor`. Per-column independent scaling. |
| `components/DenseTable.js` | Dense stat table: per-column colour, sortable headers, row click, caps at 200 rendered rows. |
| `components/SprayField.js` | Radar spray chart w/ real park geometry. |
| `components/HRPitchProfile.js` | HR-by-pitch-type vs tonight's arsenal. |
| `components/PairBuilder.js` | Anchor hitter → partners playing tonight. |
| `lib/dataSource.js` | Every URL. `detailUrl(pid)`, `pitcherDetailUrl(pid)`, `slatePaths(mode)`. |
| `lib/player.js` | Field-alias helpers. The bot writes one value under several names — always use these. |
| `lib/scoring.js` | `scoreFor`, `tierRole`, `shortRole`, `isAligned`, `lanePass`. |

## Data contract (verified on the live payload)

- `current/today_slim.json` — 268 hitters, 355 fields each
- `current/results_live.json` — `graded_slots` (90), `hr_capture_report`,
  `pair_pool_results.graded_pools` (8)
- `current/pair_builder_latest.json` — `recommended_pairs` (10, each with
  `type` / `lane_key` / `tags`), `pools_4man` (4), `pools_6man` (4)
- `current/pair_history_summary.json` — `top_pairs` (350)
- `current/backtest_summary.json` — `per_day`, `summary`, 8 graded days
- `current/detail/today/batter_<id>.json` — 268 files, `spray_chart` median 78
  batted balls, each with `pitch_type`, `ev`, `distance`, `is_hr`
- `current/detail/today/pitcher_<id>.json` — 30 files,
  `pitcher_lineup_spot_damage`, `pitcher_lineup_zone_damage`, pitch mix by hand

**Known gaps — don't build against these, they're absent:**
- `zone_profile` / `pitcher_zone_profile` — **0 of 297 detail files.** Re-checked
  this session. Hot Zones stays empty until `spray_cache.py` runs.
- No batter 400+ distance field *on the slate row*. `recent_375_num` exists; 400
  does not. **But** every `spray_chart` entry does carry `is_400_plus`, so a
  400+ count per hitter is available from the detail files if you want one.
- **No plate appearances anywhere.** The detail files carry exactly one list,
  `spray_chart`, and every row is a ball put in play. Walks and strikeouts are
  never written, so nothing on this site can have a true PA denominator. EV Log
  now says so on the panel instead of printing a BBE count labelled "PA".
- **`Top 15` / `Top 40` / `Due Pair` are not in the payload.** Searched all of
  `pair_builder_latest.json`: zero hits. What exists is `lane_key`
  (TOP30/A/B/C/D), `type`, `risk`, and a `Due` string inside per-pair `tags`
  (5 of 10 pairs). Don't build headings the data doesn't back — same class of
  bug as the 🧩 emoji in `isAligned()`.

**Verified this session (don't re-derive):**
- Home plate really is at `hc_x` 125.42 / `hc_y` 198.27. Fitted against 4,485
  fly balls and HRs by matching coordinate radius to published carry: best fit
  126.2 / 198.5, mean bias 0.3 ft. The standard constant is right.
- `lane` is a **pure function of `hc_x`** with hard cuts at 90 / 120 / 155 / 185
  — 20,368 batted balls, zero ordering violations. So lanes are vertical bands,
  not wedges, and they are centred at hc_x ≈ 137.5, about **30 ft right of home
  plate**. The bot's "CF" is not straightaway centre. SprayField draws the cuts
  where they truly are and says this on the panel.
- `pair_score` is on two different scales: TOP30 ≈ 100, lanes A–D ≈ 11–16.
  Never put it on one ramp. PairBoard now shows it unshaded.

## Conventions

- **Orange ramp only.** No green/red heat anywhere. `ORANGE_RAMP` shifts hue
  (dark red-brown → orange → gold), not just lightness.
- **Bright = good for the hitter, everywhere.** Columns that invert: `K%`
  (Scoreboard), `K/9` and `SwStr%` (Pitchers), `Days ago` (pairs).
- **Every rate shows its sample.** PA, BBE or n next to it. Small samples get
  said out loud.
- **Calibration is real.** The `BANDS` table in `Pools.js` / `CALIB` in
  `ProjectedOutput.js` are observed rates over 34 graded days. Never hand-tune.
- Verify with `npx next build` — but note a clean build proves nothing about
  rendering. Check the live site in Chrome.

## How this runs unattended (checked 2026-08-03)

The site is static and fetches every payload **client-side** from
`raw.githubusercontent.com/.../data/public/data/...`. So new bot data appears on
the live site with no redeploy. Vercel only rebuilds when code is pushed. That
means site autonomy = bot autonomy, and the bots are in the Streamlit repo.

Cron in `MLB-HR-DASHBOARD-STREAMLIT/.github/workflows`, all UTC:

| Workflow | Cron | What it feeds |
|---|---|---|
| `today.yml` | hourly 12:00–01:00, +21:30 | `today_slim`, `pair_builder_latest`, `detail/today/` |
| `results.yml` | ~17×/day, 16:00–10:00 | `results_live`, `graded_results_*` |
| `tomorrow.yml` | 07:05 | `tomorrow_slim`, `detail/tomorrow/` |
| `pair-history.yml` | 07:15 | `pair_history_summary` |
| `hr-companion.yml` | 07:45 | `hr_companion_latest` |
| `spray-cache.yml` | 13:00 | **nothing — see below** |
| `hr-companion.yml` | 07:45 | **nothing — see below** |
| `backtest-report.yml` | none | redundant; `results.yml` already does this |

`backtest_summary.json` **is** autonomous, despite `backtest-report.yml` having
no cron. `results.yml` runs `backtest_report.py --out-dir public/data/current`
as one of its own steps and then publishes, ~17×/day. The standalone workflow is
a manual re-run convenience, not the live path.

`publish_data.sh` force-pushes `data` as a single orphan commit each run and
carries forward files the current run didn't regenerate, so the branch stays
small and no publisher clobbers another. That part is solid.

### Every bot has a workflow. Two of them publish nothing.

Script → workflow coverage is complete: `mlb_dashboard`, `make_slim` and
`player_splits` run in both `today.yml` and `tomorrow.yml`;
`live_results_tracker` + `backtest_report` in `results.yml`;
`pair_history_cache` in `pair-history.yml`; `hr_companion_cache` in
`hr-companion.yml`; `spray_cache` in `spray-cache.yml`;
`fetch_picks_for_grading` in three of them. Only `run_pipeline.py` and
`site_data_sync.py` are referenced by no workflow — they look like local-only
helpers, and nothing published depends on them.

Four workflows call `publish_data.sh`: today, tomorrow, results, pair-history.
**Two don't**, so their output dies on the runner:

**1. `hr-companion.yml` never publishes.** It runs `hr_companion_cache.py` and
stops. `hr_companion_latest.json` is listed in `PUBLISH_FILES` but is not on the
`data` branch, because nothing ever puts it there. moonshot-mlb doesn't read it,
so nothing here is broken — but that bot is burning a run a day for nothing.
Add a `publish_data.sh "HR companion"` step if you want it.

**2. Hot Zones will never fill. It is not waiting on a bot run.**
The old note here said "stays empty until `spray_cache.py` runs". That was
wrong — it has been running daily at 13:00 UTC. It's broken by wiring, in three
independent places, and all three have to be fixed:

- `spray-cache.yml` declares `permissions: contents: read` and has **no publish
  step**. Its only persistence is `actions/cache`, which dies with the runner.
  Nothing it computes ever reaches the `data` branch.
- `spray_cache.py` writes batter files to `public/data/pitch/batter_<id>.json`.
  The app reads `public/data/current/detail/today/batter_<id>.json`. Different
  path — and `publish_data.sh` only copies `current/detail` and `current/splits`.
- `make_slim.py` builds the published detail files from a four-key whitelist,
  `BATTER_DETAIL_KEYS = [spray_chart, batter_pitch_type_profile,
  pitch_mix_matchup, pitch_type_summary]`. `zone_profile` isn't in it, so even a
  slate row carrying one would be dropped.

So this is a Streamlit-repo job, not a moonshot-mlb one. The empty state on
HotZoneMap.js is correct and should stay until the pipeline actually publishes.

**Running the Spray Cache bot by hand will not fix it.** It already runs daily
and succeeds; its output has nowhere to go. Three changes are needed, all in
MLB-HR-DASHBOARD-STREAMLIT, and the first two are useless without the third:

1. `bots/spray_cache.py` — `write_individual_batter_files()` writes to
   `PITCH_DIR` (`public/data/pitch/`). Point it at
   `public/data/current/detail/<slate>/batter_<id>.json` instead, and **merge**
   into the existing file rather than replacing it, so it adds `zone_profile`
   without dropping the `spray_chart` make_slim already put there.
2. `.github/workflows/spray-cache.yml` — `permissions: contents: read` becomes
   `write`, and add a final step:
   `run: bash .github/scripts/publish_data.sh "Spray cache"`.
3. `bots/make_slim.py` — **this is the one that will bite.** `write_detail_files`
   rebuilds each detail file from `BATTER_DETAIL_KEYS`, a four-key whitelist,
   and `today.yml` runs it hourly. Even with 1 and 2 done, the next Today run
   overwrites the file and `zone_profile` is gone within the hour. Add
   `zone_profile` and `pitcher_zone_profile` to that list *and* have it preserve
   keys already on disk that this run didn't produce — the same carry-forward
   logic `publish_data.sh` already does at the branch level.

Verify with: `git clone --depth 1 --branch data …` then check
`detail/today/batter_*.json` for a non-null `zone_profile`. Today it's 0 of 297.

**Possible third risk, unverified:** GitHub disables scheduled workflows in a
repo after a long stretch of no *human* activity. Bot pushes made with
`GITHUB_TOKEN` may not reset that timer. If the bots go quiet all at once for no
other reason, check the Actions tab for a "workflows disabled" banner first.

## I can't do these — they're yours

- Push to GitHub (no credentials). I edit files in the folder; you commit/push.
- Run the bots. They live in the Streamlit repo and need pybaseball + Statcast.

---

## DONE (session of Aug 2) — all seven, plus the spray rebuild

- **Spray chart geometry — the real bug.** It plotted `hit_distance_sc`, which
  for a ground ball is ~33 ft while the ball was actually fielded ~128 ft out.
  Ground balls are 43% of every hitter's tracked contact, so half of each chart
  was a smear on top of home plate. It now plots the `hc_x`/`hc_y` landing
  coordinate, which is what a spray chart has always meant. Carry moved to the
  hover. Also: EV ramp fixed at 65–110 instead of per-player (per-player scaling
  contradicted the fixed 450 ft field), foul balls drawn dashed outside the
  lines instead of floating in dead space, singles no longer labelled "Out",
  marker shape now carries pitch type, and there's a date-range selector plus
  GB/LD/FB/PU contact filters.
- **1. Pairs by lane.** Grouped by `lane_key` with counts, ranked and shaded
  inside each lane. Fixed a real data loss: `enforceUniquePairExposure(…, 1, 24)`
  capped each player at one appearance and was silently dropping 3 of the bot's
  10 pairs, because Olson / Manzardo / Crow-Armstrong each legitimately appear
  in two lanes.
- **2. Build a Pair** is multi-select, ranking shared partners by how many of
  your anchors they match, then by mean fit. Also switched its history join from
  normalised name strings to `player_id`.
- **3. Pools** got re-roll (rotates the ranked list, wraps — not random), a
  per-leg ⇄ swap, and player/team exclusion. `BANDS` untouched.
- **4.** Live HR Pairs, Season History Match and Season History are all
  DenseTables now (the 200-row cap that fixed the hang still applies).
- **5.** Pitch chips default to the starter's mix matched to the batter's
  platoon side, with a "Match <pitcher> mix" button.
- **6.** EV Log is on the orange ramp (it was the last green/red page) with a
  Games / Batted-balls toggle. Hot Zones left honestly empty.
- **PairBoard** — not on the list, but the live site showed the cross-lane
  scale bug plainly, so `Score` is no longer heated there.
- **PlayerModal was passing the wrong object to two of its four tabs.** It hands
  each tab the slate row out of `today_slim.json`. But `make_slim.py` strips the
  heavy per-player payloads out of that file — `spray_chart`,
  `batted_ball_log`, `contact_log`, `pitch_type_summary`,
  `batter_pitch_type_profile` and `pitch_mix_matchup` are on **0 of 267 slate
  rows** and live only in `current/detail/<slate>/batter_<id>.json`. SprayField,
  HRPitchProfile and HotZoneMap each fetch that file themselves, so those tabs
  worked. EV Log and PitchBreakdown read straight off the prop and did not: the
  EV Log tab said "No batted ball data. Run spray_cache.py." for every hitter on
  the slate, and the batter half of the pitch table was blank while the pitcher
  half filled in normally — which is why it looked like missing bot data instead
  of a wiring bug. The modal now fetches the detail file once and merges it, so
  all four tabs see one object. Its fixed BBE range toggle is gone too; it was
  forcing EV Log into batted-ball mode and hiding EV Log's own window control.

- **Player modal restructured to seven tabs.** Pitch and Spray were sharing one
  1180px tab, so neither got read, and the opposing starter — the thing the
  whole slate is built around — had no home at all. Now:
  Overview · **Pitcher** · Pitch · **Spray** · EV Log · **Splits** · Hot Zones.
  - **Pitcher** (new, `MatchupPitcher.js`): arsenal matched to the hitter's
    platoon side, damage by order third, damage by lineup spot with his own spot
    called out, plus the season/command numbers off the slate row. Reads
    `detail/<slate>/pitcher_<id>.json`, which only PitcherProfile touched before.
  - **Splits** (new, `PlayerSplits.js`): day/night, home/away, day-of-week,
    win/loss. `player_splits.py` has been publishing `current/splits/` — 297
    files a slate — since the migration and **nothing on this site read a single
    one of them.** Day-of-week is ~60 PA a row, so the captions say plainly that
    it shouldn't move a decision.
- **PitchBreakdown is on the orange ramp.** It was the last green/red page; its
  own footer said "Green = favorable for batter". Direction now comes from
  flipping the value before shading, not from switching hue, and pitch identity
  is a text label rather than a rainbow dot.

**Not done: live verification of these changes.** The deployed site was still
the old build when this was written, and I can't push. First job next session is
task 7 below against the new deploy.

## TASK LIST — in order

**0. Verify the new build live — do this first**
Open the deploy and click every tab. Specifically check: Spray (dots should
spread across the field, not pile at the plate; pitch chips should come up
pre-selected to the starter's mix), Pairs → Bot Picks (five lane groups, ten
pairs total), Pairs → Build a Pair (multi-select), Pools (re-roll / ⇄ / ✕),
Pairs → Live HR Pairs and Season History (dense tables), and the EV Log inside
a player card. Everything below this line is the previous list, now complete.

---

**1. Pairs: show the bot's real categories**
`recommended_pairs` each carry `type` and `lane_key` (e.g. `TOP30`, "Statcast HR
Pair", "Core HR Pair", "Flex", "Value Power"). Right now they render as one flat
list. Group by category with counts, and surface Due Pair / Top 15 / Top 40 the
way the bot labels them.

**2. Build a Pair: multi-select**
Currently one anchor at a time. Give it the same click-to-add behaviour Pools
has — select several hitters, see all their shared partners ranked.

**3. Pools: shuffle / make it yours**
- Re-roll button — regenerate the suggested ticket from a different slice
- Swap one leg without rebuilding the whole ticket
- Exclude a player or a team
- Keep the fair-price maths and the same-game correlation warning

**4. Live HR Pairs + Season History — visual pass**
Both still use the old card layout. Bring them to the dense-table standard.

**5. Spray: auto-select tonight's pitches**
The pitch chips should default to the pitches the opposing starter actually
throws, matched to the batter's platoon side. Fields:
`pitcher_primary_mix_vs_lhb` / `_vs_rhb`, `pitcher_pitch_usage_pct`. Add a
"Match <pitcher> mix" button like PropFinder's.

**6. EV log + Hot Zones**
- EV log: games / plate-appearances toggle, bring to current visual standard
- Hot Zones: blocked on `zone_profile`. Leave the honest empty state.

**7. Verify live**
Open the deployed site in Chrome and click every tab. Last session found a
browser-locking hang and a full-width-filter bug that a clean build didn't
catch.

---

## Recent history worth knowing

- **Pair History used to lock the browser tab.** Fixed by capping DenseTable at
  200 rendered rows. If a page ever hangs, look for an uncapped table first.
- **`isAligned()` returned false for all 268 hitters** — it searched
  `top_board_tags` for a 🧩 emoji that the bot no longer writes. Rebuilt from
  weak spot + pitch match + recent contact; now matches ~30. Lesson: when a
  column is entirely empty, suspect the predicate, not the data.
- **The ramp took four passes.** v1 too bright, v2 too dark, v3 flat, v4 shifts
  hue. Don't "simplify" it back to one hue.
