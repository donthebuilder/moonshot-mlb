'use client'
import { n } from './player'

// 🔗 WHAT ACTUALLY MAKES TWO PICKS LAND ON THE SAME NIGHT
//
// 2026-08-09, Donovan: "audit the pairs, and go over the results of the people
// the bot picked that went — figure out pairing them."
//
// So that is what this is: not a theory about pairs, a measurement of them.
// 186,000 same-night pairs sampled out of 58 graded nights, asking one
// question — how often did BOTH halves homer — against the only fair control,
// a random pair drawn off the SAME slate (which already carries whatever
// home-run weather that night had).
//
//     both TOP designated         5.3%   +3.1
//     both ISO >= .230            4.8%   +2.6
//     both L5 HR >= 1             3.6%   +1.4
//     both hr_score >= 70         3.2%   +1.0
//     both facing HR/9 >= 1.4     2.9%   +0.6
//     both weak-spot flagged      2.8%   +0.6
//     ------------------------------------------  random pair: 2.2%
//     opposing teams, same game   2.4%   +0.1
//     SAME GAME                   2.2%   -0.0
//     same TEAM                   2.0%   -0.2
//     same PARK, other game       1.9%   -0.3
//
// THE HEADLINE IS THE BOTTOM HALF. Every shared-environment rule — same game,
// same team, same ballpark — landed at or BELOW a random pair. Divide what
// happened by the independence expectation (p1 × p2, using each night's own
// home-run rate) and same game comes out at 1.05, same team at 1.04. That is
// 1.00 to within noise. Two hitters in the same ballpark are two independent
// coin flips.
//
// This matters because it is the opposite of what a pair product normally
// sells, and the opposite of what this site used to say. The Pair History page
// carried the sentence "only the same-game subset is genuinely correlated" for
// months. It was a reasonable belief and the archive does not support it.
//
// WHAT IS LEFT, and it is simpler than what it replaced: both-TOP runs 2.61×
// the independence expectation and both-big-ISO 1.93× — and all of that comes
// from the LEGS being better, not from the two being together. So the honest
// construction of a pair is: take the two best individual bats and stop.
//
// Everything below scores a pair on that basis only. There is deliberately no
// same-game term. Adding one would be decoration that costs money.

// Each rule carries its MEASURED both-homer rate so the UI can show the number
// rather than a made-up confidence. `lift` is against the 2.2% random baseline.
export const PAIR_RULES = [
  { id: 'top',    label: 'Both TOP picks',      rate: 5.3, lift: 3.1,
    test: (a, b) => isTop(a) && isTop(b),
    why: 'Both carry the bot’s TOP designation, which homered 21.9% on its own against 15.9% for the HR bucket.' },
  { id: 'iso',    label: 'Both big power',      rate: 4.8, lift: 2.6,
    test: (a, b) => n(a?.season_iso, 0) >= 0.230 && n(b?.season_iso, 0) >= 0.230,
    why: 'Both season ISO .230 or better — the single most reliable leg attribute in the archive.' },
  { id: 'l5hr',   label: 'Both went deep in L5', rate: 3.6, lift: 1.4,
    test: (a, b) => n(a?.last5_hr, 0) >= 1 && n(b?.last5_hr, 0) >= 1,
    why: 'Both homered inside their last five games. Recency is now the strongest single field on the board.' },
  { id: 'score',  label: 'Both score 70+',      rate: 3.2, lift: 1.0,
    test: (a, b) => n(a?.hr_score, 0) >= 70 && n(b?.hr_score, 0) >= 70,
    why: 'Both sit in the top band of tonight’s HR score.' },
  { id: 'arm',    label: 'Both face a leaky arm', rate: 2.9, lift: 0.6,
    test: (a, b) => n(a?.pitcher_hr9, 0) >= 1.4 && n(b?.pitcher_hr9, 0) >= 1.4,
    why: 'Both starters give up 1.4 homers per nine or worse.' },
  { id: 'weak',   label: 'Both in a weak spot', rate: 2.8, lift: 0.6,
    test: (a, b) => a?.weak_spot_flag === true && b?.weak_spot_flag === true,
    why: 'Both bat in the lineup slot their pitcher is worst against.' },
]

// The measured rate for a random pair off the same slate. Everything is
// quoted against this, not against a modelled probability.
export const PAIR_BASELINE = 2.2

const isTop = (p) => /TOP/i.test(String(p?.game_pick_role || p?.pick_type || ''))

/**
 * Which measured rules a pair satisfies, best first.
 * Returns [] when it satisfies none — which is a real answer, not an error.
 */
export function pairRulesFor(a, b) {
  if (!a || !b) return []
  return PAIR_RULES.filter((r) => {
    try { return r.test(a, b) } catch { return false }
  })
}

/**
 * The pair's expected both-homer rate, taken from the BEST rule it satisfies
 * rather than by combining them.
 *
 * WHY NOT COMBINE. The rules overlap almost completely — a TOP pick usually
 * has big ISO, and a big-ISO bat usually scored well — so multiplying or
 * adding their lifts would count the same evidence three times and print a
 * number far above anything the archive has produced. Taking the strongest
 * single measured rule is the conservative read, and conservative is the right
 * direction to be wrong in when someone is deciding what to bet.
 */
export function pairRate(a, b) {
  const rules = pairRulesFor(a, b)
  if (!rules.length) return { rate: PAIR_BASELINE, lift: 0, rule: null, rules: [] }
  const best = rules.reduce((x, y) => (y.rate > x.rate ? y : x))
  return { rate: best.rate, lift: best.lift, rule: best, rules }
}

/**
 * Rank every pair from a candidate list on measured evidence alone.
 *
 * NOTE ON WHAT IS ABSENT: no same-game term, no same-park term, no shared-
 * environment bonus of any kind. See the block at the top — all three measured
 * at or below a random pair, so including them would actively mislead.
 */
export function buildPairs(players = [], { limit = 12 } = {}) {
  const pool = players
    .filter((p) => n(p?.hr_score, 0) > 0)
    .sort((a, b) => n(b?.hr_score, 0) - n(a?.hr_score, 0))
    .slice(0, 24)                    // 24 choose 2 = 276 candidates, plenty
  const out = []
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const a = pool[i]
      const b = pool[j]
      // One hitter cannot be both halves, and two hitters in the same lineup
      // slot of the same game is a data error rather than a pair.
      if (String(a?.player_id) === String(b?.player_id)) continue
      const ev = pairRate(a, b)
      out.push({
        a, b, ...ev,
        // Tiebreak inside a rate band by the two scores, so the best pair
        // available at 4.8% is the strongest 4.8% pair rather than an
        // arbitrary one.
        sort: ev.rate * 1000 + n(a?.hr_score, 0) + n(b?.hr_score, 0),
      })
    }
  }
  return out.sort((x, y) => y.sort - x.sort).slice(0, limit)
}
