'use client'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { teamOf, oppOf, hrScore, hitScore, n, clean, playerId } from '../lib/player'
import { penStatsFor } from '../lib/bullpen'
import { xpaFor } from '../lib/xpa'
import { projectPool, projectionPublished } from '../lib/projection'

// Projected output by game — expected COUNT, not a score.
//
// Ported from the Streamlit Games tab. The distinction it exists to make:
// every other number on this site is a rank, and a 78 only means "above a 62".
// These are projections. Each hitter's board score is mapped through the rate
// that its band ACTUALLY produced across 34 graded days, then summed over the
// lineup. So a cell reads "this game projects 2.4 home runs", which is a claim
// that can be wrong — unlike a score, which can't.
//
// CALIB is copied verbatim from streamlit_app.py. Do not tune these by hand:
// they're observed rates from the graded archive, and editing them turns a
// measurement back into a guess.
// ── THE COUNT COLUMNS WERE PROBABILITIES (fixed 2026-08-16) ───────────────
//
// Donovan: "i notice like even for the team bases they are low or dont make
// good sense so some thing has to be off."
//
// He was reading a real impossibility off the screen. CALIB used to hold
// per-hitter PROBABILITIES and the table summed them and called the sum a
// count:
//
//     Proj hits   summed P(1+ hit) = 65.8%  ->  ~11.2 a game
//     Proj bases  summed P(2+ TB)  = 40.9%  ->  ~6.9 a game
//
// "PROJ BASES 6.9" therefore meant "6.9 hitters should record two or more
// total bases", not 6.9 bases — printed under a header reading expected COUNT,
// beside 11.3 hits. A game cannot produce more hits than bases. Every hit is
// at least one base.
//
// The model now lives in lib/projection.js and produces real expected counts
// off each hitter's OWN season line (AVG, ISO, walk rate, HR rate), adjusted
// by his band and scaled by expected PA from his lineup slot, with the
// arithmetic invariants enforced rather than hoped for. That file carries the
// full derivation, including why the archive could not be the base.
//
// Checked against reality: 16.1 hits / 27.1 TB / 2.08 HR / 74.4 PA per game,
// against an MLB norm near 17.0 / 27.6 / 2.5 / 76. Zero invariant violations.
// And the spread across games went from 0.9 hits (the old model was nearly
// flat — it barely discriminated at all) to 2.7.
//
// HR keeps its own model (hrProbV2, ISO-blended and form-weighted) because it
// is separately calibrated and was never the broken column.
const COUNT_COLUMNS = [
  ['Proj hits', 'hits', 'expected hits, both lineups'],
  ['Proj TB', 'tb', 'expected total bases — always at least the hits'],
  ['Proj HRR', 'hrr', 'expected hits + runs + RBI'],
]
const COLUMNS = ['Proj HR', ...COUNT_COLUMNS.map((c) => c[0])]

// The HR score-band rates, which SURVIVE the rewrite unchanged — this column
// was never the broken one. Observed from the graded archive, copied verbatim
// from streamlit_app.py. Do not tune by hand: editing these turns a
// measurement back into a guess. (The hit / xbh / bases band tables that used
// to sit alongside are gone — they were P(cleared a bar), which is what this
// whole commit is about.)
const HR_SCORE_BANDS = { 0: 12.8, 40: 15.0, 55: 15.3, 70: 18.7, 85: 16.1 }

// MODEL V2 (2026-08-08 audit, bot-ship/docs/AUDIT_FINDINGS_2026-08-08.md).
// The 38-day archive audit (3,629 player-days, 519 HR) measured that season
// ISO predicts homers better than the board's own hr_score (AUC 0.620 vs
// 0.540), and that recent form carries real signal (last5_hr 0 → 9.0% HR
// rate, 3+ → 23.0%). So the HR probability is no longer score-band alone:
//
//   base   50/50 blend of the score-band rate (CALIB above, unchanged) and
//          the measured season-ISO band rate below. ISO missing → score only.
//   form   +10% relative per HR in his last 5 games, capped at +30%.
//   xPA    × (expected PA from lineup slot ÷ 4.2 league average) — the
//          leadoff man's extra trip is real; unknown slot → ×1, and
//          unconfirmed lineups are dampened ×0.9 rather than dropped.
//
// These band rates are OBSERVED, like CALIB — do not tune by hand.
const ISO_HR_BANDS = { 0: 8.2, 0.130: 11.0, 0.170: 15.5, 0.230: 22.2 }

// The measured form line, BEFORE normalisation. Anchored on the two rates the
// 2026-08-08 audit published — last5_hr 0 -> 9.0%, 3+ -> 23.0%, against an
// ISO-band base near 15.5%, i.e. 0.58x and 1.48x — then shrunk 62.5% toward
// 1.0, which is the same shrink the shipped +0.30 cap already implied against
// a measured +0.48. At l5 = 3 it lands on 1.30, exactly that cap. Not tuned.
const formOf = (p) => Math.min(1.30, 0.7375 + 0.1875 * Math.max(0, n(p?.last5_hr, 0)))

// ── RECENT PRODUCTION, beyond the homers (2026-08-11) ────────────────────
//
// Donovan: "last 5 production by the way h/r/rbi/xbh/hr/ks to help with
// projected output scoring."
//
// formOf above reads last5_hr and nothing else, so a hitter squaring
// everything up without one clearing the fence looked identical to a hitter
// making no contact at all. This adds the rest of the line.
//
// THREE HONEST CONSTRAINTS, stated because they bound what this is worth:
//
//  1. last5_hr is deliberately NOT in here. It is the whole of formOf, and
//     counting it twice would quietly square the one term already carrying
//     the most weight.
//  2. There is no last-5 strikeout field on the slate — only season_k_rate.
//     So the K input is season-to-date, not form. It enters POSITIVELY, which
//     looks wrong and is not: the archive scan found season_k_rate at +7.6pp
//     within fixed hr_score bands (see bot-ship/docs/JOB3-scan-followups.md),
//     the three-true-outcomes profile, and the blend weights it at only 0.04.
//  3. THE WEIGHTS BELOW ARE NOT MEASURED. Nothing has fitted xbh against
//     h+r+rbi against K% for next-day HR. They are a reasonable ordering, not
//     a result, and they are the second thing to calibrate after the pitcher
//     trend once the hr_events backfill lands.
//
// Which is exactly why this is NORMALISED and CAPPED like formOf: the term is
// divided by the slate mean, so whatever these weights are, they cannot move
// the projected total by even a tenth of a homer. They can only reorder
// hitters against each other. An unmeasured weight that cannot shift the level
// is a ranking opinion; one that can is a calibration bug.
const unit = (v, lo, hi) => Math.max(0, Math.min(1, (n(v, lo) - lo) / (hi - lo)))
const prodOf = (p) => {
  const xbh = unit(p?.last5_xbh, 0, 4)
  const hrr = unit(n(p?.last5_hits, 0) + n(p?.last5_runs, 0) + n(p?.last5_rbi, 0), 0, 12)
  const k = unit(p?.season_k_rate, 0.14, 0.32)
  return 0.88 + 0.24 * (0.45 * xbh + 0.35 * hrr + 0.20 * k)   // 0.88 .. 1.12
}

// ── THE BUILDING AND THE ARM (v3, 2026-08-15) ────────────────────────────
//
// Donovan: "seems like the scoring is leaning and not taking in park factor,
// winds and pitchers and streaks." He is right about two of the three, and
// the third is already here — worth saying which is which:
//
//   STREAKS are in. formOf() above is exactly that, and it is the term the
//   archive measured hardest (last5_hr 0 -> 9.0% HR rate, 3+ -> 23.0%).
//
//   THE PARK AND THE AIR were NOT. The slate publishes park_hr_factor (1.20
//   at Great American tonight — literally 20% more homers) and the weather's
//   own percentage effect, and this projection ignored both. Two hitters with
//   identical scores in Coors and in Oracle projected the same number, which
//   is the flattening he can see.
//
//   THE OPPOSING ARM was NOT. A 1.65 HR/9 starter and a 0.82 HR/9 starter are
//   not the same night, and only hr_score's internal blend knew that.
//
// HALF WEIGHT, BOTH. hr_blend already carries a park_weather term and two
// pitcher-damage terms, so the published factors would count the building and
// the arm a second time. Half is the honest correction for a term that is
// partly already inside the score — not a tuned number, a stated discount.
//
// NORMALISED, BOTH, exactly like form and production: divided by the slate's
// own mean so they REORDER hitters without moving the slate total. The total
// is calibrated against the graded archive; a term that shifts it is a term
// that breaks the one number this table promises.
function parkOf(p) {
  const pf = n(p?.park_hr_factor, NaN)
  const wx = n(p?.weather_hr_effect_pct, n(p?.hr_weather_effect_pct, NaN))
  let m = Number.isFinite(pf) && pf > 0 ? pf : 1
  if (Number.isFinite(wx)) m *= 1 + wx / 100
  if (!Number.isFinite(m) || m <= 0) return 1
  return Math.max(0.75, Math.min(1.35, 1 + 0.5 * (m - 1)))
}

// League HR/9 sits near 1.25. A hitter faces the starter for roughly 2.5 of
// his ~4.2 trips, so even at full strength this arm owns well under half the
// night — another reason the effect is halved rather than taken whole.
function armOf(p) {
  const hr9 = n(p?.pitcher_hr9, NaN)
  if (!Number.isFinite(hr9) || hr9 <= 0) return 1
  return Math.max(0.80, Math.min(1.28, 1 + 0.5 * (hr9 / 1.25 - 1)))
}

function hrProbV2(p, formNorm = 1, prodNorm = 1, parkNorm = 1, armNorm = 1) {
  const scoreRate = bandRate(hrScore(p), HR_SCORE_BANDS)
  const iso = n(p?.season_iso, NaN)
  const base = Number.isFinite(iso)
    ? 0.5 * scoreRate + 0.5 * bandRate(iso, ISO_HR_BANDS)
    : scoreRate
  // FORM WAS ONE-SIDED, AND THE COMMENT ABOVE SAYS SO (2026-08-11, Donovan:
  // "the projected output logic needs to be more harsh esp the projected hr").
  //
  // This read `1 + min(0.30, 0.10 * last5_hr)`, which is >= 1.0 ALWAYS. A cold
  // hitter got no discount while a hot one got up to +30% — so every projection
  // could only be revised upward, and the slate total was biased high by
  // construction. It bit hardest because MOST hitters sit at last5_hr = 0: a
  // hitter homers ~13% of games, so five games leaves the majority on zero, all
  // of them multiplied by exactly 1.0.
  //
  // The audit quoted 20 lines up already measured the missing half —
  // "last5_hr 0 -> 9.0% HR rate, 3+ -> 23.0%" — against an ISO-band base near
  // 15.5%. That is 0.58x cold and 1.48x hot. The old cap of +0.30 against a
  // measured +0.48 is a 62.5% shrink toward 1.0, applied to the top end only.
  //
  // So: same measured line, same 62.5% shrink, no longer clipped at 1.0.
  //   measured(l5) = 0.58 + 0.30*l5     (linear through both measured points)
  //   shrunk(l5)   = 1 + 0.625*(measured - 1) = 0.7375 + 0.1875*l5
  // At l5 = 3 that lands on 1.30 — EXACTLY the cap already shipping, so the hot
  // end is unchanged and only the cold end is new. Nothing was hand-tuned.
  // NORMALISED, so this redistributes without moving the level (2026-08-11,
  // second pass. Donovan: "fix the bug").
  //
  // CALIB's band rates were measured across ALL graded hitters, cold ones
  // included, so the base ALREADY prices the average slump. That makes the
  // mean of this multiplier the thing that has to be 1.0 — anything else
  // silently rescales the whole column. Measured on a real 178-hitter slate:
  // the old one-sided version averaged 1.051 (every projection inflated ~5%,
  // which is the bug Donovan felt), and the raw two-sided line averaged 0.832
  // (deflated ~17%, an improvement in direction but a thumb on the scale in
  // magnitude, and not one the archive asked for).
  //
  // Dividing by the slate's own mean gives a term that averages EXACTLY 1.0:
  // hot hitters gain, cold hitters lose, the total stays calibrated, and the
  // only change to the level is the removal of the proven inflation. 61% of a
  // typical slate sits at last5_hr = 0, which is why this one term moved the
  // whole board.
  const form = formOf(p) / (formNorm || 1)
  const prod = prodOf(p) / (prodNorm || 1)
  const park = parkOf(p) / (parkNorm || 1)
  const arm = armOf(p) / (armNorm || 1)
  const xpa = xpaFor(p?.lineup_spot)
  const paMult = (xpa ? xpa / 4.2 : 1) * (p?.lineup_confirmed === false ? 0.9 : 1)
  return base * form * prod * park * arm * paMult
}

/**
 * The slate's projected home runs, to one decimal — v3, park and arm included.
 *
 * 2026-08-15, Donovan: "the header projected should show to the decimal, not
 * a range." The header and the home tile were both reading a RANGE parsed out
 * of the bot's today.txt ("projected HRs 36–45"), which is a different number
 * from the one this table computes and prints at the top of the page. Two
 * numbers for one claim on one screen, and neither said which was which.
 *
 * This is the table's own sum, exported so every surface quotes the SAME
 * model — the one that now knows the building and the arm.
 */
export function slateProjHr(players) {
  const ps = (players || []).filter(Boolean)
  if (!ps.length) return null
  const mean = (f) => {
    const xs = ps.map(f).filter((x) => Number.isFinite(x) && x > 0)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1
  }
  const fN = mean(formOf), pN = mean(prodOf), kN = mean(parkOf), aN = mean(armOf)
  const total = ps.reduce((sum, p) => sum + hrProbV2(p, fN, pN, kN, aN), 0)
  return Number.isFinite(total) ? total : null
}

// scoreOf() / contactScore() lived here to pick which score fed which column.
// Gone with the probability tables: HR reads hrScore directly, and the three
// count columns each band on their OWN market's score inside lib/projection.js
// — which is the coherence rule this file used to break by driving both bases
// AND xbh off contact_score.

// Band lookup: highest band whose floor the score clears.
function bandRate(score, bands) {
  const floors = Object.keys(bands).map(Number).sort((a, b) => a - b)
  let rate = bands[floors[0]]
  floors.forEach((f) => { if (score >= f) rate = bands[f] })
  return rate / 100
}

// 🎛 THE FILTERS (2026-08-15, Donovan: "we talked about how we'd like to
// click filters to see the projected bases and such").
//
// A projection over the whole lineup answers "what does this game produce".
// These answer the question a bettor actually has — what does the TOP of the
// order produce, what do the confirmed bats produce, what happens in the
// launch pads — and every column recomputes live, because the model is a
// per-hitter sum and a sum can be taken over any subset.
//
// The normalisers recompute over the same pool, which is the part that has to
// be right: form and park are divided by the POOL's mean, so a filtered view
// stays internally calibrated instead of quietly inheriting the whole slate's
// average and drifting.
const LENSES = [
  { key: 'set', label: '✓ Lineups in', hit: (p) => p?.lineup_confirmed === true,
    tip: 'Only hitters in a confirmed lineup — a projection over an unconfirmed one is a guess about who plays.' },
  { key: 'top5', label: 'Top 5 spots', hit: (p) => n(p?.lineup_spot, 99) <= 5,
    tip: 'Only the top five lineup spots — the bats that get the extra trip.' },
  { key: 'pad', label: '🌋 Launch pads', hit: (p) => n(p?.park_hr_factor, 1) >= 1.05,
    tip: "Only hitters in a park that adds home runs (factor 1.05 and up), before weather." },
  { key: 'leak', label: '🩹 Leaky arms', hit: (p) => n(p?.pitcher_hr9, 0) >= 1.3,
    tip: 'Only hitters facing a starter giving up 1.30 HR/9 or worse.' },
  { key: 'hot', label: '🔥 Hot bats', hit: (p) => n(p?.last5_hr, 0) >= 1,
    tip: 'Only hitters with a home run in their last five games.' },
  // 2026-08-30, Donovan: "projected output needs more/better filters."
  // Three more, same shape as the five above -- a boolean over the same
  // per-hitter fields the model already reads, nothing new fetched.
  { key: 'cold', label: '🧊 Due (cold)', hit: (p) => n(p?.last5_hr, 0) === 0 && n(p?.games_since_last_hr, 0) >= 5,
    tip: "The mirror of Hot bats -- no homer in the last five games and it's been 5+ games since the last one. A drought, not a projection." },
  { key: 'weather', label: '🌬 Weather boost', hit: (p) => {
      const wpct = n(p?.weather_hr_effect_pct, NaN)
      if (p?.weather_has_data && Number.isFinite(wpct)) return wpct >= 3
      return /out/i.test(clean(p?.wind_direction_label ?? p?.weather_wind_direction_label, ''))
    },
    tip: 'Only games where the published weather read is adding homers -- wind blowing out or a +3% or better effect.' },
  { key: 'watch', label: '⭐ My watchlist', hit: () => false,
    tip: 'Only hitters on your watchlist.' },
]

export default function ProjectedOutput({ games = [], players: allPlayers = [], watchIds = null }) {
  const [lenses, setLenses] = useState(() => new Set())
  // 🔀 SORTABLE TABLE (2026-08-30, Donovan: "make it sortable and add
  // filters" -- the filters (LENSES below) already existed; this is the
  // missing half. Click a header to sort by it, click again to flip
  // direction. Defaults to Proj HR descending, same order the table has
  // always shipped in, so nothing changes for someone who never touches it.
  const [sortCol, setSortCol] = useState('Proj HR')
  const [sortDir, setSortDir] = useState('desc')
  const players = useMemo(() => {
    if (!lenses.size) return allPlayers
    const on = LENSES.filter((l) => lenses.has(l.key))
    // 'watch' has no static hit() -- it needs watchIds, which the lens table
    // above (a module-level const) can't close over. Checked separately so
    // adding it doesn't change the shape every other lens follows.
    const wantsWatch = lenses.has('watch')
    return (allPlayers || []).filter((p) =>
      on.every((l) => (l.key === 'watch' ? true : l.hit(p))) &&
      (!wantsWatch || watchIds?.has(playerId(p)))
    )
  }, [allPlayers, lenses, watchIds])
  const [by, setBy] = useState('game')

  // Opposing-pen stats, live from the MLB StatsAPI team `rp` split. Loaded
  // once per slate's teams; null until it arrives (the Adj column shows
  // when it does).
  const [pens, setPens] = useState(null)
  useEffect(() => {
    const teams = players.map((p) => oppOf(p)).filter(Boolean)
    if (!teams.length) return
    let alive = true
    penStatsFor(teams).then((m) => { if (alive) setPens(m) })
    return () => { alive = false }
  }, [players])

  // The divisor above. Taken over the WHOLE slate rather than per group, so a
  // team's number does not shift depending on how the table happens to be
  // grouped. Empty slate -> 1, which is a no-op rather than a divide by zero.
  const formNorm = useMemo(() => {
    const fs = (players || []).map(formOf).filter((x) => Number.isFinite(x) && x > 0)
    return fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : 1
  }, [players])

  // Same guarantee for the production term — see prodOf. Divided by the slate
  // mean, so its unmeasured weights can reorder hitters but cannot move the
  // total.
  const prodNorm = useMemo(() => {
    const ps = (players || []).map(prodOf).filter((x) => Number.isFinite(x) && x > 0)
    return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 1
  }, [players])

  // Same guarantee again for the building and the arm — see parkOf/armOf.
  const parkNorm = useMemo(() => {
    const xs = (players || []).map(parkOf).filter((x) => Number.isFinite(x) && x > 0)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1
  }, [players])
  const armNorm = useMemo(() => {
    const xs = (players || []).map(armOf).filter((x) => Number.isFinite(x) && x > 0)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1
  }, [players])

  const rows = useMemo(() => {
    const groups = new Map()

    if (by === 'game') {
      games.forEach((g) => {
        const gp = g.players || []
        if (!gp.length) return
        groups.set(`${g.away || '—'} @ ${g.home || '—'}`, gp)
      })
    } else {
      players.forEach((p) => {
        const t = teamOf(p)
        if (!t) return
        if (!groups.has(t)) groups.set(t, [])
        groups.get(t).push(p)
      })
    }

    return [...groups.entries()].map(([label, pool]) => {
      const values = {}
      // HR stays on its own calibrated model; the three count columns come
      // from lib/projection.js, which enforces TB >= hits >= HR on every sum.
      values['Proj HR'] = pool.reduce((sum, p) => sum + hrProbV2(p, formNorm, prodNorm, parkNorm, armNorm), 0)
      const proj = projectPool(pool)
      COUNT_COLUMNS.forEach(([col, key]) => { values[col] = proj[key] })

      // ADJ HR — the calibrated projection with the environment and the pen
      // layered on, per team. Each hitter's band rate is multiplied by:
      //
      //   park    park_hr_factor, as published
      //   air     ~1% per 10°F off 70, capped ±6% (physics, kept gentle)
      //   wind    ±5% when the park-relative label says out/in
      //   pen     the OPPOSING pen's HR/9 vs a 1.05 league norm, weighted at
      //           38% — the share of innings pens actually cover. This is the
      //           late-game term: a Coors pen at 1.4 HR/9 raises the whole
      //           lineup's number because the 7th-9th exist, which the
      //           starter-only scores never priced (the Márquez/McCann/
      //           Arenado kind of night).
      //
      // The base Proj HR column stays untouched — it's calibrated, this is
      // calibrated × modeled, and the caption keeps them distinct.
      values['Adj HR'] = pool.reduce((sum, p) => {
        const base = hrProbV2(p, formNorm, prodNorm, parkNorm, armNorm)
        const park = n(p?.park_hr_factor, n(p?.park_dist_factor, 1)) || 1

        // WEATHER — the bot's OWN published number, not a re-derivation
        // (2026-08-11, Donovan: "weather and park factors all that").
        //
        // This used to hand-roll it here: ~1% per 10 degrees off 70, plus ±5%
        // on a wind LABEL matched by regex. That is precisely the hand-tuning
        // this file warns against twice in capitals, and it threw away better
        // data — the slate already publishes weather_hr_effect_pct (verified
        // present and non-null on 178/178 rows tonight, range -2% to +8%),
        // computed upstream from temperature, wind vector relative to the
        // park's own orientation, humidity and air density together. A regex
        // on "out to left" cannot see any of that.
        //
        // weather_has_data gates it, and the old hand-rolled pair stays as the
        // fallback for a row the weather service never answered for.
        const wpct = n(p?.weather_hr_effect_pct, NaN)
        let weather
        if (p?.weather_has_data && Number.isFinite(wpct)) {
          weather = 1 + wpct / 100
        } else {
          const temp = n(p?.weather_temp_f, n(p?.temp_f, 70)) || 70
          const air = Math.max(0.94, Math.min(1.06, 1 + (temp - 70) / 1000))
          const wl = clean(p?.wind_direction_label ?? p?.weather_wind_direction_label, '')
          weather = air * (/out/i.test(wl) ? 1.05 : /^in\b|in from/i.test(wl) ? 0.95 : 1)
        }

        // PITCHER TREND — direction is published, magnitude is not.
        //
        // pitcher_trend_direction is on every row ('stable' on 169 of 178
        // tonight, 'improving' on 9). An arm that is IMPROVING is worse to
        // face, so it lowers the number; declining raises it. The DIRECTION is
        // the bot's, but nothing has measured what it is WORTH, so this is a
        // deliberately small ±4% nudge rather than a fitted weight — and it is
        // the first thing to calibrate once the hr_events backfill makes
        // "what did picks actually do against improving arms" answerable.
        const trend = String(p?.pitcher_trend_direction || '').toLowerCase()
        const trendMult = trend === 'improving' ? 0.96 : trend === 'declining' ? 1.04 : 1

        const pen = pens?.get(String(oppOf(p) || '').toUpperCase())
        const penMult = pen?.hr9 ? (0.62 + 0.38 * (pen.hr9 / 1.05)) : 1
        return sum + base * park * weather * trendMult * penMult
      }, 0)

      return { label, values, _count: pool.length }
    })
      .sort((a, b) => {
        const av = sortCol === 'label' ? a.label : a.values[sortCol]
        const bv = sortCol === 'label' ? b.label : b.values[sortCol]
        const cmp = sortCol === 'label' ? String(av).localeCompare(String(bv)) : (bv - av)
        return sortDir === 'asc' ? -cmp : cmp
      })
      // RANK IN THE LABEL (2026-08-08, "turn that up some more"): the table
      // is sorted by whatever column is active but nothing SAID so — a rank
      // number makes the ordering legible and gives the rows something to be
      // quoted by. Ranking now follows the live sort (2026-08-30), not
      // always Proj HR, so "#1" means #1 by whatever you clicked.
      .map((r, i) => ({ ...r, label: `${i + 1}.  ${r.label}` }))
  }, [games, players, by, pens, formNorm, prodNorm, parkNorm, armNorm, sortCol, sortDir])

  if (!rows.length) return null

  const total = rows.reduce((a, r) => a + r.values['Proj HR'], 0)
  // The podium: tonight's three loudest slates by projected homers, worn as
  // tiles above the grid so the answer to "where's the power tonight" doesn't
  // require reading a heatmap at all.
  const podium = rows.slice(0, 3)

  return (
    <div style={{
      marginBottom: 20, background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 13, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>📈 Projected output</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>expected COUNT, not a score — a claim that can be wrong</span>
      {/* click-to-filter — every number below recomputes over what's left */}
      <div className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {LENSES.map((l) => {
          const on = lenses.has(l.key)
          return (
            <button key={l.key} title={l.tip}
              onClick={() => setLenses((prev) => {
                const nx = new Set(prev)
                if (nx.has(l.key)) nx.delete(l.key); else nx.add(l.key)
                return nx
              })}
              style={{
                padding: '4px 11px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                borderRadius: 999, whiteSpace: 'nowrap',
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.14)' : 'transparent',
                color: on ? C.orange : C.text3,
              }}>{l.label}</button>
          )
        })}
        {lenses.size > 0 && (
          <>
            <button onClick={() => setLenses(new Set())} style={{
              background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
              fontSize: 9.5, textDecoration: 'underline', textDecorationStyle: 'dotted',
            }}>clear</button>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              projecting {players.length} of {allPlayers.length} hitters
            </span>
          </>
        )}
      </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {['game', 'team'].map((k) => (
            <button
              key={k}
              onClick={() => setBy(k)}
              style={{
                padding: '3px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${by === k ? C.orange : C.border}`,
                background: by === k ? 'rgba(249,115,22,.12)' : 'transparent',
                color: by === k ? C.orange : C.text3,
              }}
            >By {k}</button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.5, margin: '0 0 8px' }}>
        <b style={{ color: C.text2 }}>model v2</b> — each hitter&apos;s HR probability blends his
        score-band rate 50/50 with his measured season-ISO band rate (8.2% under .130 → 22.2% at
        .230+, from the graded archive), weighted by expected PA from his lineup slot (÷4.2 avg,
        ×0.9 if the lineup is unconfirmed), with a +10% form bump per last-5 HR capped at +30%
        (measured: 0 recent HR → 9.0%, 3+ → 23.0%).
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 10 }}>
        {podium.map((r, i) => (
          <div key={r.label} title={`${r._count} tracked hitters · ${r.values['Proj hits'].toFixed(1)} hits · ${r.values['Proj TB'].toFixed(1)} total bases · ${r.values['Proj HRR'].toFixed(1)} H+R+RBI`}
            style={{
              flex: '1 1 150px', minWidth: 0,
              background: i === 0 ? 'rgba(249,115,22,.10)' : 'rgba(255,255,255,.025)',
              border: `1px solid ${i === 0 ? `${C.orange}55` : C.border}`,
              borderRadius: 10, padding: '6px 11px',
            }}>
            <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              #{i + 1} by proj HR
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.label.replace(/^\d+\.\s+/, '')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: i === 0 ? C.orange : C.text2, fontFamily: NUM_FONT }}>
              {r.values['Proj HR'].toFixed(1)} HR
              {Number.isFinite(r.values['Adj HR']) && (
                <span style={{ fontSize: 9.5, color: C.text3, fontWeight: 700 }}> · adj {r.values['Adj HR'].toFixed(1)}</span>
              )}
            </div>
          </div>
        ))}
        <div style={{
          flex: '0 1 auto', alignSelf: 'center', fontSize: 9.5, color: C.text3, padding: '0 6px',
        }}>
          slate projects <b style={{ color: C.text2 }}>{total.toFixed(1)} HR</b><br />
          across {rows.length} {by === 'game' ? 'games' : 'teams'}
        </div>
      </div>

      {/* ── THE BAR CHART (2026-08-18) ────────────────────────────────────
          Donovan: "if you can make the projected output chart any better do
          it." Everything below this point has been a heat TABLE since it was
          ported from Streamlit — a real chart (Heatmap.js literally says so
          in its own header comment), but one you read cell by cell, not one
          you can scan top to bottom in a glance. This adds an actual bar per
          game, sorted the same as the table beneath it, so "where's the
          power tonight" answers itself without reading a single number —
          length alone tells you. Nothing is removed: the table, the podium
          and every column still carry the full precision:  this is a second,
          faster way IN to the same numbers, not a replacement for them.
          The yellow tick is Adj HR — park, weather, pitcher trend and the
          opposing pen layered on — drawn as a tick rather than a second bar
          so it reads as a mark ON the projection, the same paired-dot
          grammar the blank-board chart uses elsewhere on the site, not a
          second series competing for the same axis. */}
      {(() => {
        const maxHr = rows.reduce((m, r) => {
          const v = r.values['Proj HR']
          const a = r.values['Adj HR']
          return Math.max(m, Number.isFinite(v) ? v : 0, Number.isFinite(a) ? a : 0)
        }, 0.0001)
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Proj HR by {by === 'game' ? 'game' : 'team'} — tonight&apos;s power, top to bottom
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {rows.map((r) => {
                const val = r.values['Proj HR']
                const adj = r.values['Adj HR']
                const pct = Math.max(0, Math.min(100, (val / maxHr) * 100))
                const adjPct = Number.isFinite(adj) ? Math.max(0, Math.min(100, (adj / maxHr) * 100)) : null
                return (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 150, flexShrink: 0, fontSize: 10, color: C.text2, fontWeight: 700,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={r.label}>{r.label}</span>
                    <span style={{ flex: 1, position: 'relative', height: 13, background: 'rgba(255,255,255,.04)', borderRadius: 4, overflow: 'visible', minWidth: 0 }}>
                      <span style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 4,
                        background: 'linear-gradient(90deg, rgba(249,115,22,.4), rgba(249,115,22,.9))',
                      }} />
                      {adjPct != null && (
                        <span title={`Adj HR ${adj.toFixed(1)} — park, weather, pitcher trend and the pen layered on`} style={{
                          position: 'absolute', left: `${adjPct}%`, top: -2, bottom: -2, width: 2,
                          background: '#FCD34D', borderRadius: 1,
                        }} />
                      )}
                    </span>
                    <span style={{ width: 84, flexShrink: 0, fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800, color: C.text, textAlign: 'right' }}>
                      {val.toFixed(1)}
                      {adjPct != null && <span style={{ color: '#FCD34D', fontWeight: 700 }}> · {adj.toFixed(1)}</span>}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 9, color: C.text3, marginTop: 5 }}>
              Bar length is Proj HR{pens ? <>; the <span style={{ color: '#FCD34D' }}>tick</span> marks Adj HR once the opposing pens load</> : ''} — same numbers as the table below, ordered top to bottom instead of read cell by cell.
            </div>
          </div>
        )
      })()}

      {/* 🎯 SORTABLE TABLE, GRADED PILLS INSTEAD OF A FULL HEATMAP WASH
          (2026-08-30, Donovan: "b and c [chart mockups]... i also do like
          when it helps with colors showing games to target or high in
          something. i like how the hr score coloring is wit[h] arrows up or
          down" + "make it sortable and add filters"). Heatmap.js shaded
          EVERY cell against its own column range, which is what made this
          read as noisy rather than scannable. Only Proj HR and Adj HR get a
          colored pill now — the same grammar HRW's "88 ▲" badge already uses
          elsewhere on this site — and only when a game sits clearly above or
          below the SLATE'S OWN mean for that column, so color only fires
          when it is actually telling you something. Every header is a sort
          control; the filters above (LENSES) already existed and keep
          working exactly as before — this table just recomputes under them
          like everything else on the page. */}
      {(() => {
        const cols = [...COLUMNS, ...(pens ? ['Adj HR'] : [])]
        const pillCols = new Set(['Proj HR', 'Adj HR'])
        const means = {}
        cols.forEach((c) => {
          const xs = rows.map((r) => r.values[c]).filter((v) => Number.isFinite(v))
          means[c] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
        })
        const gradeOf = (col, v) => {
          if (!pillCols.has(col) || !Number.isFinite(v)) return null
          const mean = means[col] || 1
          const d = (v - mean) / (mean || 1)
          if (d > 0.15) return { cls: 'hot', arrow: '▲' }
          if (d > 0.05) return { cls: 'warm', arrow: '▲' }
          if (d < -0.15) return { cls: 'cold', arrow: '▼' }
          if (d < -0.05) return { cls: 'cool', arrow: '▼' }
          return null
        }
        const pillColor = { hot: C.orange, warm: '#e2985f', cool: '#7fb4f2', cold: '#6c8bb0' }
        const pillBg = { hot: `${C.orange}26`, warm: `${C.orange}14`, cool: '#60a5fa1f', cold: '#60a5fa14' }
        const headerClick = (col) => {
          if (sortCol === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
          else { setSortCol(col); setSortDir('desc') }
        }
        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th
                    onClick={() => headerClick('label')}
                    style={{
                      textAlign: 'left', padding: '5px 8px', borderBottom: `1px solid ${C.border}`,
                      color: sortCol === 'label' ? C.orange : C.text3, fontWeight: 700, fontSize: 9,
                      textTransform: 'uppercase', letterSpacing: '.05em', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >{by === 'game' ? 'Game' : 'Team'}{sortCol === 'label' ? (sortDir === 'desc' ? ' ▾' : ' ▴') : ''}</th>
                  {cols.map((c) => (
                    <th
                      key={c}
                      onClick={() => headerClick(c)}
                      title="Click to sort"
                      style={{
                        textAlign: 'right', padding: '5px 8px', borderBottom: `1px solid ${C.border}`,
                        color: sortCol === c ? C.orange : C.text3, fontWeight: 700, fontSize: 9,
                        textTransform: 'uppercase', letterSpacing: '.05em', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >{c}{sortCol === c ? (sortDir === 'desc' ? ' ▾' : ' ▴') : ''}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.label}</td>
                    {cols.map((c) => {
                      const v = r.values[c]
                      const g = gradeOf(c, v)
                      const text = Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—'
                      return (
                        <td key={c} style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', fontFamily: NUM_FONT }}>
                          {g ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 6,
                              fontWeight: 800, background: pillBg[g.cls], color: pillColor[g.cls],
                            }}>{text} {g.arrow}</span>
                          ) : (
                            <span style={{ fontWeight: 600, color: C.text2 }}>{text}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.5, marginTop: 8 }}>
              THE THREE COUNT COLUMNS ARE REAL EXPECTED COUNTS (2026-08-16) — Hits, TB and HRR are built from
              each hitter&apos;s own season line (average, ISO, walk rate), adjusted by his score band&apos;s
              measured rate and scaled by expected PA from his lineup slot. TB ≥ hits ≥ HR is enforced on every
              row. Proj HR keeps its own calibrated model (score band blended 50/50 with season-ISO band, scaled
              by PA and last-5 form). Adj HR layers park, the published weather effect, pitcher trend and the
              opposing pen&apos;s live HR/9 on top — Proj HR is calibrated, Adj HR is calibrated × modeled, and
              a colored pill on either column means that game sits clearly above (▲) or below (▼) tonight&apos;s
              own average, not a hard threshold. A higher score does not always mean a higher projection: the
              85+ band produced 16.1% where the 70 band produced 18.7%, straight from the graded archive.
            </div>
          </div>
        )
      })()}
    </div>
  )
}
