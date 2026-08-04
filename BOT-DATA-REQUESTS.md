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

Grading every pick category against its own outcome rather than against home
runs, over 9 graded days:

| Pick | n | Job | Did it |
|---|---:|---|---:|
| TOP | 167 | 1+ HR | **32.9%** |
| HIT | 157 | 1+ hit | 77.7% |
| HRR | 108 | 2+ H+R+RBI | 52.8% |
| CONTACT | 75 | 2+ TB | 28.0% |
| HR | 134 | 1+ HR | **14.9%** |

**The bucket named for home runs produces them at less than half the rate of the
bucket that isn't.** HR 14.9%, TOP 32.9%.

Rate across all 648 graded slots is 18.4%, but **that is not a control group** —
it's the average of these same buckets, and TOP is what pulls it up. TOP's 55
homers are roughly half of the ~119 total in the archive. So the honest
comparison is HR against TOP head to head, not either against 18.4%.

Two caveats in the other direction:

- 134 HR picks is a small sample. The interval around 14.9% is wide.
- **It is unconfirmed whether TOP overlaps the other four categories.** If TOP
  is a best-of-the-board flag layered on top of a pick that also has a category,
  it isn't a rival to HR at all — it's a different kind of label, and the
  comparison is much softer than it looks. `game_pick_role` splits on `/`, which
  suggests compound roles exist. Worth resolving before acting on this.

Either way, the HR bucket at 14.9% against its own stated job is the weakest
category in the archive by a distance, and that part doesn't depend on the
comparison.

This is now on the site under Results → Picks → *Did its job*, not buried here.
