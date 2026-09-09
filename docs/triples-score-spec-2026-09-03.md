# The triples score — your six terms, checked against the live slate

Date: 2026-09-03 · Every field below was read off tonight's published board
(261 hitters, 469 fields each). Nothing is guessed. Prototype is written, run
and scored — see the bottom.

---

## Your spec, term by term

| you said | field on the row tonight | verdict |
|---|---|---|
| people already hitting them | `season_triples` + `season_pa` | ✅ **as-is** |
| park — triples in that park | *no* `park_3b_factor` — but `park_fit.dimensions` carries real LF/LCF/CF/RCF/RF distances | ⚠️ **proxy, and it works** |
| weather | full block: `weather_temp_f`, `wind_mph`, `wind_deg`, `humidity`, `roof` | ✅ **with one trap** |
| pitcher triples given | *no* `pitcher_triples_against` | ❌ **bot pass** |
| pitcher XBH given | `pitcher_xbh_vs_lhb/rhb` — **raw counts, no denominator anywhere** | ❌ **unusable as-is** |
| team errors allowed | *no* errors field — but `opp_def_oaa`, `opp_def_oaa_vs_hand` | ✅ **substitution upward** |
| BABIP | `season_babip`, `pitcher_babip`, `babip` | ✅ **as-is** |

Four of your seven are live and untouched. Here are the three that need a word.

### Park — no triples factor exists, but the dimensions do

The slate carries `park_hr_factor`, `park_hits_factor`, `park_dist_factor`,
`park_barrel_factor`, `park_hardhit_factor`, `park_k_factor`. **No triples
factor.** But `park_fit.dimensions` has the actual wall distances, and a triple
is a ball hit where the fielders are not — the gaps, measured against how short
the corners are.

Ranking tonight's 15 parks by `(LCF+RCF)/2 − (LF+RF)/2`:

    Fenway Park            +94    LF310  LCF379  CF390  RCF420  RF302
    PNC Park               +60
    Kauffman Stadium       +57
    Dodger Stadium         +55
    Angel Stadium          +48
    ...
    Wrigley Field          +14

That is the real MLB triples leaderboard, reproduced from fields already on the
row. Fenway, PNC and Kauffman are the three biggest triples parks in the sport.
**The proxy holds, and it costs nothing.** A true season `park_3b_factor` from
the bot would still be better and is worth asking for — but you are not blocked.

### Weather — the trap you'd have walked into

`weather_hr_effect_pct` is right there and it is tempting. **Do not use it.** It
is tuned to home runs and it is dominated by wind blowing *out* — which pushes
the ball over the fence instead of into the gap. For triples it is neutral at
best and backwards at worst. The prototype reads the raw environment instead
(hot, thin air carries a gapper to the wall) and ignores the HR verdict.

### Pitcher XBH — the numbers are counts, not rates

`pitcher_xbh_vs_lhb` runs 0 to 43, median 13. `pitcher_xbh_vs_rhb` runs 0 to 40.
**There is no `pitcher_bf`, no innings, no PA-against field anywhere on the 469.**
So ranking by these ranks workload, not vulnerability — the durable starter tops
the board over the genuinely hittable one. They are deliberately unused.

What is already a rate and says the same thing honestly: `pitcher_ld_rate`,
`pitcher_iso_against`, `pitcher_slg_against`, `pitcher_gb_rate`, `pitcher_babip`.
The prototype uses those. **The bot ask is one field: batters faced.** With it,
your XBH term becomes real in an afternoon.

### Errors → OAA, and this is an upgrade

Errors aren't published. They're also not the right stat: a triple is a ball
that *lands*, not a ball that's dropped. What is published is `opp_def_oaa` and
`opp_def_oaa_vs_hand` — Outs Above Average, i.e. **range**. Bad range in the
gaps is precisely the defensive failure that turns a double into a triple. This
is a substitution up, not a compromise.

---

## The two terms you didn't name, and why they're in anyway

Everything on your list could equally describe a **double**. Two things make it
a triple, and without them the score is a doubles score wearing the wrong label:

- **`recent_ld_rate` / `l25pa_ld_rate`** — a triple is a ball on a line, not in
  the air. This is the shape term.
- **`season_sb_attempt_rate`** — legs. Sprint speed is still unpublished (same
  blocker that has the SB simulator on hold), so attempt rate stands in, and is
  labelled a proxy everywhere it shows.

## Weights — a prior, not a fit

    own 3B rate      30      pitcher (LD/ISO/GB)   12
    gap depth        14      park hits factor       5
    legs proxy       14      defence (OAA, inv)     5
    line-drive rate  14      BABIP                  3
                             air carry              3

Nothing was regressed against anything, because **27 graded triples cannot
support a regression.** These encode one claim only: a man's demonstrated rate
outweighs his circumstances, and legs plus line drives are what separate this
board from the doubles board. The day the outcome column can carry a fit, these
get replaced by one.

---

## It runs, and it is not hr_score in a hat

Prototype `lib/triples.js` is attached and executed against tonight's 261 rows.

**Tonight's top 12:**

     78.1  Jake McCarthy      Coors Field         3B=8  hr_score 41.1
     76.7  Jung Hoo Lee       PNC Park            3B=4  hr_score 11.7
     75.8  Jakob Marsee       Kauffman Stadium    3B=5  hr_score 26.9
     75.2  Wilyer Abreu       Fenway Park         3B=4  hr_score 40.3
     72.2  Blaze Alexander    Coors Field         3B=2  hr_score 34.0
     72.1  Zach Neto          Angel Stadium       3B=4  hr_score 43.6
     71.4  Geraldo Perdomo    Chase Field         3B=6  hr_score 13.6
     71.1  Jacob Young        Nationals Park      3B=3  hr_score 16.2
     70.6  Elly De La Cruz    Great American      3B=5  hr_score 28.7
     70.2  Daylen Lile        Nationals Park      3B=6  hr_score 68.5
     70.2  Jarren Duran       Fenway Park         3B=4  hr_score 41.7
     70.1  Jazz Chisholm Jr.  Angel Stadium       3B=3  hr_score 34.4

Bottom: Sal Frelick 18.7, Jonah Heim 22.9, Jackson Chourio 23.3, Alex Bregman
24.1, Nathaniel Lowe 24.6 — all 0 or 1 triple on the year.

**`r(triple_score, hr_score) = −0.031`.** Statistically orthogonal to the home
run score across all 173 scored hitters. That is the result that matters most:
this is a second model, not the first one relabelled. Every individual term
also correlates near zero with `hr_score` (max |r| = 0.12).

**The PA floor blocks 88 of 261.** Under 250 PA the score returns `null` with a
reason string, not a small number — same discipline as the steal board's
5-attempt gate. Without it, Jonah Cox (76 PA) and Dustin Harris (73 PA) both
crashed the top ten on noise.

**Known artifact:** Sal Frelick is genuinely fast and finishes last, because the
own-rate term is 30% and he has zero triples this year. Defensible, but it is
the shape of error this weighting will make.

---

## Where it goes, and the one line that must stay true

It computes **in the site**, not the bot — every input is already published, so
there is no bot pass, no data-branch wait, and it can be deleted in one commit.
It never enters `MODEL_WEIGHTS`, so it cannot contaminate `hr_score`.

And it is still ungraded: 27 events in 2,297 player-nights. So it ships as a
**published column beside the graded outcome** — not badging a card, not leading
a verdict, not the default sort. That's the two-lane rule you already run on,
and this is the score it was written for. The `HAS_SCORE` exclusion in
`OddsBoard.js` stays as it is until the column earns its way out.

## Three asks for the bot, in order of value

1. **`pitcher_bf`** (batters faced) — turns your XBH term from a count into a
   rate. One field, one afternoon.
2. **`park_3b_factor`** — a real season triples factor per venue, replacing the
   dimension proxy.
3. **Grade the whole 261-row slate, not just the ~90 picks** — the only change
   that meaningfully shortens the road from 27 events to a fittable sample.
