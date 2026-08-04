# Bot data requests

Everything the site currently fakes, derives, or can't validate — and the exact
bot-side change that would fix it. Nothing here is a site bug. These are all
fields the dashboard wants and the published payload doesn't carry.

## THE CHECKLIST — every missing field, with its exact file point

Verified against the copies of `grade_results_tracker.py` and
`mlb_dashboard.py` in the results folder. The first two groups are trivial:
in both cases the API response dict being read ALREADY CONTAINS the missing
fields — they're sitting unread in the same object the existing lines pull
from.

| # | Field | File | Function / anchor | Source key (already in the dict) |
|---|---|---|---|---|
| 1 | `actual_k` | grade_results_tracker.py | `get_player_batting_line()` ~line 344, then `grade_slot()` ~line 885 | `batting["strikeOuts"]` |
| 2 | `actual_bb` | grade_results_tracker.py | same two functions | `batting["baseOnBalls"]` |
| 3 | `actual_doubles` / `actual_triples` | grade_results_tracker.py | same two functions | `batting["doubles"]`, `batting["triples"]` |
| 4 | `season_tb` | mlb_dashboard.py | `flatten_season_hitting()` ~line 1786 | `stat["totalBases"]` |
| 5 | `season_ab` | mlb_dashboard.py | `flatten_season_hitting()` | `stat["atBats"]` |
| 6 | `season_doubles` / `season_triples` | mlb_dashboard.py | `flatten_season_hitting()` | `stat["doubles"]`, `stat["triples"]` |
| 7 | `season_babip` | mlb_dashboard.py | `flatten_season_hitting()` | `stat["babip"]` |
| 8 | `hrw_score`, `pitch_mix_score`, `top_board_score_v2`, `recent_375_num` onto graded slots | grade_results_tracker.py | `grade_slot()` — copy from the slate row at grade time | slate row |
| 9 | `pitcher_name`, `pitcher_id`, `pitcher_throws` onto graded slots | grade_results_tracker.py | `grade_slot()` | slate row |
| 10 | `weather_temp_f`, `weather_wind_mph`, `park_factor` back onto graded slots | grade_results_tracker.py | `grade_slot()` — they were there in April, dropped since | slate row |
| 11 | `pitcher_gb_rate`, `pitcher_ld_rate`, `pitcher_popup_rate` (publish 0 on all 268) | mlb_dashboard.py | the pitcher batted-ball aggregation — check `bb_type` is read before the groupby | Statcast pull |
| 12 | `alt_look_tag` | mlb_dashboard.py | ALT LOOKS build ~line 8026 — stamp the tag on the record when `alt_rows` is assembled | already computed |
| 13 | `pitcher_l5_*` block (era/hr9/whip) | mlb_dashboard.py | same place `pitcher_l3_*` is built | same query, n=5 |
| 14 | ISO into `hr_score` itself | mlb_dashboard.py | wherever hr_score is blended — see the calibration section below | `season_iso`, already on the record |
| 15 | Pair history per market: `same_day_hit_count`, `same_game_hit_count`, `same_day_hrr_count` alongside the existing co-HR counts | the pair-history builder that writes `pair_history_summary` (top_pairs) | same aggregation, run over `actual_hits`/HRR outcomes instead of only `actual_hr` | graded slots already carry the outcomes |

What each unlocks, in one line: #1–3 make K Risk auditable and stop CONTACT
picks being graded a failure for walking. #4–7 make League Leaders exact
instead of estimated (TB is currently `SLG × (PA × (1−BB%))` on the client —
close enough to rank by, wrong as a season total). #8–10 let every score be
backtested against the day it was generated instead of joined to tonight's
slate. #11 completes the pitcher batted-ball profile the site now shows.
#12 makes ALT LOOKS gradeable — the site's Track record picks it up as a
seventh category with zero changes. #14 is the scoring fix the whole audit
points at; the site's ×ISO multiplier is a stopgap that becomes a no-op the
day it lands. #15 completes the Pair Builder's market toggle: today the
builder ranks tonight's half on your chosen market (HR / hit / HRR / TB) but
the history half is co-HR days in every market, because that's the only pair
history published. The site probes for the new field names and will use them
automatically when they appear.

Site-side status, for completeness: everything published IS being pulled.
`today_slim` (all 268-row fields incl. the new pitcher batted-ball columns),
detail/splits/zones per player, graded days + backtest, results_live, the
breakdown txt for the header projection, and the 39-day pick matrix shipped as
a snapshot at `public/pick_matrix.json`. The only data the site fakes is what
this table says the bot doesn't publish — each spot says so on the page where
it happens.

**Reminder: do not edit `~/MLB-HR-DASHBOARD`** — it's pre-migration. Clone
fresh from the online repo, make these changes there.

---

## Situational splits — verified sitCodes and where they go in scoring

All codes verified against `GET /api/v1/situationCodes` and a live 2026
response (Wheeler, pitching, `h,a`) on 2026-08-04. One call per player:

```
GET statsapi.mlb.com/api/v1/people/{pid}/stats
    ?stats=statSplits&group={pitching|hitting}&season={yr}&sitCodes={codes}
→ stats[0].splits[], each with split.code and a full stat dict
  (homeRunsPer9, slg, ops, avg, atBats, homeRuns, rbi, battersFaced …)
```

The site now pulls these live, per player, when a modal opens (context only,
`lib/situational.js`). To make them SCORE, the bot pulls them at slate build in
`player_splits.py` / `mlb_dashboard.py` and publishes them, because only
bot-published fields reach the graded archive and can be validated.

### Pitcher — codes and scoring placement

| sitCodes | What | Publish as | Where it scores |
|---|---|---|---|
| `pi000,pi760` | first 75 pitches vs 76+ (TTO proxy — no direct TTO code exists) | `pitcher_fatigue_hr9_delta` = hr9(76+) − hr9(≤75) | New term in `pitcherOverall` / attack: `+0.10 × norm(delta, 0, 1.5)`, weighted by how deep he typically goes (`pitchesPerInning × innings`) |
| `h,a` | home/away | `pitcher_hr9_tonight_venue` (pick the side for tonight's park) | REPLACE plain `pitcher_hr9` in `matchup_score`'s `0.20` term — same weight, venue-correct number |
| `dr4,dr5` | 4 vs 5+ days rest | `pitcher_short_rest_flag` | Small penalty/bonus in attack tag, ±2 points, flag not blend |

### Batter — codes and scoring placement

| sitCodes | What | Publish as | Where it scores |
|---|---|---|---|
| `h,a` | home/away ISO | `batter_iso_tonight_venue` | Feed the ISO multiplier with the venue-correct ISO instead of season ISO — same calibration table, better input |
| `risp` | scoring position | `batter_risp_ops` | HRR and CONTACT scores only: `+0.10 × norm(risp_ops, .550, .950)`. Those jobs are cashing traffic; season lines don't measure that |
| `ac` | ahead in count | `batter_ahead_slg` | HR score: `+0.08 × norm(ahead_slg, .400, .900)` — most HR damage happens ahead; pairs with pitcher first-pitch-strike% for a count-leverage read |
| `2s` | two strikes | `batter_two_strike_ops` | K-risk score: replace the `season_k_rate` 0.40 term with `0.25 k_rate + 0.15 (1 − norm(two_strike_ops, .350, .700))` — his own two-strike survival, not just how often he gets there |

### Rules for all of the above

Same discipline as ISO: publish first, calibrate against graded outcomes
before weighting anything permanently. The weights above are starting points
sized to the archive's effect sizes, not conclusions. Each new field should
run through the same quartile test that exposed hr_score — if it doesn't
separate, it comes back out. Minimum-sample guards: skip any split under
~40 batters faced (pitcher) / ~30 AB (batter) and fall back to the season
number rather than a noisy split.

**Deliberately not pulled:** BvP (batter vs this pitcher) — 5–20 PA samples,
mostly noise, would need heavy shrinkage to be honest and adds little over
split-by-hand + arsenal matching, which the bot already has. Monthly splits,
day-of-week, post-win/loss — astrology with box scores.

This repo is read-only and has no bot. All changes below belong in
`donthebuilder/MLB-HR-DASHBOARD-STREAMLIT`. **Do not push them from
`~/MLB-HR-DASHBOARD`** — that local clone is pre-migration (it still has
`today_bot.py` and is missing `mlb_dashboard.py`, `make_slim.py`,
`player_splits.py` and `publish_data.sh`). Pushing from it would roll the bot
back. Clone fresh.

Ordered by how much each one buys.

---

## 1. `live_results_tracker.py` — write strikeouts onto graded slots

**Priority: highest. This is the one that unlocks validation.**

Graded slots carry `actual_ab`, `actual_hits`, `actual_hr`, `actual_rbi`,
`actual_runs`, `actual_tb`. There is **no strikeout outcome anywhere in the
archive** — 0 of 648 graded slots across 9 days.

That means the K Risk score on the site is a transparent blend of four published
rates and *cannot be calibrated*, ever, from the current data. Unlike the Pools
BANDS table — which shows observed hit rates over graded days and is therefore
honest — K Risk has never been checked against a single real outcome. The site
says so wherever the number appears, but saying so is not the same as fixing it.

Add to the per-slot dict:

```python
"actual_k":  int(box.get("strikeOuts", 0) or 0),
"actual_bb": int(box.get("baseOnBalls", 0) or 0),
"actual_doubles": int(box.get("doubles", 0) or 0),
"actual_triples": int(box.get("triples", 0) or 0),
```

`actual_bb` also lets the site check whether a CONTACT pick is being walked out
of its own job, which currently reads as a failure.

Once `actual_k` lands, K Risk becomes auditable the same way the pick scorecard
is now: bucket by predicted risk, show observed K rate per bucket, and the score
either earns its place on the boards or gets pulled.

## 2. `live_results_tracker.py` — carry the model scores onto graded slots

`hrw_score` and `recent_375_num` are present as keys on graded slots but are
**0 on all 90 rows**, which is why the Results header had to be rebuilt to join
back to the slate by `player_id` to show anything at all. `pitcher_name` is on
**zero** graded rows, which is why the Results → Pitchers view was empty for
weeks before the same join fixed it.

Those joins work but only for *today* — an older graded day joined against
tonight's slate matches the wrong pitcher, and the site has to warn about it on
screen. Stamping the values at grade time removes the whole class of problem.

Carry through, at grade time, from the slate row:

```python
"hrw_score", "recent_375_num", "recent_350_num",
"pitcher_name", "pitcher_id", "pitcher_throws",
"pitch_mix_score", "top_board_score_v2",
"park_hr_factor", "wind_direction_label",
```

Without these, no score on the site can be backtested against the day it was
actually generated for. With them, all of them can.

## 3. `mlb_dashboard.py` — pitcher ground-ball, line-drive and popup rates

`pitcher_gb_rate`, `pitcher_ld_rate` and `pitcher_popup_rate` are published as
**0 on all 268 rows**. The only working GB/LD/popup fields in the payload are
`l25pa_gb_rate`, `l25pa_ld_rate`, `l25pa_popup_rate` — and those are the
**hitter's** last-25-PA rates, not the pitcher's. Wiring the pitcher columns to
them would look right and be silently wrong, so the Pitchers table ships without
ground-ball and line-drive columns and states why in its caption.

Fly ball is fine — `pitcher_fb_rate` (268/268, mean 0.38) and
`pitcher_statcast_fb_rate` (268/268, mean 0.34) both work and are now on the
board. It's the complement of the batted-ball profile that's missing, and
without GB% you can't tell a fly-ball pitcher from one who allows everything.

Likely cause: the aggregation is computing these off a column that's empty or
renamed in the Statcast pull. Worth checking whether `bb_type` is being read
before the groupby.

## 4. `mlb_dashboard.py` — season counting stats for League Leaders

League Leaders is a straight season-stats page — no model scoring — and several
columns are **derived on the client because the bot doesn't publish them**:

| Column | Today | Wanted |
|---|---|---|
| TB | `SLG × (PA × (1 − BB%))` | `season_tb` |
| AB | `PA × (1 − BB%)` | `season_ab` |
| BABIP | derived | `season_babip` |
| 2B / 3B | not shown at all | `season_doubles`, `season_triples` |

The AB estimate ignores sacrifices, hit-by-pitch and catcher's interference, so
every TB figure on that page is off by a small amount that grows with playing
time. It's close enough to rank by and wrong enough that it shouldn't be
presented as a season total. Publishing `season_ab` and `season_tb` directly
makes the page exact instead of approximately right.

`season_runs` and `season_rbi` are already published and correct.

## 5. `mlb_dashboard.py` — pitcher recent form beyond L3

`pitcher_l3_era`, `pitcher_l3_whip`, `pitcher_l3_hr9` and
`pitcher_l3_starts_found` exist and work, and the Overall pitcher score now
blends **70% season / 30% L3** off the back of them.

Three starts is thin — often 15 innings. An `pitcher_l5_*` block would let the
recency term carry more weight without getting noisier. The site's blend already
probes for `pitcher_l5_hr9` / `pitcher_l5_era` at runtime and will pick them up
automatically if they ever appear, no site change needed.

---

## What the archive already proves

Worth stating plainly because it changes how the picks should be read, and it
came out of data that's already published.

Measured on the **local `results/` folder — 3,973 picks across 39 graded days,
2026-04-16 to 2026-06-22.** That is roughly six times what the published `data`
branch carries, and the extra data changed the answer.

| Pick | n | Job | Did it | HR% |
|---|---:|---|---:|---:|
| HIT | 1035 | 1+ hit | 64.5% | 11.2% |
| HRR | 1040 | 2+ H+R+RBI | 48.0% | 15.1% |
| CONTACT | 521 | 2+ TB | 38.2% | 12.5% |
| TOP | 582 | 1+ HR | 19.2% | 19.2% |
| TOP15 | 217 | 1+ HR | 18.9% | 18.9% |
| HR | 578 | 1+ HR | 15.4% | 15.4% |
| **ALL** | **3973** | — | **40.5%** | **14.6%** |

**The defensible claim is narrow: the HR bucket does not distinguish itself from
any other pick on home runs.**

- TOP 19.2% vs HR 15.4% — z=1.73, **p=0.084**. Suggestive, not significant.
- HR 15.4% vs every other pick 14.5% — z=0.59, **p=0.556**. No difference.
- 95% intervals overlap heavily: TOP [16.2, 22.6], HR [12.7, 18.6].

It is **not** established that the HR bucket is worse, and **not** established
that TOP is better. An earlier draft of this file claimed HR picks homered below
baseline while TOP nearly doubled it — that came from a nine-day slice of the
published branch and did not survive the full archive. Recorded here so the
mistake isn't repeated.

### Audit: unused signal in the archive (2026-08-04)

Every published field bucketed against actual HR outcome, 3,973 graded slots.
The finding that dwarfs everything else:

**Season ISO is a stronger HR predictor than any score the bot computes.**

| season_iso | HR rate | n |
|---|---:|---:|
| < .13 | 8.2% | 610 |
| .13–.18 | 11.0% | 1032 |
| .18–.23 | 15.7% | 877 |
| ≥ .23 | **22.2%** | 1082 |

Spread +14.0 — monotone, nearly 3×, bigger than hrr_score (+13.3) and triple
hr_score (+4.7). Worse: **ISO's signal is almost entirely OUTSIDE hr_score.**
Within every hr_score quartile, ISO≥.20 hitters homer at ~20–21% and ISO<.20
hitters at ~10–13%. A bottom-quartile-score high-ISO hitter (16.3%) out-homers
a top-quartile-score low-ISO hitter (13.4%). The score is nearly irrelevant
once you know ISO — it's chasing recency and matchup while underweighting the
one stable trait that decides who homers.

The cheap rule this implies: **22% of HR-type picks (305/1377) had ISO<.18 and
homered 11.5%. HR-type picks with ISO≥.23 homered 21.4%.** A hard ISO floor on
the HR/TOP buckets is the single highest-yield change available, and it costs
one line.

Stacking published flags (all verified on graded slots):

| Rule | HR rate | n |
|---|---:|---:|
| ISO≥.23 | 22.2% | 1082 |
| + lineup spot ≤ 4 | 23.3% | 885 |
| + weak_spot_flag | **26.3%** | 194 |
| slate baseline | 14.6% | 3973 |

Other bucketed fields, briefly: weak_spot_flag ON 18.0% vs OFF 13.9% (real,
keep it). lineup_confirmed ON 15.2% vs OFF 10.2% (unconfirmed hitters drag —
argues for down-weighting unconfirmed rows at pick time). Lineup spots 1–4 beat
5–9 (16.5% vs 11.7%). recent_375_num 0 vs 1+ is 11.7% vs 15.7% (modest, already
partly in the scores). pitcher_hr9 is NON-monotone (16.0% / 11.6% / 17.6% /
16.8%) — as a standalone filter it's noise, consistent with pitcherOverall
needing more than HR/9. recent_fb_rate and recent_barrel_rate: non-monotone,
weak on their own.

**Weather and park are unverifiable** — `weather_temp_f`, `weather_wind_mph`,
`park_factor` were carried on April graded files and then dropped from the
schema. Temperature is a known physical HR factor; right now there is no way
to check what it's worth on this slate pool. Add them back to graded slots
(they're already computed at slate time).

### Is ALT LOOKS worth tracking?

Unknown, and currently untrackable — that's the answer. Nothing in any graded
file records who was an ALT look (`game_pick_role` covers only the five main
categories), and only one breakdown sheet exists locally, so there is no way to
grade the section retroactively. The section's design (small-sample and
variance names, explicitly "not primary plays") makes it exactly the kind of
claim that should be checked before anyone trusts it. One bot line fixes it:
stamp `alt_look_tag` ("HOT/DUE" / "MATCHUP" / "VARIANCE" / "ALT") onto the slate
row when the section is built, and carry it into graded output like
`game_pick_role`. The site's Track record machinery will pick it up as a
seventh category with zero site changes.

### Score calibration — measured on the same 3,973 slots

Every graded slot carries the bot's own scores, so unlike the site composites
these CAN be validated. Quartiles of each score vs its own outcome:

| Score → outcome | Q1 | Q2 | Q3 | Q4 | top−bottom |
|---|---:|---:|---:|---:|---:|
| hrr_score → 2+ H+R+RBI | 41.2 | 49.2 | 51.6 | 54.5 | **+13.3** |
| hit_score → 1+ hit | 58.3 | 59.3 | 64.4 | 67.0 | **+8.7** |
| overall_score → HR | 11.2 | 13.8 | 14.9 | 18.5 | **+7.3** |
| hr_score → HR | 12.5 | 14.3 | 14.3 | 17.2 | +4.7 |
| contact_score → 2+ TB | 36.9 | 37.1 | 38.4 | 40.3 | +3.5 |
| overall_score → 1+ hit | 59.8 | 62.9 | 63.3 | 62.9 | +3.1 |

The one that should change the bot: **overall_score predicts home runs better
than hr_score does** (+7.3 vs +4.7). The score built specifically for HR is the
second-worst predictor of HR in the system. And hr_score's middle two quartiles
are identical (14.3/14.3) — it only distinguishes its extremes.

contact_score at +3.5 is close to flat, though the missing walk data (below)
means its outcome is mismeasured, so rework the outcome before reworking the
score.

Concrete bot changes, in order of expected payoff:

1. **HR picks: rank by overall_score, not hr_score** — or rebuild hr_score,
   using overall_score's inputs as the starting point. Zero new data needed.
2. **Slot players by their best category, not independently per category.**
   Players are consistently good at one job and bad at another (Bellinger 7/8
   HRR but 0/7 HR; Kurtz 7/9 HRR but 0/9 TOP; Jung 14/19 HIT but 0/6 TOP).
   At pick time: if a player's shrunken record in the target category is below
   its mean AND his record in another category is above its mean, swap slots.
3. **Add a small player-history term** — the empirical-Bayes rate
   `(did + 8·category_mean) / (picks + 8)` as a ±10% multiplier, capped.
   Small and capped because 39 days of history will partly be luck, and an
   uncapped term would just memorize April.
4. **Do not hard-exclude the fade list** — shrink toward the mean instead.
   Cowser 0/13 deserves a penalty; a 2/10 doesn't deserve zero.

Two structural notes that matter for reading any of this:

- A player can be picked in several categories on the same date, so category
  counts are picks, not distinct players. `pick_type=TOP15` maps onto several
  different `game_pick_role` values, so TOP15 is a board flag, not a sixth
  independent category.
- **No strikeout or walk outcome exists in any graded file**, so a CONTACT pick
  who walked twice is scored a failure. CONTACT's 38.2% is therefore a floor,
  not an estimate. This is the same gap as §1 and it distorts a real category
  today, not just a hypothetical audit.

This is now on the site under Results → Picks → *Did its job*, not buried here.
