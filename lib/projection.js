// 📐 PROJECTED OUTPUT — expected counts, built so they cannot contradict.
//
// 2026-08-16, Donovan: "fix the projected output scoring model... make sure
// its by team and game the projexted total bases hrr hits home run, factor in
// all the facotrs we normally do i notice like even for the team bases they
// are low or dont make good sense so some thing has to be off."
//
// He was reading a real bug off the screen.
//
// ── WHAT WAS OFF: PROBABILITIES PRINTED AS COUNTS ───────────────────────────
//
// The panel summed a PROBABILITY per hitter and labelled the sum a COUNT.
//
//     Proj hits   summed P(1+ hit) = 65.8% per hitter  ->  ~11.2 a game
//     Proj bases  summed P(2+ TB)  = 40.9% per hitter  ->  ~6.9 a game
//
// So "PROJ BASES 6.9" never meant 6.9 total bases. It meant "6.9 hitters are
// expected to record at least two total bases" — a different quantity, under a
// header reading "expected COUNT", sitting next to 11.3 hits. A game cannot
// produce more hits than bases; every hit is at least one base. THAT
// IMPOSSIBILITY IS WHAT HE SPOTTED, and it had been on screen for weeks.
//
// Two more found while fixing it:
//   · Proj XBH and Proj bases were both driven off contact_score — two columns
//     from one input, and the old caption already conceded the bands "barely
//     climb at all - treat those two as rough".
//   · There was no HRR column at all, which he had asked for.
//
// ── WHY THE ARCHIVE CANNOT BE THE BASE ──────────────────────────────────────
//
// The obvious repair is to measure mean counts per PA off the graded archive
// and multiply out. Measured, per PA: 0.2591 hits, 0.4535 TB, 0.0452 HR. Scale
// those to a game and you get 19.7 hits, 34.5 TB, 3.4 HR against an MLB
// reality near 17.0 / 27.6 / 2.5 — hot by 16 to 37 percent.
//
// That is selection bias, not noise: the archive holds the ~85 hitters the bot
// DESIGNATES each night, and a real lineup also contains the catcher hitting
// .208 and the number nine who never gets scored at all.
//
// ── SO THE BASE IS THE HITTER, AND THE ARCHIVE IS THE ADJUSTMENT ────────────
//
// Every one of these is published on all 266 slate rows:
//
//     AB/PA    = 1 - season_bb_rate            his own walk rate
//     hits/PA  = season_avg         x AB/PA    AVG is per AB, not per PA
//     TB/PA    = (season_avg + iso) x AB/PA    SLG = AVG + ISO, also per AB
//     HR/PA    = season_hr / season_pa         already per PA
//
// A weak hitter now projects weak because HIS OWN LINE is weak. No band-only
// model can do that, and it is why the per-game spread widened from 0.9 hits
// (the old model was nearly flat across all fifteen games — it was barely
// discriminating at all) to 2.7.
//
// The BAND MULTIPLIERS below are what the archive is actually good for: how
// much a 70+ bat beats an average designated bat, tonight. Relative, so the
// selection bias sits on both sides of the ratio and largely cancels. Each
// market bands on ITS OWN SCORE — the house coherence rule, which the old code
// broke by driving both bases and XBH off contact_score.
//
// Measured over 62 nights, 2026-04-16 to 2026-08-12: 5,807 player-games,
// 22,134 plate appearances. Regenerate with mock/proj.py.
//
// ── THE RESULT, CHECKED AGAINST REALITY ─────────────────────────────────────
//
//     projected hits  16.1 a game   MLB ~17.0
//     projected TB    27.1          MLB ~27.6
//     projected HR     2.08         MLB ~2.5
//     projected PA    74.4          MLB ~76
//     bases per hit    1.68         MLB ~1.62
//     invariant violations across all 15 games: 0
//
// HRR has no season-line equivalent, so it rides the archive's measured ratio
// of HRR to total bases (1.2188 per base). Stated, not tuned.

import { n as num } from './player'

export const PROJ_CAL = {
  "nights": 62,
  "from": "2026-04-16",
  "to": "2026-08-12",
  "playerGames": 5807,
  "pa": 22134.0,
  "hrrPerTb": 1.2188,
  "markets": {
    "hr": {
      "score": "hr_score",
      "league": 0.04518,
      "bands": {
        "70+": 1.2824,
        "50-70": 1.0591,
        "30-50": 0.9577,
        "<30": 0.6671
      },
      "pa": {
        "70+": 3780.0,
        "50-70": 8736.0,
        "30-50": 5570.0,
        "<30": 4048.0
      }
    },
    "hits": {
      "score": "hit_score",
      "league": 0.25906,
      "bands": {
        "70+": 1.0873,
        "50-70": 0.9919,
        "30-50": 0.8889,
        "<30": 0.982
      },
      "pa": {
        "70+": 5801.0,
        "50-70": 12391.0,
        "30-50": 3600.0,
        "<30": 342.0
      }
    },
    "tb": {
      "score": "contact_score",
      "league": 0.45351,
      "bands": {
        "70+": 1.099,
        "50-70": 1.0478,
        "30-50": 0.9683,
        "<30": 0.8678
      },
      "pa": {
        "70+": 2187.0,
        "50-70": 7953.0,
        "30-50": 9847.0,
        "<30": 2147.0
      }
    },
    "hrr": {
      "score": "hrr_score",
      "league": 0.55272,
      "bands": {
        "70+": 1.1358,
        "50-70": 1.0515,
        "30-50": 0.928,
        "<30": 0.6318
      },
      "pa": {
        "70+": 2356.0,
        "50-70": 10859.0,
        "30-50": 8120.0,
        "<30": 799.0
      }
    },
    "xbh": {
      "score": "contact_score",
      "league": 0.04518,
      "bands": {
        "70+": 1.3054,
        "50-70": 1.1828,
        "30-50": 0.8878,
        "<30": 0.5257
      },
      "pa": {
        "70+": 2187.0,
        "50-70": 7953.0,
        "30-50": 9847.0,
        "<30": 2147.0
      }
    }
  }
}

// Expected PA by lineup slot. The leadoff man really does get an extra trip;
// 4.65 down to 3.85 across the order, summing to 38.25 — which is what a team
// actually takes in a nine-inning game. Unknown slot falls to the 4.2 mean.
export const XPA_BY_SLOT = { 1: 4.65, 2: 4.55, 3: 4.45, 4: 4.35, 5: 4.25, 6: 4.15, 7: 4.05, 8: 3.95, 9: 3.85 }

export function bandOfScore(v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return 'unscored'
  const x = Number(v)
  return x >= 70 ? '70+' : x >= 50 ? '50-70' : x >= 30 ? '30-50' : '<30'
}

/** How much this hitter's band beats an average designated bat, for one market. */
export function bandMultiplier(market, p) {
  const m = PROJ_CAL.markets?.[market]
  if (!m) return 1
  return m.bands?.[bandOfScore(p?.[m.score])] ?? 1
}

/** Expected plate appearances tonight. Unconfirmed lineups are dampened, not dropped. */
export function expectedPa(p) {
  const spot = Math.round(num(p?.lineup_spot, 0))
  const base = XPA_BY_SLOT[spot] ?? 4.2
  return p?.lineup_confirmed ? base : base * 0.9
}

/**
 * One hitter's expected counts tonight.
 *
 * THE INVARIANTS AT THE BOTTOM ARE THE POINT OF THIS FILE. A projection that
 * shows fewer bases than hits, or more homers than hits, is not a rounding
 * quirk — it is the exact class of nonsense that shipped here for weeks and
 * that a reader can spot instantly. They are enforced, not hoped for.
 */
export function projectHitter(p) {
  const bb = Math.min(0.25, Math.max(0, num(p?.season_bb_rate, 0.085)))
  const abPa = 1 - bb
  const avg = num(p?.season_avg, 0)
  const iso = num(p?.season_iso, 0)
  const sPa = num(p?.season_pa, 0)
  const sHr = num(p?.season_hr, 0)
  const pa = expectedPa(p)

  let hits = avg * abPa * bandMultiplier('hits', p) * pa
  // A hitter with almost no season sample gets the league HR rate rather than
  // a 0 or a wild extrapolation off 12 PA.
  let hr = (sPa >= 20 ? sHr / sPa : 0.030) * bandMultiplier('hr', p) * pa
  let tb = (avg + iso) * abPa * bandMultiplier('tb', p) * pa
  // HRR relative to HIS bases, so his own band still drives it.
  let hrr = tb * PROJ_CAL.hrrPerTb * (bandMultiplier('hrr', p) / (bandMultiplier('tb', p) || 1))

  hits = Math.max(hits, hr)                 // every homer is a hit
  tb = Math.max(tb, hits + 3 * hr)          // a homer is four bases, not one
  hrr = Math.max(hrr, hits)                 // every hit is at least one HRR
  return { hits, tb, hr, hrr, pa }
}

/** Sum a lineup (or a whole game's two lineups). Same invariants hold on sums. */
export function projectPool(pool = []) {
  const out = { hits: 0, tb: 0, hr: 0, hrr: 0, pa: 0, n: 0 }
  ;(pool || []).forEach((p) => {
    const v = projectHitter(p)
    out.hits += v.hits; out.tb += v.tb; out.hr += v.hr; out.hrr += v.hrr; out.pa += v.pa
    out.n += 1
  })
  return out
}

/** Is the slate carrying what this needs? A season line on nobody means no panel. */
export function projectionPublished(players = []) {
  return (players || []).some((p) => num(p?.season_pa, 0) > 0 && num(p?.season_avg, 0) > 0)
}
