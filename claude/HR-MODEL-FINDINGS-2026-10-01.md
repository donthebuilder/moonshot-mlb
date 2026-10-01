# HR model: what the data actually says (2026-10-01)

Donovan asked: "with the claims figure it out, look for the data. We want to help people find the best
path to home runs with the scoring system." The HR call rate is around 17%.

## 1. The graded archive can't measure the scores honestly

`graded_results_<date>.json` (112 nights on the data branch, 2026-04-16 to 09-30) is written after the
games, and on the 14 nights that also have the pregame board (`slate_<date>_slim.json`) it disagrees
with what was published:

| field | changed between pregame board and graded file | homered that night |
|---|---|---|
| season_hr | 113 of 883 hitters | 109 of those 113 |
| last5_hr | 272 of 883 | 91 |
| last10_hr | 224 of 883 | 86 |
| hr_score | 746 of 883 | homer hitters' scores **fell** 4.5 on average; everyone else's rose 1.6 |
| hrw_score | | homer hitters fell 7.4; everyone else rose 2.9 |

The counting stats include tonight's home run, and the scores in the graded file come from a later
re-run. So any figure measured on this archive is biased one way or the other:
- the site's score bands ("70+ homered 19.8%, 195 of 987");
- "Power-3's top ten homer 21%";
- "board order 22% vs 17%";
- "80+ HRW homered 25%";
- "headline picks homer about 29%".

**None of them can be trusted as printed.**

## 2. The only clean test: 13 pregame boards (2026-09-17 to 09-30)

The pregame board as published, joined only to whether the hitter actually homered. That's 632
hitter-games and 95 homers, a 15.0% base. It's small, so treat it as direction, not proof.

**Top 10 each night, by:**

| signal | HR rate (n) | lift |
|---|---|---|
| last5_hr (homers in his last 5 games) | 36.2% (47/130) | 2.41x |
| last10_hr | 30.0% (39/130) | 2.00x |
| overall_score | 28.5% (37/130) | 1.89x |
| hr_score | 27.7% (36/130) | 1.84x |
| hr_per_pa | 26.9% (35/130) | 1.79x |
| hrw_score | 26.2% (34/130) | 1.74x |
| season_hr_game_probability | 25.4% (33/130) | 1.69x |
| season_hr | 23.8% (31/130) | 1.59x |
| pitch_type_match_score | 22.3% (29/130) | 1.48x |
| top_board_score_v2 | 20.0% (26/130) | 1.33x |
| board_score (what the picks use) | 18.3% (11/60, 6 nights) | 1.22x |
| damage_conversion_score | 17.7% (23/130) | 1.18x |
| power3_score | 16.9% (22/130) | 1.13x |
| park_hr_factor | 13.1% (17/130) | 0.87x |
| recent_barrel_rate | 12.3% (16/130) | 0.82x |

**HRW bands work and step down in order:** 80+ 28.1% (34/121) · 70–80 20.8% (16/77) · 55–70 12.5%
(16/128) · 45–55 13.6% (16/118) · under 45 6.9% (13/188).

**Pick roles:** TOP 21.1% (27/128) · WATCH 19.0% (33/174) · HRR 17.2% · HIT 13.4% · CONTACT 11.8% ·
**HR 9.0% (11/122)**, below the 15% base.

## 3. What this means for the HR call rate

- **The HR pick is the weak link.** The bot picks TOP = the highest `board_score` and HR = the next
  one (bots/mlb_dashboard.py `_top_and_hr_slots`). `board_score` averages the ranks of hr_score,
  season HR and season exit velocity, and it does worse than hr_score alone (18.3% vs 27.7%). The
  #2 slot is worse still.
- **Recent home runs are the strongest clean signal, and the model under-weights them.** recent_form
  carries 0.05 of the blend plus a 0.30 re-anchor. The bot's 09-25 note that recency "measured at
  ZERO" was very likely measured on this leaky archive.
- **Power-3, damage conversion, park and recent barrel rate barely help on clean data.** Power-3's
  "21%" claim doesn't hold up (16.9%).
- **The code has known defects** (from the trace of bots/mlb_dashboard.py):
  - season power and recency are counted twice;
  - the ace penalty is applied twice;
  - the "opportunity fold" never runs;
  - several weight comments are stale.

## 4. What it would take to fix (each needs Donovan's yes)

1. **Archive the pregame board every night, forever** (bot). A compact per-game file written at the
   pick lock: ids plus the published scores and inputs, about 100 KB a night. Nothing honest can be
   measured or retrained without it. Today the full pregame boards survive only 14 days.
2. **Stop overwriting pregame scores in the graded file** (bot). Keep the published scores as
   published, and put any re-run under its own keys.
3. **HR pick v4** (bot, new `mlb_pickmap_v4`, old records untouched): pick the HR slot by hr_score
   (or hr_score with HRW ≥ 70) instead of board_score #2. Run it in shadow first, logged beside v3,
   then switch on measured results.
4. **Site claims:** take the numbers in §1 off the site (Guide, Explain, ScoreBands, Power-3 board,
   board order) until they're re-measured on clean pregame data. Say "measured on N clean nights"
   once there are enough.
