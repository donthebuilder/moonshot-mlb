# Bot data requests

Everything the site currently fakes, derives, or can't validate — and the exact
bot-side change that would fix it. Nothing here is a site bug. These are all
fields the dashboard wants and the published payload doesn't carry.

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
