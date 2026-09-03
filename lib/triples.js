// lib/triples.js — the TRIPLES score (shadow, ungraded)
//
// WHAT THIS IS
// Donovan's spec, 2026-09-03: "best people for triples are people already
// hitting them, then park factors, then weather, and pitcher triples and XBH
// given, plus team errors allowed, XBH given, BABIP."
//
// WHAT IT IS NOT — and this is load-bearing.
// The four scores this site already prints (hr_score, hit, prod, tb) are
// computed by the BOT and read off the row. This one is computed HERE, in the
// browser, from fields the slate already publishes. That is deliberate:
//   - no bot pass, no data-branch dependency, it works tonight;
//   - it can be deleted in one commit if it is wrong;
//   - and it never enters `MODEL_WEIGHTS`, so it cannot contaminate hr_score.
//
// It is UNGRADED. `actual_triples` has produced 27 events in 2,297 graded
// player-nights (1.18%). You cannot validate a model on 27 outcomes. Per the
// two-lane rule this repo runs on, this ships as a published COLUMN beside the
// graded outcome and is NOT allowed to badge a card, lead a verdict, or sort a
// board by default until the outcome column has earned it.
//
// ── TESTED 2026-09-03, AND IT DID NOT SEPARATE. READ THIS BEFORE WIRING IT. ──
//
// The morning's plan was: ship this ungraded, and put a real score on DOUBLES,
// where the same construction has 385 graded events instead of 27. That plan
// was tested against 2,297 graded player-nights and it failed.
//
//   doubles composite, top decile   0.76x the base rate   (z = -1.46)
//     first half 0.86x · second half 0.59x — consistently BELOW random
//   best single term (recent_ld_rate) 1.22x               (z = +1.34)
//   a RANDOM score's top decile lands between 0.78x and 1.25x, 95% of the time
//
// So the best term on the board sits inside the noise band, and the composite
// is worse than picking names out of a hat. `hr_score` scores 0.70x against
// doubles, which is not a bug — a ball that leaves the yard is not a double.
//
// The event count was never the problem. The SIGNAL is not in these fields.
//
// Consequence: `components/tabs/GapBoard.js` ships measured rates and prices
// and NO score of any kind, for either market. This module stays in the repo
// as the record of an idea that was tried and did not work — it is wired to
// nothing, and it should not be wired to anything until some feature not in
// this list beats that noise band on out-of-sample nights.
//
// SLATE-RELATIVE, like Game Score. Every term is percentile-ranked WITHIN
// tonight's board, so 78 means "top of tonight", never "78% to triple". The
// implied probability on this market is 1.9-7.8%; nothing here is a probability
// and nothing here should be drawn against a 0-100 absolute ring.

const n = (v, d = null) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}

// A season rate is only as good as the trips it was measured over. At 76 PA one
// extra triple moves 3B/600 by eight, which is larger than the whole spread of
// the term. Under the floor the score is NULL, not small — a blank cell is a
// true statement and a low number is a false one.
export const TRIPLES_MIN_PA = 250

// --- the terms, each mapped to a field that is on the row TODAY ------------

// 1. "people already hitting them" — the batter's own rate, with its denominator.
export const ownRate = (p) => {
  const pa = n(p?.season_pa, 0)
  if (pa < TRIPLES_MIN_PA) return null
  return (n(p?.season_triples, 0) / pa) * 600
}

// 2. Park. There is NO park_3b_factor on the slate — only HR, hits, distance,
// barrel, hardhit and K. But `park_fit.dimensions` carries the real outfield
// distances, and a triple is a ball hit where the fielders are not: the gaps,
// measured against how short the corners are. Sanity check on tonight's 15
// parks, top to bottom by this term: Fenway +94, PNC +60, Kauffman +57, Dodger
// +55 — which is the actual MLB triples leaderboard. The proxy holds.
export const gapDepth = (p) => {
  const d = p?.park_fit?.dimensions
  const lcf = n(d?.lcf), rcf = n(d?.rcf), lf = n(d?.lf), rf = n(d?.rf)
  if ([lcf, rcf, lf, rf].some((x) => x == null)) return null
  return (lcf + rcf) / 2 - (lf + rf) / 2
}
const parkBall = (p) => n(p?.park_hits_factor)

// 3. Weather. NOTE the trap: `weather_hr_effect_pct` is tuned to home runs and
// is dominated by wind blowing OUT, which pushes balls over the fence instead
// of into the gap — for triples it is at best neutral and at worst backwards.
// So this reads the raw environment, not the HR verdict: hot thin air carries a
// gapper to the wall, and a wet field does not.
const airCarry = (p) => {
  const t = n(p?.weather_temp_f)
  if (t == null) return null
  const humid = n(p?.weather_humidity, 50)
  return t + (100 - humid) * 0.06
}

// 4. Pitcher. There is no `pitcher_triples_against` and no `pitcher_bf`, so
// `pitcher_xbh_vs_lhb/rhb` (raw COUNTS, 0-43, no denominator anywhere on the
// row) are deliberately UNUSED — ranking by them would rank innings pitched.
// These three are already rates and say the same thing honestly.
const pitcherGap = (p) => {
  const ld = n(p?.pitcher_ld_rate)
  const iso = n(p?.pitcher_iso_against)
  const gb = n(p?.pitcher_gb_rate)
  if (ld == null && iso == null) return null
  return (ld ?? 0.2) * 2 + (iso ?? 0.15) - (gb ?? 0.42) * 0.5
}

// 5. "team errors allowed" — errors are NOT published, and they are also not
// the right stat: a triple is a ball that lands, not a ball that is dropped.
// What is published is `opp_def_oaa` — Outs Above Average, i.e. range. Bad
// range in the gaps is exactly the defensive failure that turns a double into
// a triple, so this is a substitution UP, not a compromise. Inverted: worse
// defence scores higher.
const defenceHole = (p) => {
  const oaa = n(p?.opp_def_oaa)
  return oaa == null ? null : -oaa
}

// 6. BABIP — his, and the pitcher's.
const babipTerm = (p) => {
  const b = n(p?.season_babip)
  const pb = n(p?.pitcher_babip)
  if (b == null && pb == null) return null
  return (b ?? 0.3) + (pb ?? 0.29) * 0.5
}

// The two separators. Everything above could be describing a double. These are
// what make it a TRIPLE: a ball on a line rather than in the air, hit by a man
// who can run. Sprint speed is still unpublished (same blocker as the SB
// simulator), so attempt rate stands in for legs — and is labelled a proxy
// everywhere it is shown.
const lineDrive = (p) => n(p?.recent_ld_rate) ?? n(p?.l25pa_ld_rate)
const legsProxy = (p) => n(p?.season_sb_attempt_rate)

const TERMS = [
  ['own',      0.30, ownRate],
  ['gap',      0.14, gapDepth],
  ['legs',     0.14, legsProxy],
  ['ld',       0.14, lineDrive],
  ['pitcher',  0.12, pitcherGap],
  ['parkball', 0.05, parkBall],
  ['defence',  0.05, defenceHole],
  ['babip',    0.03, babipTerm],
  ['air',      0.03, airCarry],
]

// These weights are a PRIOR, not a fit. Nothing here was regressed against
// anything, because 27 events cannot support a regression. They encode one
// claim only — that a man's own demonstrated rate outweighs his circumstances,
// and that legs and line drives are what separate this from the double board.
// The moment the outcome column can carry a fit, they get replaced by one.

const pctRank = (vals) => {
  const idx = vals.map((v, i) => [v, i]).filter(([v]) => v != null).sort((a, b) => a[0] - b[0])
  const out = new Array(vals.length).fill(null)
  const d = Math.max(idx.length - 1, 1)
  idx.forEach(([, i], r) => { out[i] = r / d })
  return out
}

/**
 * Score every hitter on the slate at once. Slate-relative by construction, so
 * it cannot be computed for one player in isolation — same contract as Game
 * Score, and the reason this returns a Map rather than taking a single player.
 *
 * @returns Map<playerId, { score, parts, blocked }> — `score` is null when the
 *   PA floor is not met; `blocked` says why, so the UI prints a reason instead
 *   of an em-dash.
 */
export const tripleScores = (players) => {
  const rows = Array.isArray(players) ? players : []
  const ranked = Object.fromEntries(
    TERMS.map(([k, , fn]) => [k, pctRank(rows.map(fn))])
  )
  const out = new Map()
  rows.forEach((p, i) => {
    const pa = n(p?.season_pa, 0)
    if (pa < TRIPLES_MIN_PA) {
      out.set(p?.player_id ?? p?.id, {
        score: null, parts: null,
        blocked: `${pa} PA — needs ${TRIPLES_MIN_PA}`,
      })
      return
    }
    let s = 0, w = 0
    const parts = {}
    for (const [k, wt] of TERMS) {
      const v = ranked[k][i]
      if (v == null) continue
      parts[k] = Math.round(v * 100)
      s += wt * v; w += wt
    }
    // Half the weight missing is not a score, it is a guess wearing one.
    out.set(p?.player_id ?? p?.id, w >= 0.5
      ? { score: Math.round((100 * s / w) * 10) / 10, parts, blocked: null }
      : { score: null, parts, blocked: 'not enough published terms' })
  })
  return out
}

// Sentence for the card. Says which term carried him, never "he will triple".
export const tripleWhy = (p, entry) => {
  if (!entry || entry.score == null) return null
  const top = Object.entries(entry.parts || {}).sort((a, b) => b[1] - a[1])[0]
  const bits = []
  const t = n(p?.season_triples, 0), pa = n(p?.season_pa, 0)
  bits.push(`${t} triple${t === 1 ? '' : 's'} in ${pa} PA`)
  const g = gapDepth(p)
  if (g != null && g >= 55) bits.push(`deep gaps at ${p?.venue_name}`)
  if (n(p?.recent_ld_rate, 0) >= 0.28) bits.push(`${Math.round(n(p?.recent_ld_rate, 0) * 100)}% line drives lately`)
  return bits.join(' · ') + (top ? ` (led by ${top[0]})` : '')
}

export default tripleScores
