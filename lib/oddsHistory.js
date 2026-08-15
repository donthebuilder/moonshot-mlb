'use client'
import { fmtOdds } from './odds'

// 🏷 TRUE PRICE — the site's read of bots/odds_history.json.
//
// Donovan, 2026-08-15: "a page where it track players who go at what price for
// certain props that way we can find the true price of a player to do certian
// things."
//
// The bot keeps every pre-game price it ever fetched and settles it against
// that night's box score. What lands here is, per player per market per line:
// how often he clears it, the price that rate deserves, and the price he has
// actually been offered. This file's whole job is to keep the third number
// from being read as the second one.
//
// THE ONE RULE THIS FILE ENFORCES: A GAP IS NOT AN EDGE UNTIL THE SAMPLE SAYS
// SO. Eleven nights at 64% against a 52% price looks like free money and is
// inside its own error bar — the same trap the NFL pick card walked into,
// where every market's measured edge sat under one standard error. So every
// row carries its z-score and a word for it, and the default sort refuses to
// put an unproven gap on top.

export const MARKET_LABEL = {
  batter_hits: 'Hits',
  batter_total_bases: 'Total bases',
  batter_home_runs: 'Home runs',
  batter_hits_runs_rbis: 'H+R+RBI',
  batter_runs_scored: 'Runs',
  batter_rbis: 'RBIs',
}

export const MARKET_ORDER = [
  'batter_hits', 'batter_total_bases', 'batter_home_runs',
  'batter_hits_runs_rbis', 'batter_runs_scored', 'batter_rbis',
]

/**
 * The error bar on the gap, in percentage points.
 *
 * This is the one-sample proportion test, and the null is THE BOOK'S OWN
 * NUMBER: if the price says 31% and he ran 38% over n nights, the question is
 * whether 38 is far enough from 31 to be more than luck. So the standard error
 * is computed at the price's rate (p0), not at his — which is both the correct
 * test statistic and, usefully, the more conservative one on longshots.
 *
 * At n=10 against a 50% price the bar is ±15.8 points, which is the number
 * that should stop anyone acting on a 12-point "edge" from ten nights.
 */
export function gapSe(avgImplied, n) {
  const p0 = Number(avgImplied) / 100
  const k = Number(n)
  if (!Number.isFinite(p0) || !Number.isFinite(k) || k <= 0 || p0 <= 0 || p0 >= 1) return null
  return 100 * Math.sqrt((p0 * (1 - p0)) / k)
}

export const TRUST = {
  real: { label: 'holds up', tone: '#4ade80', why: 'The gap is at least two standard errors from zero. That is the only tier here worth sizing up on.' },
  leaning: { label: 'leaning', tone: '#FCD34D', why: 'Between one and two standard errors. Real enough to watch, not enough to bet differently on.' },
  noise: { label: 'noise', tone: '#8b8b95', why: 'Inside one standard error of zero. At this sample the gap and no gap are the same claim.' },
  thin: { label: 'too thin', tone: '#8b8b95', why: 'Not enough graded nights at this price to test the gap at all. On a longshot that takes more nights than on a coin flip — a 10% price needs about fifty.' },
}

/**
 * How much the sample actually backs the gap.
 *
 * THE LONGSHOT TRAP, caught in render on 2026-08-15. The first version divided
 * the gap by the error bar and stopped there, and a hitter who scored in 1 of
 * 45 games against a +1320 price came back "holds up, −2.2σ" — a confident
 * verdict built on a single event. The normal approximation this z-score rests
 * on simply doesn't hold there: it needs about five expected hits AND five
 * expected misses before the arithmetic means anything. So that check comes
 * first, and everything failing it is 'thin' no matter how big the gap looks.
 */
export function trustOf(edge, avgImplied, n, minN = 5) {
  const k = Number(n)
  const p0 = Number(avgImplied) / 100
  if (!Number.isFinite(k) || k < minN) return { key: 'thin', z: null }
  if (!Number.isFinite(p0) || k * p0 < 5 || k * (1 - p0) < 5) return { key: 'thin', z: null }
  const se = gapSe(avgImplied, n)
  if (!se) return { key: 'thin', z: null }
  const z = Number(edge) / se
  const a = Math.abs(z)
  return { key: a >= 2 ? 'real' : a >= 1 ? 'leaning' : 'noise', z: Math.round(10 * z) / 10 }
}

/**
 * The tier, said in the direction it points.
 *
 * "holds up, −3.1σ" is a true sentence and a useless one: what holds up is the
 * finding, and the finding is that you have been PAYING for this guy. The
 * statistical tier and the thing to do about it are different facts, so the
 * chip carries both — the tier decides whether it speaks at all, the sign
 * decides what it says.
 */
export function readsAs(trustKey, edge) {
  const t = TRUST[trustKey] || TRUST.thin
  const up = Number(edge) > 0
  if (trustKey === 'real') {
    return up
      ? { label: 'market’s behind', tone: '#4ade80', why: `${t.why} He clears this more often than the prices he gets have been asking for.` }
      : { label: 'you’re overpaying', tone: '#f87171', why: `${t.why} He clears this LESS often than the prices he gets demand — this is a fade, not a find.` }
  }
  if (trustKey === 'leaning') {
    return { label: up ? 'leaning value' : 'leaning short', tone: t.tone, why: t.why }
  }
  return { label: t.label, tone: t.tone, why: t.why }
}

/** One flat row per player × market × line, ready to sort. */
export function flatten(hist, { minN = 5 } = {}) {
  const players = hist?.players
  if (!players || typeof players !== 'object') return []
  const out = []
  Object.entries(players).forEach(([pid, p]) => {
    Object.entries(p?.markets || {}).forEach(([key, b]) => {
      if (!b || !Number.isFinite(Number(b.n))) return
      const t = trustOf(b.edge, b.avg_implied, b.n, minN)
      out.push({
        id: `${pid}|${key}`,
        pid: Number(pid),
        name: p.name || `#${pid}`,
        team: p.team || '',
        market: b.market,
        marketLabel: MARKET_LABEL[b.market] || b.market,
        line: b.line,
        label: b.label,
        n: b.n,
        hits: b.hits,
        rate: b.rate,
        truePrice: b.true_price,
        avgPrice: b.avg_price,
        avgImplied: b.avg_implied,
        edge: b.edge,
        se: Math.round(10 * (gapSe(b.avg_implied, b.n) || 0)) / 10,
        trust: t.key,
        z: t.z,
        log: Array.isArray(b.log) ? b.log : [],
      })
    })
  })
  return out
}

/**
 * A rate of 0% or 100% has NO finite price, and the bot publishes null rather
 * than invent one. Saying so is more useful than an em dash: "8/8, no price
 * long enough" is a real finding about a small sample.
 */
export function priceText(american, rate, n) {
  if (american != null) return fmtOdds(american)
  const r = Number(rate)
  if (r >= 100) return `never missed (${n})`
  if (r <= 0) return `never hit (${n})`
  return '—'
}

/** Is this payload worth reading at all? */
export function historyLooksReal(j) {
  return Boolean(j && typeof j === 'object' && j.players && typeof j.players === 'object')
}
