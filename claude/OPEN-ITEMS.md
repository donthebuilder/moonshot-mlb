# OPEN ITEMS

Found while working, not fixed. Newest first.

## 2026-09-30 · MEMBERS M1/M2

- **LAMP's /start: 8 game names are not links** (`check-clickable /start?sport=nhl`; also on the live site). /start?sport=nfl was fixed in 05fd73f the same way: carry the game id and link it.
- **M2's contact line is hidden until `NEXT_PUBLIC_CONTACT_EMAIL` is set.** The terms draft says "Questions: <email>", and no address is published on the site.

## 2026-09-30 · BATCH-NFL-FIELD

- **Field files go live on the bot's next run.** Bot pushed at 63814cab; until `nfl.yml` runs, `nfl_field_{TEAM}.json` 404s on the data branch and the card falls back to TouchMap. Check after the next run: `curl -sI https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current/nfl_field_NO.json` should return 200.
- **Matchup map's leak numbers move with 63814cab.** `def_pass` and `league_pass` now count targets, not attempts. 147 of 3,104 located attempts had no receiver and counted as 0-yard plays allowed. Every zone's leak shifts a little: ATL right 10–19 goes from +9% to +10%, left behind from 0% to +14%. The Field, MatchupMap, the Matchups zone tiles and TouchMap's league baseline all move together.
- **MatchupMap's colours differ from the Field's.** MatchupMap uses orange (soft) and cyan (holding). The Field uses jade (leaks) and pink (stingy), as the plan asked, so that the touchdown stays the only orange. Pick one pair for both.
- **Leak fill is drawn at 60% of the plan's alpha.** At `min(.42, |leak|/90 + .05)` a −43% zone was louder than the touchdown. If you want the plan's exact alpha, change `QUIET` in `FieldChart.js`.
- **The DASH condensed display face doesn't exist on the site.** No webfont is loaded. The Field uses a stack (Barlow Condensed → Roboto Condensed → Helvetica Neue with `font-stretch: condensed`), which renders condensed on Apple devices. Loading a real face would be a site-wide decision.
- **Traded players.** PLAYER mode reads only his current team's file, so targets he drew for another team this season are missing. Nobody is affected yet in 2026.
- **The defence's leak covers every situation, not just NORMAL downs.** It's the same grid as the Matchup map. If you want a normal-downs-only leak, that's a second grid in the bot.
- **Players filed as RBs with targets ≥ carries get the Field instead of TouchMap.** QBs never do. Runners keep TouchMap's run lanes.
- **Pre-existing `check-clickable` misses, not from this batch.** NFL card header: "Chris Olave · SCORE 80" and "NO vs ATL". The DvpDrift caption: "WHERE ATL'S SOFT SPOT IS MOVING". MOONSHOT spray page: "Munetaka Murakami". All four are also untappable on the live site.
- **Pre-existing `check-mobile` warnings on `/app#sport=mlb&tab=spray`:** TINY / CLIPPED lines for MOONSHOT's own text. These are MOONSHOT's look, which I didn't touch.
- **Three files still import `ChipGroup` via `components/matchup/SprayParts`** (now a re-export of `components/charts`): `lamp/ShotPanel.js`, `nfl/TouchMap.js`, `nfl/MatchupExplorer.js`. They could point straight at `components/charts`.
- **The plan files never reached disk:** `claude/PLAN-nfl-the-field-2026-09-30.md` and `claude/PLAN-charts-2026-09-30.md`. The plan came in chat. PLAN-charts §C4 (the 3D field) still needs its text.
