'use client'
import { useEffect, useState } from 'react'
import { n, mlbId, nameOf, clean } from './player'
import { isAligned } from './scoring'
import { oddsLooksReal } from './odds'
import { oddsPaths } from './dataSource'
import { fetchJSON } from './data'

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

// ═══════════════════════════════════════════════════════════════════════════
// 🧱 BUILDING A TICKET OUT OF TWO OR MORE PICK GROUPS
// ═══════════════════════════════════════════════════════════════════════════
//
// 2026-08-16, Donovan: "Pairing logic for pairs and pools using 2 of the
// groups or more pick based on the high rate signals like the back to back."
//
// Everything above this line builds a pair out of HOME RUNS — two bats, one
// market, both going deep. That is the bot's own construction and it stays.
// What it cannot do is the thing he just asked for, which is to take the bot's
// FIVE PER-GAME DESIGNATIONS and cross them: the HIT pick from one game with
// the HRR pick from another, filtered down to the hitters carrying a signal
// that has actually held up.
//
// THE GROUPS ARE THE UNIT, AND THE SLATE IS BUILT THAT WAY. Verified against
// a real slate (2026-08-15, 266 rows, 15 games): `game_pick_role` designates
// EXACTLY ONE hitter per group per game, all five groups in every game, and a
// single hitter routinely holds two or three of them ("TOP/HR/CONTACT" is one
// string on one man). So a combination of groups is a well-defined object —
// pick HIT + HRR and you have fifteen of each to choose between, one per game.
//
// WHY THE MARKET MATTERS MORE THAN THE MAN. Backtested over 62 graded nights
// and 811 games out of this project's own archive, each group graded on ITS
// OWN bar (the bars restated from pickCleared() in lib/liveSlate.js):
//
//     HIT       1+ hit                  968 of 1391   69.6%
//     HRR       2+ of hits, runs, RBI   709 of 1392   50.9%
//     CONTACT   2+ total bases          316 of  791   39.9%
//     TOP       1+ home run             172 of  807   21.3%
//     HR        1+ home run             128 of  803   15.9%
//
//     and the same TOP picks judged on the EASIER 1+ hit bar: 571 of 807, 70.8%
//
// That spread is four times bigger than anything a signal moves. A pair of HR
// legs is two ~16% events no matter whose names are on it, and that fact has
// to be visible while he builds rather than discovered on the graded page the
// next morning. Every leg therefore prints its own bar and its own measured
// rate, always as k/n — a percentage without its denominator is a claim, and
// this project prints receipts.
export const GROUP_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']

export const GROUP_BACKTEST = { nights: 62, games: 811 }

// k/n as measured, pct derived from them — never typed in by hand, so the
// printed percentage can never drift from the fraction it came out of.
const rate = (k, den) => ({ k, n: den, pct: (100 * k) / den })

export const GROUP_RATE = {
  TOP: rate(172, 807),
  HR: rate(128, 803),
  HIT: rate(968, 1391),
  HRR: rate(709, 1392),
  CONTACT: rate(316, 791),
}

/** The same TOP picks graded on 1+ hit instead of 1+ HR. Same 807 slots. */
export const TOP_ON_HIT_BAR = rate(571, 807)

// The bar, the words for it, the field that ranks inside the group, and a
// theme TOKEN rather than a hex — same rule as lib/roleBadge.js, the palette
// owns the colours. `harder` orders the bars from hardest to easiest and is
// used to resolve a hitter who holds two groups at once (see collapseSameMan).
export const GROUP_META = {
  TOP: { bar: '1+ home run', tone: 'yellow', score: 'hr_score', blurb: 'the bot’s headline bat in the game' },
  HR: { bar: '1+ home run', tone: 'orange', score: 'hr_score', blurb: 'the game’s designated home-run swing' },
  HIT: { bar: '1+ hit', tone: 'purple', score: 'hit_score', blurb: 'the game’s designated base hit' },
  HRR: { bar: '2+ of hits, runs and RBI', tone: 'cyan', score: 'hrr_score', blurb: 'the game’s designated production leg' },
  CONTACT: { bar: '2+ total bases', tone: 'green', score: 'contact_score', blurb: 'the game’s designated bases leg' },
}

/** "968 of 1391 (69.6%)" — the only shape a rate is ever printed in here. */
export function rateText(r) {
  if (!r) return ''
  return `${r.k} of ${r.n} (${r.pct.toFixed(1)}%)`
}

/**
 * Every group a hitter is designated in tonight.
 *
 * `game_pick_role` is a SLASH-JOINED STRING, not a single tag — "TOP/HR/CONTACT"
 * is one man holding three designations in one game. Twenty-odd surfaces on
 * this site read `.split('/')[0]` and take only the first, which is right when
 * you want his headline role and wrong here, where the whole point is which
 * groups he can fill.
 */
export function groupsOf(p) {
  const raw = String(p?.game_pick_role || p?.pick_type || '')
  const out = []
  raw.split('/').forEach((s) => {
    const g = s.trim().toUpperCase()
    if (GROUP_ORDER.includes(g) && !out.includes(g)) out.push(g)
  })
  return out
}

const gameOf = (p) => {
  const v = p?.game_pk ?? p?.gamePk ?? p?.game_id ?? p?.gameId
  return v === undefined || v === null ? '' : String(v)
}
const legId = (p) => `${mlbId(p) ?? nameOf(p)}`

// ── THE HIGH-RATE SIGNALS ───────────────────────────────────────────────────
//
// 2026-08-16, Donovan: "pairing thing is like signals like back to back and
// high confidence things that we have been tracking that is showing true — i
// feel like a few of the players or spots should be dedicated to those
// specifically." Asked whether he wanted a reserved leg, a signals-only ticket
// or a ranking: "all three to be honest i want them incorporated because they
// holding true."
//
// So all three are built (see buildGroupTickets' `reserve`, buildSignalTickets,
// and rankLegs below). What is NOT built is a claim that they hold true, which
// is his belief and is only partly measured. Every signal therefore carries a
// `record` that is either a k/n or an explicit null, and null renders as the
// reason there is no number rather than as a blank:
//
//   aligned          45 of 154 (29.2%) — the 2026-08-04 signal audit
//   weak spot        validated in that audit, no denominator recorded alone
//   pitch match      validated in that audit, no denominator recorded alone
//   high confidence  graded live on the Signal Audit page, nothing stored here
//   back-to-back     NEVER GRADED IN THIS ARCHIVE. No rate exists for it.
//
// Five booleans, and not one of them is invented here.
//
// BACK-TO-BACK is the one he named, and it is the one that has been wrong
// three separate times on this site. It is NOT `games_since_last_hr === 0`:
// on a slate rebuilt after the afternoon window that field means "he homered
// TODAY", so the panel credits the very homer he just hit. lib/b2b.js proves
// the setup homer from a graded file or from the league's own boxscores and
// keeps the raw field only as a veto. This module never touches the field —
// it takes a SET OF PLAYER IDS that backToBack() has already verified, and if
// nothing was verified the signal is simply unavailable rather than guessed.
//
// WEAK SPOT and PITCH-TYPE MATCH were both validated against the graded
// archive in the 2026-08-04 signal audit that rebuilt isAligned() (see
// lib/scoring.js): each raised the homer rate on its own, and the two of them
// together WITH season ISO ≥ .180 — which is what "aligned" now means — came
// out at 29.2% against a 12.9% baseline on n = 154. That composite is the
// strongest single thing on the board and it is reused here rather than
// re-derived, so the two definitions cannot drift apart.
//
// HIGH CONFIDENCE is `high_confidence_hr_flag`, the bot's own lock on a bat
// (🔒 in PlayerCard). It is the second signal he named. It is rare — single
// digits on a full slate — and components/SignalAudit.js already grades it
// against every graded night on the branch, live, rather than from a number
// frozen into a file. So it filters and it ranks here, and where the others
// print a record it points at the audit instead of carrying a copy that could
// drift out of date.
//
// NO RATE IS CLAIMED FOR BACK-TO-BACK. This archive has never graded a
// back-to-back split, so it ranks and filters candidates and says nothing
// about frequency. Printing a number for it would be exactly the invention
// these files exist to prevent.
export const LEG_SIGNALS = [
  {
    id: 'b2b',
    label: 'back-to-back',
    needsProof: true,
    say: () => 'he homered in the game that set tonight up',
    test: (p, ctx) => ctx?.b2b instanceof Set && ctx.b2b.has(mlbId(p)),
    record: null,
    note: 'never graded on this archive, so it ranks and filters here and claims no rate at all',
  },
  {
    id: 'hiconf',
    label: 'high confidence',
    say: () => 'the bot has him flagged high-confidence on the home run',
    test: (p) => p?.high_confidence_hr_flag === true,
    record: null,
    note: 'graded live on the Signal Audit page against every graded night, rather than frozen into a number here',
  },
  {
    id: 'weak',
    label: 'weak spot',
    // THE FLAG IS THE SIGNAL; THE REASON IS OPTIONAL COLOUR. On this slate 42
    // rows carry weak_spot_flag and 57 carry a weak_spot_reason, and only 27
    // rows carry both — the two fields genuinely disagree. Keying on the flag
    // keeps this count identical to every other surface that stars a weak spot
    // (lib/scoring.js, the ⭐ in PlayerCard), and the reason is appended only
    // where it exists, so a flagged hitter with no reason string still states
    // the signal instead of trailing off into an empty sentence.
    say: (p) => {
      const why = clean(p?.weak_spot_reason, '')
      const base = 'he bats in the lineup slot this starter is worst against'
      return why ? `${base} — ${why.replace(/\.$/, '')}` : base
    },
    test: (p) => p?.weak_spot_flag === true,
    record: null,
    note: 'validated in the 2026-08-04 signal audit, which recorded no denominator for it on its own',
  },
  {
    id: 'pmatch',
    label: 'pitch-type match',
    say: (p) => {
      const code = String(p?.pitch_type_match_code || '').trim()
      return code
        ? `the ${code} is a pitch he does damage against, and this starter throws it`
        : 'the pitch he does damage against is one this starter throws'
    },
    test: (p) => p?.pitch_type_match_flag === true,
    record: null,
    note: 'validated in the 2026-08-04 signal audit, which recorded no denominator for it on its own',
  },
  {
    id: 'aligned',
    label: 'aligned',
    // 45 of 154, not "29.2%". The 2026-08-04 audit recorded this one as
    // "29.2% (n=154)" and the house rule is that a rate prints with its
    // denominator, so the numerator is inverted back out of the pair — and it
    // is unique at that n (44/154 = 28.6%, 46/154 = 29.9%), so this is
    // recovering the count the audit had, not inventing one. The 12.9%
    // baseline it was measured against carries no n in that note, so it is
    // quoted as the audit's own conclusion rather than as a bare percentage.
    say: (p) => 'he is aligned — the weak lineup slot and the pitch-type match at once, on '
      + `${n(p?.season_iso, 0).toFixed(3).replace(/^0/, '')} season ISO, the composite that homered `
      + '45 of 154 times (29.2%) in the signal audit, better than double the untagged rate',
    test: (p) => isAligned(p),
    record: rate(45, 154),
    // Its own sentence already quotes the k/n, so a renderer that also prints
    // the record after naming the signal would say "45 of 154" twice in one
    // paragraph. The other four have nothing in their sentence to repeat.
    sayCarriesRecord: true,
    note: 'the strongest composite on the board, and the only signal here with a denominator',
    // Aligned is BY DEFINITION weak spot + pitch match + power, so whenever it
    // fires the other two fire with it. They stay in the list — a leg has to
    // still answer the "weak spot" filter — but a renderer that prints all
    // three says the same thing three times, so this names the two it absorbs.
    absorbs: ['weak', 'pmatch'],
  },
]

export const ALL_SIGNAL_IDS = LEG_SIGNALS.map((s) => s.id)

/**
 * What a signal has actually measured, as a sentence fragment.
 *
 * Either "45 of 154 (29.2%)" or the reason there is no number. Never a bare
 * percentage, and never an empty string that a caller could read as "fine".
 */
export function signalRecordText(s) {
  if (!s) return ''
  return s.record
    ? `${rateText(s.record)} in the 2026-08-04 signal audit`
    : (s.note || 'not measured on this archive')
}

/**
 * The signals worth SAYING, and — since 2026-08-16 — the signals worth
 * COUNTING.
 *
 * Aligned already contains weak spot and pitch-type match; printing all three
 * is one fact stated three times in one sentence. Filtering still sees the
 * full list, so switching on "weak spot" keeps every aligned hitter.
 *
 * THE COUNTING PART IS NEW AND IT MATTERS MORE THAN THE PRINTING PART. The
 * builder now ranks legs by how many signals they carry, and an aligned hitter
 * trips weak_spot_flag, pitch_type_match_flag and isAligned() at once — all
 * three off the same two fields. Ranking on the raw list would score him 3
 * where a back-to-back hitter with a lock on him scores 2, which is one man's
 * single matchup fact outvoting two independent ones. So the rank counts what
 * this function returns: DISTINCT FACTS, aligned counting once for the pair it
 * absorbs. The UI says this out loud rather than leaving it as a quirk of the
 * sort.
 */
export function spokenSignals(signals = []) {
  const absorbed = new Set(signals.flatMap((s) => s.absorbs || []))
  return signals.filter((s) => !absorbed.has(s.id))
}

const SIGNAL_BY_ID = Object.fromEntries(LEG_SIGNALS.map((s) => [s.id, s]))

/** Which signals this hitter is carrying tonight, in the order above. */
export function signalsOn(p, ctx) {
  return LEG_SIGNALS.filter((s) => {
    try { return s.test(p, ctx) } catch { return false }
  })
}

/**
 * One leg: a hitter, the group he is filling, the bar he has to clear and the
 * measured rate that bar has cleared at. `score` is the bot's 0-100 score on
 * THAT GROUP'S OWN SCALE — hr_score for a HR leg, hit_score for a HIT leg —
 * and it is a sort key only. It is never printed with a % and never combined
 * with anything.
 */
function makeLeg(p, group, ctx) {
  const signals = signalsOn(p, ctx)
  return {
    key: `${legId(p)}|${group}`,
    player: p,
    group,
    game: gameOf(p),
    bar: GROUP_META[group]?.bar || '',
    rate: GROUP_RATE[group] || null,
    score: n(p?.[GROUP_META[group]?.score], 0),
    // EVERY signal, for filtering: switching "weak spot" on has to keep an
    // aligned hitter, because he is in a weak spot.
    signals,
    // The DISTINCT facts, for ranking, counting and saying: aligned absorbs
    // weak spot and pitch match, so it counts once rather than three times.
    // See spokenSignals().
    distinct: spokenSignals(signals),
    alsoGroups: [],
  }
}

// RANK BY SIGNAL COUNT FIRST, SCORE SECOND — stated explicitly because the
// owner asked for it explicitly (2026-08-16: "all three... because they
// holding true"). This ordering already existed; what changed is WHAT gets
// counted. It was `signals.length`, the raw list, which scores an aligned
// hitter 3 off one pair of fields; it is now `distinct.length`, so an aligned
// hitter scores 1 for aligned and a hitter who is back-to-back AND locked
// scores 2 — two separate facts beating one restated three ways.
//
// The score only breaks ties, and deliberately that way round: the signals are
// tested against outcomes and the 0-100 score is a model output, not a
// probability.
const rankLegs = (a, b) => (b.distinct.length - a.distinct.length) || (b.score - a.score)

/**
 * ONE MAN CANNOT BE TWO LEGS.
 *
 * On a real slate the same hitter holds "TOP/HR/CONTACT" in his game, so a
 * TOP + CONTACT combination inside one game would otherwise print Eduardo
 * Valencia twice and sell one player's night as two events.
 *
 * The bars are nested, and knowing how is what makes the fix exact rather
 * than a heuristic. A home run IS one hit, IS four total bases, and IS three
 * of hits+runs+RBI — so TOP/HR ⊂ CONTACT ⊂ HIT and TOP/HR ⊂ HRR. Where the
 * bars nest, betting both is arithmetically the same as betting the harder
 * one alone, so the harder bar is not a conservative choice, it is the exact
 * intersection. HRR against CONTACT is the one pair that doesn't nest; there
 * the harder bar is still the binding constraint on the one game he gets, and
 * counting him twice would be the lie either way.
 */
const HARDNESS = ['HR', 'TOP', 'CONTACT', 'HRR', 'HIT']
function collapseSameMan(legs) {
  const byMan = new Map()
  legs.forEach((leg) => {
    const id = legId(leg.player)
    const cur = byMan.get(id)
    if (!cur) { byMan.set(id, leg); return }
    const keep = HARDNESS.indexOf(leg.group) < HARDNESS.indexOf(cur.group) ? leg : cur
    const drop = keep === leg ? cur : leg
    keep.alsoGroups = [...new Set([...keep.alsoGroups, ...drop.alsoGroups, drop.group])]
    byMan.set(id, keep)
  })
  return [...byMan.values()]
}

/**
 * The ticket's ceiling, and why it is the only combined number printed.
 *
 * A ticket needs EVERY leg. P(all of them) can never exceed the smallest
 * single P — that inequality holds under any dependence whatsoever, which is
 * exactly why it is safe to show and a product is not. It is an upper bound
 * on a measured frequency, not a forecast, and the UI says so in those words.
 */
function ceilingOf(legs) {
  let worst = null
  legs.forEach((l) => {
    if (l.rate && (!worst || l.rate.pct < worst.rate.pct)) worst = l
  })
  return worst ? { group: worst.group, rate: worst.rate } : null
}

/**
 * THE RESERVED SIGNAL LEG (2026-08-16).
 *
 * Donovan: "i feel like a few of the players or spots should be dedicated to
 * those specifically." So one spot on every ticket belongs to a hitter who is
 * carrying a signal, and the ticket names which signal it is.
 *
 * `anchor` is the leg the builder deliberately held the spot for. This
 * function does not go looking for one where the builder failed to reserve
 * one — if the anchor is missing it checks whether ANY leg happens to carry a
 * signal, and if none does it reports `reserveMissing`. That flag is the whole
 * point of the mechanism: a ticket with no signal-backed leg has to SAY it has
 * no signal-backed leg, because the alternative is a ticket that looks exactly
 * like a reserved one and quietly isn't.
 */
function finishTicket(legs, index, anchor = null) {
  const games = [...new Set(legs.map((l) => l.game).filter(Boolean))]
  const held = (anchor && legs.includes(anchor) && anchor.distinct.length ? anchor : null)
    || legs.find((l) => l.distinct.length)
    || null
  return {
    key: legs.map((l) => l.key).join('+') || `t${index}`,
    legs,
    games,
    // Read off the legs themselves, never off the requested shape — if the
    // builder ever hands back two legs in one game, the ticket says so.
    sameGame: games.length === 1 && legs.length > 1,
    groups: legs.map((l) => l.group),
    // DISTINCT facts, not raw flags — see spokenSignals(). This is the number
    // tickets are sorted by, so it must be the same count the legs display.
    signalCount: legs.reduce((s, l) => s + l.distinct.length, 0),
    reservedKey: held ? held.key : null,
    reservedSignals: held ? held.distinct : [],
    reserveMissing: !held,
    ceiling: ceilingOf(legs),
  }
}

/**
 * Build tickets from two or more pick groups.
 *
 * @param players slate rows
 * @param groups  2+ of TOP / HR / HIT / HRR / CONTACT
 * @param signals signal ids a leg must carry — ANY of them, not all, because
 *                requiring all four leaves an empty page every night
 * @param shape   'spread' = one leg per game (the default)
 *                'game'   = every leg out of the SAME game, on request
 * @param size    how many legs: 2 is a pair, 3-4 is a pool. When size exceeds
 *                the number of groups the groups cycle, so HIT + HRR at size 4
 *                is two HIT legs and two HRR legs out of four different games.
 * @param ctx     { b2b: Set|null } — verified ids from lib/b2b.js backToBack()
 * @param reserve hold one spot on every ticket for a signal-carrying hitter
 *                (default true — see the block above finishTicket). Pass false
 *                and the fill is purely by rank, which is what it used to be.
 *
 * @returns { tickets, counts, collapsed, emptyGroups, signalMen }
 */
export function buildGroupTickets(players = [], {
  groups = [],
  signals = [],
  shape = 'spread',
  size = 2,
  ctx = {},
  limit = 4,
  reserve = true,
} = {}) {
  const picked = GROUP_ORDER.filter((g) => groups.includes(g))
  const blank = { tickets: [], counts: {}, collapsed: 0, emptyGroups: [], signalMen: 0 }
  if (picked.length < 2) return blank

  const wanted = new Set(signals.filter((id) => SIGNAL_BY_ID[id]))
  const carries = (leg) => !wanted.size || leg.signals.some((s) => wanted.has(s.id))

  // One pass over the slate: every designated hitter becomes one leg per
  // group he holds that was actually asked for.
  const pool = new Map(picked.map((g) => [g, []]))
  const seen = new Set()
  players.forEach((p) => {
    if (!p) return
    const rowKey = `${legId(p)}|${gameOf(p)}`
    if (seen.has(rowKey)) return
    seen.add(rowKey)
    groupsOf(p).forEach((g) => {
      if (!pool.has(g)) return
      pool.get(g).push(makeLeg(p, g, ctx))
    })
  })

  // How many DIFFERENT MEN across the chosen groups carry a signal at all,
  // counted BEFORE the user's own signal filter narrows anything. This is what
  // lets the page distinguish "your filter emptied it" from "nobody in HIT or
  // HRR is carrying anything tonight" — the second is the case where a
  // reserved leg is impossible, and the reserved-leg promise is only honest if
  // its absence can be explained.
  const signalMenSet = new Set()
  const counts = {}
  picked.forEach((g) => {
    const all = pool.get(g)
    let withSignal = 0
    all.forEach((l) => {
      if (!l.distinct.length) return
      withSignal += 1
      signalMenSet.add(legId(l.player))
    })
    const kept = all.filter(carries).sort(rankLegs)
    counts[g] = { total: all.length, kept: kept.length, signal: withSignal }
    pool.set(g, kept)
  })
  const signalMen = signalMenSet.size
  const emptyGroups = picked.filter((g) => !pool.get(g).length)

  const tickets = []
  let collapsed = 0

  if (shape === 'game') {
    // Every leg out of one game. This is the shape that carries the
    // correlation problem, so it is never the default and the UI names the
    // game out loud on every ticket it produces.
    const byGame = new Map()
    picked.forEach((g) => pool.get(g).forEach((leg) => {
      if (!leg.game) return
      if (!byGame.has(leg.game)) byGame.set(leg.game, [])
      byGame.get(leg.game).push(leg)
    }))
    const built = []
    byGame.forEach((legs) => {
      const merged = collapseSameMan(legs).sort(rankLegs)
      if (merged.length < 2) {
        // Only a genuine collapse counts: two designations that turned out to
        // be one man. A game that simply had one leg left after filtering is
        // thin, not collapsed, and saying otherwise would misreport why.
        if (legs.length >= 2) collapsed += 1
        return
      }
      // THE RESERVED LEG IN THIS SHAPE COMES FREE, and it is worth saying why
      // rather than leaving it implicit. `merged` is sorted by rankLegs, which
      // puts the most signals first, so merged[0] is the best signal carrier
      // in this game and is inside every slice. If merged[0] carries nothing
      // then nobody in this game does, and finishTicket sets reserveMissing —
      // which is the honest answer, not a failure to look.
      const slice = merged.slice(0, Math.max(2, size))
      built.push(finishTicket(slice, built.length, reserve ? slice[0] : null))
    })
    built.sort((a, b) => (b.signalCount - a.signalCount)
      || (b.legs.reduce((s, l) => s + l.score, 0) - a.legs.reduce((s, l) => s + l.score, 0)))
    return { tickets: built.slice(0, limit), counts, collapsed, emptyGroups, signalMen }
  }

  // 'spread': one leg per GAME, so no two legs of a ticket share a park, an
  // air, a starter or a game state. Successive tickets never reuse a hitter,
  // so ticket 2 is a genuine second ticket rather than ticket 1 with a name
  // swapped.
  const usedMen = new Set()
  const usedGames = new Set()
  for (let t = 0; t < limit; t += 1) {
    // The ticket's SHAPE is fixed before anything is chosen: which group fills
    // which slot. Reserving a spot must not quietly change a HIT + HRR pair
    // into two HRR legs, so the reserved leg takes a slot that was already
    // going to be its own group.
    const seq = Array.from({ length: Math.max(2, size) }, (_, i) => picked[i % picked.length])
    const slots = new Array(seq.length).fill(null)
    const takenGames = new Set(usedGames)
    const takenMen = new Set(usedMen)

    // 1. THE RESERVED SPOT. Best signal-carrying candidate available in any of
    //    the requested groups — each pool is already sorted signals-first, so
    //    the first eligible entry in a group is that group's best carrier, and
    //    rankLegs picks between the groups on the same rule the legs use.
    //    Doing this BEFORE the ordinary fill is the whole mechanism: filling
    //    in slot order first would let an earlier group take the one game the
    //    signal carrier was in and leave the ticket signal-less with a
    //    perfectly good carrier still on the board.
    //
    //    ACROSS GROUPS, ONLY THE SIGNAL COUNT DECIDES. Inside a group the
    //    pools are already sorted by rankLegs, which is signals then score,
    //    and that is sound because every leg in a group is scored on the same
    //    field. Between groups it is not: hr_score and hit_score are different
    //    quantities that happen to share a 0-100 range, and picking between
    //    them numerically would be the same mistake the pair lanes call out
    //    (their scores must never share a ramp). So a tie on signals is broken
    //    by the group order on the buttons — a stated convention instead of a
    //    false comparison.
    let anchor = null
    if (reserve) {
      picked.forEach((g) => {
        if (!seq.includes(g)) return
        const cand = pool.get(g).find((l) => l.distinct.length
          && !takenMen.has(legId(l.player)) && !takenGames.has(l.game))
        if (cand && (!anchor || cand.distinct.length > anchor.distinct.length)) anchor = cand
      })
      if (anchor) {
        const at = seq.indexOf(anchor.group)
        slots[at] = anchor
        takenMen.add(legId(anchor.player))
        if (anchor.game) takenGames.add(anchor.game)
      }
    }

    // 2. The rest fill exactly as they did before — best available in the
    //    slot's own group, never repeating a man and never repeating a game.
    seq.forEach((g, i) => {
      if (slots[i]) return
      const leg = pool.get(g).find((l) => !takenMen.has(legId(l.player)) && !takenGames.has(l.game))
      if (!leg) return
      slots[i] = leg
      takenMen.add(legId(leg.player))
      if (leg.game) takenGames.add(leg.game)
    })

    const legs = slots.filter(Boolean)
    if (legs.length < 2) break
    legs.forEach((l) => { usedMen.add(legId(l.player)); if (l.game) usedGames.add(l.game) })
    tickets.push(finishTicket(legs, t, anchor))
  }

  return { tickets, counts, collapsed, emptyGroups, signalMen }
}

/**
 * THE SIGNALS-ONLY TICKET (2026-08-16).
 *
 * The third of the three things he asked for: not one reserved leg, but a
 * whole ticket where EVERY leg is carrying something.
 *
 * It is deliberately the same machine as buildGroupTickets rather than a
 * second one. Same groups, same shape, same size, same bar-nesting collapse,
 * same one-leg-per-game rule, same ceiling — the ONLY difference is that the
 * signal filter is set to "any of them" instead of to whatever the user
 * switched on. Two builders would eventually disagree about what a group's
 * measured rate is or about how a two-designation hitter collapses, and that
 * disagreement would show up on screen as two contradictory tickets.
 *
 * @param available signal ids that can be honestly required tonight. The
 *                  caller passes b2b ONLY when lib/b2b.js has proven the setup
 *                  homers; an unproven back-to-back must not be allowed to
 *                  qualify a leg for a ticket whose entire premise is that
 *                  every leg carries a verified signal.
 */
export function buildSignalTickets(players = [], {
  groups = [],
  shape = 'spread',
  size = 2,
  ctx = {},
  limit = 1,
  available = ALL_SIGNAL_IDS,
} = {}) {
  return buildGroupTickets(players, {
    groups, shape, size, ctx, limit, reserve: true, signals: available,
  })
}

/**
 * The slate's date, off the rows themselves.
 *
 * lib/data.js has slateDateFromRows() but it takes the RAW PAYLOAD and runs it
 * back through normalizeData; by the time a tab has `players` that work is
 * already done. Same rule as there — the latest first pitch on the card, in
 * local time — so the two cannot disagree about which night this is.
 *
 * It matters because it is what picks the back-to-back proof source: a
 * tomorrow slate is set up by today's games, a today slate by yesterday's.
 */
export function slateDateOf(players = []) {
  let best = 0
  players.forEach((p) => {
    const t = new Date(p?.game_time || 0).getTime()
    if (t > best) best = t
  })
  return best ? new Date(best).toLocaleDateString('en-CA') : ''
}

/**
 * The published odds, whether or not the caller was handed them.
 *
 * Dashboard fetches odds_latest.json once and passes it to the boards that
 * were built after it existed — Pairs and Pools were not among them, and
 * threading a new prop through Dashboard is a change to a file two other
 * agents are editing tonight. So: use the prop when it's real, fetch the same
 * single file when it isn't. `oddsLooksReal` gates both ends, because an empty
 * payload and a missing one should behave identically (no prices, no excuse).
 */
export function useSlateOdds(provided) {
  const [fetched, setFetched] = useState(null)
  const haveProp = oddsLooksReal(provided)
  useEffect(() => {
    if (haveProp) return undefined
    let alive = true
    fetchJSON(oddsPaths())
      .then((j) => { if (alive && oddsLooksReal(j)) setFetched(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [haveProp])
  return haveProp ? provided : fetched
}
