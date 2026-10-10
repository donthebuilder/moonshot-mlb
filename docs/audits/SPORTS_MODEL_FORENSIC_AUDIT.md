# DASH sports model forensic audit

Date of data: 2026-10-10 02:40 UTC (read-only). Site repo `main` at the worktree head; bot repo `origin/main` 36ee3b17, `origin/data` branch.
Nothing was edited, posted, written to a database or re-fitted. Every number below was computed from rows we hold; where a stored row lacks the feature, ablation is NOT possible and that is said.

Principle used throughout: a model that has not been validated is not a validated model. DASH models are hand-weighted rankings, so "train" means: evaluate the LOCKED prospective rows in the order they were recorded, never re-fit on the same sample, and compare with a baseline computed from the same rows.

Labels: CONFIRMED DEFECT (reproduced), PLAUSIBLE RISK (mechanism shown, effect not proven), UNVERIFIED HYPOTHESIS (not tested).
Intervals are Wilson 95% for rates and a night-cluster bootstrap for AUC differences.

---------------------------------------------------------------------------------------------------

## 1. Executive verdict per sport

| Sport | Verdict | Why (short) |
|---|---|---|
| MLB HR (hr_score, TOP/HR roles, `mlb_hr_v4`) | NOT VALIDATED. Weak real signal, no demonstrated edge over a season HR/PA rule. | On locked pregame rows (n=2,356, 46 nights): AUC 0.585 vs 0.576 for season HR/PA, difference +0.012 [-0.028, +0.044]. The weights were tuned on an archive with no locked features (F1). |
| MLB HIT / HRR / CONTACT roles | NO MEASURABLE LIFT. | Locked: HIT 63.6% vs 63.0% base; HRR 49.7% vs 49.6%; CONTACT 35.1% vs 38.4% (below base). |
| MLB sim_hr_prob (the only stored real probability) | Slightly informative, never graded by its own pipeline, over-confident at the top. | 0 of 5,694 rows graded in `sim_convergence`; external join n=1,507: Brier 0.1222 vs 0.1233 constant, AUC 0.601. |
| NFL TUDDY TD (`tuddy-td-v1` / bot `nfl_td_v2`) | Best-validated of the four, but the live sample is one week. | Bot has a two-season holdout (AUC ~.72-.73, their note). Live board_lock: called 6/13, board 26/73 (35.6%), off 20/145 (13.8%) vs 22.5% base, n=231, 1 slate. Monotone, tiny. |
| NFL lines (dash-line-v1) | Worse than the book. | Our line MAE 16.5 vs book 14.7 (n=545); leans 55% [47, 62]. |
| NHL LAMP goal (`lamp-goal-v1/v2/v3`) | Monotone on 3,070 graded rows but the model ignores the opponent. Accuracy backtest belongs to the separate NHL agent. | called 30.8% [24.7, 37.6], board 17.5%, off 11.7% vs 15.1% base. Score = mean percentile of shots/GP, goals/GP, TOI/GP only. |
| NBA BUCKETS (all markets, dd/td v1 and v2) | NOTHING VALIDATED. | 100% of 4,326 graded rows are preseason (`season_type` 1). No regular-season row exists. dd v1 and v2 give identical results (1/27 each). |
| Top Totals | NOT VALIDATED. | 18 rows total, 4 graded (NHL), line is our own projection. |
| Numerology | No lane beats the base rate. | NHL, 6,079 graded: every lane 11.6%-17.3% vs 14.7% base, all intervals contain it. |
| Pairs / pools / longshot combinations | No evidence of beating independence. | Both-HR pairs vs product of their own player rates: 2.5% vs 2.5%, 4.9% vs 3.4%, 9.0% vs 5.0% (n=78, CI 4.4-17.4). |

---------------------------------------------------------------------------------------------------

## 2. Pipeline and dependency map (file:line)

MLB (bot repo, Python; the site only reads it)
- Score: `bots/mlb_dashboard.py` `MODEL_WEIGHTS["hr_blend"]` (line 184; 19 terms, sums to 1.00, asserted at 411). The biggest weights: `season_power` 0.24, `damage_conversion_score` 0.13, `pitch_fit` 0.06, `pull_launch` 0.06, `weak_spot_interaction` 0.06. Blend computed in `apply_model_v2_layers` (~8498-8545); recent form term uses `last5_hr`, `last10_hr`, `l20pa_hr`, `last5_xbh` (8520).
- Roles: `build_game_pick_role_map` (11498) sets TOP/HR/HIT/HRR/CONTACT/WATCH.
- Freeze: `freeze_pregame_rows` (13667), `should_reuse_locked_rows` (13700), per-game lock via `bots/pick_lock.py`; prediction of record in `por_log_<date>.jsonl`, read by `bots/eval_report.py` (as_of 2026-10-09: `mlb_hr_v4`, n_included 3,424).
- Grading: `bots/live_results_tracker.py` writes `graded_results_<date>.json` (data branch). `bots/leak_scan.py` and `archive_health.txt` already exist.
- Shadow: `bots/hr_v3_shadow.py` (`hr_score_shadow` column).
- Site read: `lib/dash/homerFeed.js` (alerts), `lib/callStatus.js` (CALLED words), `lib/dash/gameCall.js` (per-game call).

NFL
- Score: `bots/nfl/nfl_scoring.py` MODELS["TD"] weights (f_rz_opp .2222, implied_total .1830, f_touches .1569, f_xtd .1569, f_gl_opp .1503, f_snap_pct .1307). Percentile-ranked inside the week pool. `td_game_probability` = Poisson on xTD, labelled "not a calibrated model probability".
- Lock: `bots/nfl/nfl_pick_lock.py`, `nfl_por_log_2026_wNN.jsonl`; site copy `lib/boardLock.js:60` into `board_lock` (source = bot `built_at`, locked_at = T-65 min).
- Lines: `dash_lines` (`dash-line-v1`).

NHL
- `lib/nhl/goalModel.js` `scoreNight` (percentile mean of 3 legs, per-team top skater CALLED, top third of the night = board), legs from `lib/nhl/goalBoard.js` (`pooledLegs`, 82-game window), lock in `app/api/lamp/tick/route.js:101-110` (skips a game whose puck has dropped), written to `lamp_goal_log`.
- Goalie: `lib/nhl/goalieSource.js`, `lib/nhl/oppGoalie.js`; stored in `lamp_goal_games.starters`.
- xG: `lib/nhl/xgLampXgV1.js`, `lamp_team_game_xg`.

NBA
- `lib/nba/board.js`, `lib/nba/model.js` (dd v1 vs v2 `lib/nba/ddtd.js` oppMultiplier clamp 0.8-1.25), `lib/nba/expectedPoints.js`, writes `buckets_log`.

Top Totals
- `lib/totals/core.js` (TOTALS_VERSION `top-totals-v1`, LOCK_LEAD_MIN 90), `lib/totals/sources.js:99-100` (NFL line = projection / `NFL_PARAMS.cover` 1.242 from `lib/nfl/teamTdModel.js:39`), `lib/totals/store.js`.

Odds
- `odds_snap` (HR market, snaps list/lock/close), `odds_lines` (hits, hrr, tb, sb, k). From 2026-09-26.

---------------------------------------------------------------------------------------------------

## 3. Findings, ranked

### CRITICAL

**F1. MLB weights were tuned on an archive with no locked features. CONFIRMED DEFECT.**
- Evidence: `feature_snapshot` (the locked pregame overlay) is present on 0% of graded rows from 2026-04-16 to 2026-07-31, 29.5% in August (from 08-22), 100% from September. Of 8,501 unique graded player-games: 6,111 unlocked (04-16 to 08-21, 72 nights), 2,390 locked (08-22 to 10-08, 46 nights).
- The code comments that justify the weights cite exactly that unlocked archive: "backtest across 4,972 graded picks / 64 days (4/27-7/24)" (2026-07-25), the "weight sweep over the graded archive ... 49 nights" for `season_power` 0.12 to 0.24 (2026-08-09), and several "audit" re-weights (`mlb_dashboard.py` ~188-300).
- The bot's own `archive_health.txt` (2026-09-28) says why this matters: unlocked rows carry whatever the field was at grading time.
- Reproduction: `docs/audits/scripts/mlb_leak_replication.py`. On unlocked rows a hitter with `last5_hr == 0` homered 6.8% (115/1,687, [5.7, 8.1]) vs 19.9% with `last5_hr > 0`, a 13.1 point gap; on locked rows 9.9% (63/639) vs 17.1% (256/1,501), a 7.2 point gap. `season_hr == 0`: 2.9% (4/140) unlocked. A genuine hot-hand effect exists, but about half of the unlocked gap is not explained by the locked gap.
- Impact: every in-sample number from the tuning era is inflated. TOP role rate was 21.9% (106/485) on unlocked rows and 16.8% (79/469) on locked rows. Top 5 per night 25.6% unlocked vs 21.3% locked. The `recent_form` term and the hot/cold multipliers (`hot_strong` 1.12) are the most exposed.
- Fix: freeze all `hr_blend` weights until 150+ locked nights exist; judge any change only on locked rows, in chronological order, against the baselines in F2. Retire the unlocked archive as tuning evidence.

**F2. MLB hr_score has no demonstrated edge over a simple season HR/PA rule. CONFIRMED DEFECT (validation gap).**
- Locked rows, played only, n=2,140 with both numbers: AUC hr_score 0.585 [0.553, 0.617] vs season HR/PA 0.576 [0.541, 0.606] vs season ISO 0.567. Paired difference +0.012, night-cluster bootstrap 95% [-0.028, +0.044].
- Top 20 per night (n=890): 17.3% vs 14.9% base (one-sided p=0.027); the HR/PA rule gives 16.3%. Top 5: 21.3% (49/230) vs HR/PA rule 15.2% (35/230); this is the only place the model is clearly ahead, with intervals that overlap.
- Decile table (locked): 5.9% in the lowest decile, 20.3%-20.4% in the top two. Deciles 4-7 are flat or inverted (16.4, 15.5, 12.7, 16.6).
- Unlocked era was reversed: season ISO AUC 0.612 and HR/PA 0.607 beat hr_score 0.572. So the model was tuned and still lost to its own input.
- The bot's own record (`eval_report.json`, n=3,424): tier 60-69 is 12.8% (17/133), below tier 50-59 at 13.9% (43/309); tier 80-89 n=5, 70-79 n=38. Monotonic = false.
- Baseline stated: the model must beat season HR/PA (computed here from `season_hr / season_pa`) and the 14.9% base among board candidates. It does not beat the first.
- Caveat: base is among board candidates, not every eligible league player-game; a league-wide rate per player-game could not be computed from data we hold (no per-game league log).

**F3. HIT / HRR / CONTACT calls show no lift. CONFIRMED DEFECT (claims exceed evidence).**
- Locked rows: HIT called 301/473 63.6% [59.2, 67.8] vs all-played 63.0%; HRR 235/473 49.7% [45.2, 54.2] vs 49.6%; CONTACT 167/476 35.1% [30.9, 39.5] vs 38.4%.
- Score AUCs on locked rows: `hit_score` 0.533 vs season AVG 0.531; `contact_score` 0.536 vs season SLG 0.512; `hrr_score` 0.543 vs 0.519. Unlocked-era AUCs were 0.569/0.539/0.565, again higher in the leaky period.
- Impact: the site and X label these CALLED and "CALLED IT HIT PICK"; the evidence says they are indistinguishable from the base rate. HR role (not TOP) is 15.1% vs 14.5%.
- Fix: do not publish HIT/HRR/CONTACT as CALLED until a locked sample shows lift; label as ON THE BOARD at most.

### HIGH

**F4. `sim_convergence` is never graded; the stored real probability is unvalidated by its own pipeline. CONFIRMED DEFECT.**
- 5,694 rows, 34 days (2026-09-03 to 10-08), `actual_hr` and `graded_at` null on every row.
- External join to the graded archive (`day`, `player_id`, played): n=1,507. Mean p 0.155 vs observed 0.144. Brier 0.1222 vs 0.1233 for a constant (a 0.9% gain). Log loss 0.4068 vs 0.4121. AUC 0.601 vs `hr_score` 0.576 on the same rows. Calibration: top bucket predicted 0.275, observed 0.206 (n=247) over-confident; buckets 2-3 slightly under-confident.
- Fix: grade it nightly into the same table; do not print it until bands are within 5 points over 100+ graded rows, as the NHL rule already requires.

**F5. MLB public record covers 27% of candidates. CONFIRMED (bot's own report).**
- `eval_report.json`: 12,679 candidates, 3,424 included; excluded: `missing_score_row` 8,780, `missing_prediction_log` 318, `locked_late` 18, `void` 44, `no_outcome_yet` 95.
- Impact: selection risk in the "record"; which candidates lack score rows is not known. UNVERIFIED HYPOTHESIS that missing rows are non-random (e.g. players added after lock).
- Fix: report the 69% exclusion on the record page; find why a score row is missing.

**F6. NHL score ignores the opponent. CONFIRMED (code).**
- `lib/nhl/goalModel.js` `scoreNight`: score = mean percentile of `shotsPg`, `goalsPg`, `toi`. `oppGoalie`, `oppGaPg`, `b2b`, `home` are stored in `context` but never enter the score. Called = best skater per team, so two calls a game by construction, whatever the matchup.
- Goalie data: `lamp_goal_games.starters` is null on 83 of 87 games (source began 2026-10-09); 4 games have it and 0 of 4 pregame objects equal the actual objects because `confirmed:false` and `playerId:null` differ (the name matched in the two examples shown).
- Alerts say "Called before puck drop." There is no public pregame X post per skater before 2026-10-09's Slate.
- Leakage: lock is clean (see section 5). NHL accuracy is the other agent's note; I did not duplicate it.
- Fix: test an opponent term only with locked `legs`/`context` (stored, so ablation is possible for the three legs and for oppGaPg).

**F7. NFL lock freshness. CONFIRMED DEFECT (data timing).**
- 32 prediction-of-record entries (weeks 2-5): `generated_at` to kickoff median 1.4 h, but 11 entries were built 7.1-8.7 h before kickoff (not refreshed after inactives, ~90 min before), 1 built after kickoff (`locked_late` true, correctly flagged).
- `board_lock` (site): 311 rows, median 9.6 h between board build and lock; 40 rows (12.9%) graded `void` (did not play); 8 of 108 board/called players were void (7.4%). `called` void 0.
- Fix: rebuild the NFL board after inactives and gate naming on the inactive list; this is the NFL equivalent of MLB's lineup check.

**F8. NBA BUCKETS has no regular-season data at all. CONFIRMED.**
- `buckets_log`: 8,016 rows, 2026-10-03 to 10-09, 100% `season_type` 1; 4,326 graded. `pts` bar 25: 0 hits in 1,248 graded rows (max actual 24). `dd`/`td` v1 and v2: 2/54 and 0/54. The `pct` column holds leg inputs (`fgaPg`, `ftaPg`), not a probability, so Brier/log loss cannot apply.
- Lock lead 4-9 minutes before tip (no late lock). First_fg: called 21.1% (4/19, interval 8.5-43) vs off 8.9% (18/202).
- X tweets are ON for BUCKETS. Fix: no performance claims until regular-season rows exist.

**F9. NFL dash-line is worse than the book. CONFIRMED (n=545, 5 days).**
- Our line MAE 16.52 vs book line 14.68. Lean accuracy: over 85/155 54.8% [47.0, 62.5]; under 130/236 55.1% [48.7, 61.3]. Neither interval excludes 50%.

### MEDIUM

**F10. Numerology has no predictive value. CONFIRMED (NHL).** Largest lanes: `fib_next` 14.8% (n=1,052), `gem_date` 15.4% (n=799), `_eligible` 14.9% (n=2,484) vs 14.7% base. Fine to post as entertainment, not as signal. MLB/NFL lanes have no graded rows (hit null).

**F11. Pairs and pools. CONFIRMED (no evidence of correlation edge).** Pair both-HR rate vs independence from their own player rates: A 2.5% vs 2.5%; B 4.9% vs 3.4%; C 2.8% vs 2.3%; D 1.3% vs 1.1%; "HR Pair A Pure Bombs" 10.2% (5/49) vs 8.2%; TOP30 9.0% (7/78) vs 5.0% (CI 4.4-17.4). Pools: about 800 pools, "cleared" (all hit) 1 time; 4-man pools 14.1-14.4% per player, which is the board's base rate.

**F12. Odds comparison. PLAUSIBLE RISK that the market is better (small n).** MLB HR, `lock` snap (taken 64-250 min before first pitch, never after), n=236 over 11 days: AUC market 0.653 vs hr_score 0.592; Brier 0.1114 vs 0.1141 constant. Close snap: 0.661 vs 0.591, n=213. On n=193 rows with all three: sim 0.674 vs market 0.686. Odds history starts 2026-09-26, so this is 14 days. Not a market-beating claim in either direction.

**F13. Duplicate rows in the graded archive. CONFIRMED.** 10,241 rows load to 8,501 unique (day, player, game_pk); 1,740 are copies across three file schemas (`list`, `results`, `graded_picks`). Any analysis that does not dedupe double-counts; mine does.

**F14. Leak scan has a blind spot. CONFIRMED.** `bots/leak_scan.py` OUTCOME_FIELDS omits `top_beat_game` and `top_game_best_tb` (written by `live_results_tracker.py:4441`, an outcome). On locked rows `top_beat_game == 1` hit a HR 83% of the time, so the scan flags a real outcome column as a "watch" at log p -15.2, while `last5_hr` stays flagged. Add both to the list so a real leak is not hidden in the noise.

**F15. `locked_at` means different things. CONFIRMED.** In `nfl_por_log` every `locked_at` (32/32) is after kickoff (it is when the lock record was written; the prediction is the last build before kickoff). In `board_lock` it is T-64 to T-70 min. In `lamp_goal_log` and `buckets_log` it is T-10 / T-4..9 min. A reader checking "locked_at < start" will wrongly fail the NFL log. Rename or add `built_at`.

**F16. Top Totals units. PLAUSIBLE RISK.** The line is our projection (`line_source` 'projection'); for NFL a fixed constant `cover` 1.242 converts skill-player TDs to total TDs (`teamTdModel.js:39`), applied identically to every game. NHL, 4 graded: 1 of 4 over. The new book-line path (`odds_game_totals`) has 0 rows today. No result can be claimed.

### LOW

**F17. Postseason mixed with regular season. PLAUSIBLE RISK.** Locked set includes 170 postseason rows (09-29 onward); there hr_score AUC 0.557 vs HR/PA 0.671 (n=170, intervals wide). The eval report pools both. Split the record by game type.

**F18. Date keys. CONFIRMED CLEAN.** For 7,370 graded rows with a start time, the file day equals the game's ET date and its Phoenix date on every row (0 mismatches); UTC would be wrong on 1,691. The bot uses `America/Phoenix` for `TODAY` and the site uses ET; they agree only because MLB starts are before 9 pm Phoenix. PLAUSIBLE RISK for a late West-coast start; not observed.

**F19. Void / DNP handling.** MLB 2.8% of rows (237 of 8,501) have zero AB; I excluded them from every rate. If a live record counts them as misses the rates fall. The bot excludes them (`void` 44).

---------------------------------------------------------------------------------------------------

## 4. Leakage review by model (inputs vs availability)

| Model | Inputs | Available before the lock? | Verdict |
|---|---|---|---|
| MLB hr_blend | season stats, last5/last10/l20pa, Statcast rolling, pitcher splits, park, weather, lineup spot, bvp, `yesterdays_hitters_score` | Locked rows: yes (snapshot). Unlocked rows (before 2026-08-22): grading-time values | F1 |
| MLB roles | designation after lineup; rebuild at first-pitch "frozen" (`freeze_pregame_rows`) | Yes after 2026-10-04 freeze; before that a 1-2 spot lineup guess could be frozen (docstring 13700) | PLAUSIBLE RISK, not measured |
| MLB sim | not inspected (computed in the bot, stored in `sim_convergence` at `created_at` = day) | `created_at` is a date only; cannot prove pregame. UNVERIFIED | |
| NFL TD | percentile features from last games, `implied_total` (book), snap % | Build time 1.4 h median, up to 8.7 h before kickoff; inactives may be missing | F7 |
| NHL goal | last-82-games club stats (shots, goals, TOI) | Yes, lock 10 min before puck drop, row skipped if puck dropped | clean |
| NHL xG | shot events up to the prior night | UNVERIFIED (not read in depth) | |
| NBA | gamelog legs, minutes | Lock 4-9 min before tip; preseason only | no validation |
| Top Totals | team models, LOCK_LEAD_MIN 90 | yes, store refuses rows after start | clean by construction |
| Odds | `odds_snap` lock/close | taken before start on every row | no leakage found |

---------------------------------------------------------------------------------------------------

## 5. Tests run, limits, data unavailable

Run (all read-only): leak replication on 8,501 unique graded rows; AUC/decile/top-N vs season-rate baselines; role-lift tables; sim_convergence join; board_lock, nfl_game_calls_graded, por_log timing; buckets_log, lamp_goal_log, lamp_goal_games, lamp_prop_log lock-lead check (no row locked after start); odds_snap join; dash_lines MAE; numerology lanes; pairs/pools vs independence. Scripts: `docs/audits/scripts/`.

Limits:
- Ablation is NOT possible for: NFL `board_lock` (stores score, rank, status only), NBA `pct` (inputs, no per-term contributions), Top Totals. It is possible in principle for MLB locked rows (features stored, n=2,390, 46 nights) and NHL legs; I did not run it, because 46 nights cannot support a re-fit and ablation would be re-fitting the same sample.
- MLB base rates are among board candidates, not all league player-games.
- Odds comparisons span 14 days (n 193-236). NFL live sample is one week. BUCKETS is preseason.
- Probabilities: only `sim_hr_prob` and `td_game_probability` (NFL, n=33, Brier 0.2443 vs 0.2498, mean p 0.494 vs 0.485) are real probabilities; NHL `goalGameProbability` is labelled not calibrated and was not scored here.
- Not read in depth: `nfl_td_v3` shadow, `hr_v3_shadow`, NHL xG model internals, NFL snaps/injury feature code, `hist_*` tables.
- Data unavailable: per-game league HR rate, MLB closing line before 2026-09-26, NBA regular season, `sim_convergence` outcomes.
- The NHL goal accuracy agent (abad51b02c32b75c5) note had not landed when this was written; reference it for NHL backtest figures.

---------------------------------------------------------------------------------------------------

## 6. Top five actions most likely to improve genuine predictive performance and trust

1. Freeze MLB `hr_blend` and judge it only on locked rows, chronologically, against season HR/PA and the 14.9% base (F1, F2). Stop tuning on the pre-08-22 archive.
2. Stop labelling MLB HIT / HRR / CONTACT picks CALLED until a locked sample shows lift (F3). This protects the CALLED word the site and X depend on.
3. Grade `sim_convergence` nightly and evaluate the stored probability; it is the only MLB output that is already a probability and it matches the market on a small sample (F4, F12). Consider ranking by it if its lift holds on 100+ nights.
4. Rebuild the NFL board after inactives and block naming on the inactive list; keep `built_at` next to `locked_at` (F7, F15).
5. Make every public performance claim (X, site record) cite its locked n and interval, and say "preseason only" for BUCKETS and "n=4" for Top Totals (F8, F16, F5).

Do not rely on: numerology or pair/pool hit rates as signal (F10, F11).
