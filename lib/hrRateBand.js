'use client'
import { wilson } from './interval'
import { hrPerGame } from './odds'

// 📏 THE ERROR BAR ON THE ONE RATE THIS SITE IS ALLOWED TO JUDGE A PRICE WITH.
//
// 2026-08-30, Donovan: "make these pages more precise and better stats
// and chart wise."
//
// The odds board prints EDGE — his per-game homer rate minus the price's
// break-even — as a bare number to one decimal, and every page that consumes
// it treats +7.1 and +3.1 as the same KIND of fact. They are not. A rate built
// on 12 homers in 480 plate appearances and a rate built on 4 in 160 are both
// printed to a tenth, and only one of them has a tenth of resolution behind it.
//
// True Price has had this discipline since 08-15 (every gap there carries its
// own standard error and the tier refuses to speak below it). The live board
// never did. This file is that discipline, applied to the live number.
//
// WHY WILSON, AND WHY ON THE PER-PA COUNTS. lib/interval.js's own header makes
// the case: at these samples the textbook normal interval runs past zero on
// longshots and reports impossible bounds. The count that actually exists is
// HOMERS PER PLATE APPEARANCE — season_hr over season_pa — so the interval is
// taken there and then pushed through the SAME per-game transform hrPerGame()
// uses, rather than being invented at the per-game level where no denominator
// exists.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not model park, weather, the
// pitcher, or tonight's lineup spot uncertainty. It is the sampling error on
// his own season rate and nothing else — a floor on the uncertainty, never the
// whole of it. A band that clears zero means the SAMPLE is not the reason to
// doubt the edge; it never means the edge is real.

/** Plate appearances his lineup spot is worth — hrPerGame()'s own table. */
export function paPerGame(player) {
  const spot = Number(player?.lineup_spot)
  return Number.isFinite(spot) && spot >= 1 && spot <= 9
    ? 4.7 - (spot - 1) * 0.085
    : 4.3
}

// Below this the normal-approximation machinery behind any interval stops
// meaning much — the same five-expected-events rule trustOf() enforces in
// lib/oddsHistory.js, restated in the units this file has.
const MIN_HR = 5
const MIN_PA = 150

/**
 * His per-GAME homer probability with a 95% band, in percent.
 *
 * @returns { rate, lo, hi, half, hr, pa, pg, thin, why } or null when the
 *          slate publishes no rate at all for him.
 *
 * `rate` is hrPerGame()'s number and is UNCHANGED — new slates publish a
 * small-sample-shrunk estimate and that shrink is the ranking baseline the
 * whole site uses. The band comes from the RAW counts, which means a heavily
 * shrunk point estimate can sit off-centre inside its own band. That is a true
 * picture of the situation and better than either pretending the shrink has no
 * uncertainty or quietly replacing the site's baseline with a different one.
 */
export function hrGameBand(player) {
  const rate = hrPerGame(player)
  if (rate == null) return null
  const hr = Number(player?.season_hr)
  const pa = Number(player?.season_pa)
  const pg = paPerGame(player)
  const base = { rate, lo: null, hi: null, half: null, hr: Number.isFinite(hr) ? hr : null, pa: Number.isFinite(pa) ? pa : null, pg }
  if (!Number.isFinite(hr) || !Number.isFinite(pa) || pa <= 0 || hr < 0 || hr > pa) {
    return { ...base, thin: true, why: 'no published season homer count to build an interval on' }
  }
  const ci = wilson(hr, pa)
  if (!ci) return { ...base, thin: true, why: 'no season sample' }
  const toGame = (perPaPct) => 100 * (1 - (1 - perPaPct / 100) ** pg)
  const lo = toGame(ci[0])
  const hi = toGame(ci[1])
  const thin = hr < MIN_HR || pa < MIN_PA
  return {
    ...base,
    lo,
    hi,
    half: (hi - lo) / 2,
    thin,
    why: thin
      ? `${hr} homer${hr === 1 ? '' : 's'} in ${pa} plate appearance${pa === 1 ? '' : 's'} — under ${MIN_HR} homers or ${MIN_PA} trips, the band is wider than anything it could be used to decide`
      : `${hr} homers in ${pa} plate appearances`,
  }
}

/**
 * The edge, with the band carried through.
 *
 * `clears` is the only new claim: the whole 95% band sits on one side of zero,
 * so the SAMPLE is not the reason to doubt the sign. Everything the band does
 * not cover — park, weather, the arm, one book's opinion — still is.
 */
export function edgeBand(need, band) {
  if (band == null || need == null || !Number.isFinite(Number(need))) return null
  const edge = band.rate - Number(need)
  if (band.lo == null) return { edge, lo: null, hi: null, half: null, clears: false, thin: true }
  const lo = band.lo - Number(need)
  const hi = band.hi - Number(need)
  return {
    edge,
    lo,
    hi,
    half: (hi - lo) / 2,
    clears: !band.thin && (lo > 0 || hi < 0),
    thin: band.thin,
  }
}

/** "±4.8 pts (12 HR / 480 PA)", or null. The one-line form for a tooltip. */
export function bandText(band) {
  if (!band || band.half == null) return null
  return `±${band.half.toFixed(1)} pts — ${band.why}`
}
