# The game simulator — what I built, and the four bugs it caught me on

Date: 2026-09-03 · `lib/gameSim.js` · runs against tonight's real slate, all 15 games

---

## First, the thing you already have is not this

`components/GameSimulator.js` (2026-08-24) is a **projection panel**. It takes
one pitcher and one batter, applies a fixed 5.2 IP / 4.3 PA exposure, and prints
expectations plus a Poisson strikeout bar. It has no innings, no baserunners, no
score. **It cannot tell you who wins.** That is why the box score you sent
doesn't come out of it.

This plays the game. Plate appearance by plate appearance, nine innings or
extras, a real base-out state machine, a starter who tires and gets hooked, a
bullpen that finishes it, and a box score with the columns the real one has.

**2,000 full games in ~250ms**, client-side. No new backend — every input is a
field already on the slate row the app fetches.

## How a plate appearance is decided

Batter rate and pitcher rate are combined by **log5** (the odds-ratio method),
not averaged. A .300 hitter facing a pitcher who allows .200 should land *below*
the midpoint, and an average gets that wrong in both tails.

    K       batter season_k_rate   × pitcher_k_rate
    BB      batter season_bb_rate  × pitcher_bb_pct
    HR      batter HR/PA           × pitcher_hr9_vs_{lhb,rhb}   ← platoon split
                                     × park_hr_factor × weather_hr_effect_pct
    in play BABIP blend × park_hits_factor, then split 1B/2B/3B by the
            batter's own season shape — which is where lib/triples.js's
            subject lives: a man with 8 triples in 500 PA legs one out here at
            his real rate, and a catcher with none never does.

Then the base-out machine: forced advance on walks, runners going first-to-third
or scoring on singles and doubles at real frequencies, ground-ball double plays,
sac flies, the automatic runner in extras (and his run correctly scored
**unearned**).

---

## The four bugs, because each one is a lesson

**1. Every team was batting against its own pitcher.** The slate row carries the
pitcher a batter *faces* (`pitcher_name`), never his own team's. I keyed the
staffs by the defending side, which inverted it — ATH hit against ATH's starter
all game. **The totals still looked exactly like baseball.** Nothing in the box
score was out of range; it was only visible by reading a name. Staffs are now
keyed by the batting side, with a comment saying why.

**2. A backup catcher homered in 40% of games.** Brian Serven had a couple of
homers in a handful of trips, `season_hr / season_pa` read as an enormous rate,
and log5 faithfully amplified it. **A simulator that takes small samples at face
value will always hand its loudest result to its least established player.**
Every batter rate is now regressed toward league by its own stabilisation point
— K% 60 PA, BB% 120, HR/PA 170, BABIP 820 BIP. Serven's 40% became 6%; the top
of the board is now Burger and Foscue, which is correct.

**3. The W went to the losing pitcher.** Same keying error as #1, surfacing in
the one place totals can't hide it.

**4. `% 9` crashed the sim mid-inning.** Several clubs published only eight
hitters tonight. It now cycles the real lineup length and sets
`partialLineups`, so the UI can say "8 of 9 posted" instead of quietly
over-feeding the men who are there.

---

## Calibration against tonight's 15 games

    slate mean total runs   8.15   (MLB ~8.6)
    mean home win%          48.3   (MLB ~53%)
    tie rate                0.01%
    Coors Field            11.0 total  ·  Progressive Field 5.8  ·  Wrigley 7.1

The park spread is right and the renamed yard (Dodger Stadium is publishing as
"UNIQLO Field at Dodger Stadium" tonight) is matched loosely so a sponsor change
can't silently flip the home team.

**Two honest gaps in that calibration:**

- **Runs are ~0.5/game light.** The engine has no errors, no wild pitches, no
  passed balls and **no stolen bases** — all of which manufacture runs. The
  steal data is already on the row (`season_sb_attempt_rate`, `opp_catcher_cs_rate`,
  `pitcher_sb_against`), so the running game is the obvious next addition and
  it would close most of the gap.
- **Home field is the one number not derived from a published field.** Nothing
  on the payload says home teams win more, and they do. It's stated as an
  explicit exported constant, `HFA = 1.02`, not buried in a rate. Set it to 1
  and the sim makes no claim it can't source.

**Relief arms are the one place it can't be honest with names.** The slate gives
a team bullpen line and nothing else — no names, no roles, no handedness. So the
relievers are the same modelled arm and the box labels them `BULLPEN 1..n`
rather than inventing six names it doesn't have.

---

## What it gives you that the screenshot doesn't

A single box score is one draw. Running it 2,000 times gives you the spread,
and that's the reason to own the simulator rather than screenshot someone else's:

    ATH @ TEX     win%  ATH 55.6 / TEX 44.4
                  total runs  mean 8.5   p10 3   p50 8   p90 14
                  HR odds     Burger 21% · Foscue 21% · Duran 17% · Cauley 15%

Those per-player HR probabilities are a **second, independent read on the same
market `hr_score` prices** — built from a different mechanism entirely (nine
innings of simulated PAs vs. a weighted signal blend). Where they disagree is
interesting. That's a convergence check you couldn't run before, and it's the
shadow-overlay idea from the audit arriving by a different road.

## API

    import { gameFrom, simGame, simulate } from '../lib/gameSim'

    const game = gameFrom(players, gamePk)   // builds from slate rows you have
    const one  = simGame(game, seed)         // one box score, seeded & replayable
    const dist = simulate(game, 2000)        // win%, run spread, HR odds, + a box

`simGame` is seeded by `mulberry32`, so a given game_pk + seed always replays
identically — a box score you link someone to has to still be there when they
open it.

## Questions

1. **Want me to wire the panel?** The engine is done; the box-score UI in your
   screenshot is a component on top of it. Where does it live — inside the game
   cockpit, or its own view off the Games page?
2. **Add the running game?** Steals, errors and wild pitches close most of the
   0.5-run calibration gap, and every input is already published.
3. **Should the sim's HR probabilities show next to `hr_score` as a convergence
   column?** They're genuinely independent, which is what makes agreement mean
   something.
