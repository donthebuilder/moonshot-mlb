// ══ THE VERDICT REGISTRY ════════════════════════════════════════════════════
//
// One place that answers, for a badged hitter: which score is HIS score, what
// market does it settle, what sentence decides it, and what three period tiles
// back it up. Written for the Props page (2026-08-23) and lifted out of it the
// same day, because Donovan asked for the player and pitcher modals to open the
// same way — "please up grade both pitcher and player modals like this too" —
// and a second copy of this map is exactly how `#4ade80` came to mean eleven
// different things (see the note at the top of scripts/check-scales.mjs).
//
// The house rule this encodes: A PICK ALWAYS WEARS ITS OWN MARKET'S SCORE. An
// HR pick shows hr_score, a 1+hit pick shows hit_score, and neither is ever
// ranked against the other — hit_score simply runs hotter than hr_score, so
// sorting a mixed board on "each card's own score" puts a 1+HIT card at 80
// above the game's best bat at 65 and calls it an ordering. Boards that hold
// more than one market GROUP by market and rank inside the group.

import { n, txt, arr } from './player'
import { C } from './theme'
import { catColor } from './scales'

export const ROLE_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT', 'WATCH']
export const GROUP_ORDER = [...ROLE_ORDER, 'NONE']

export const rolesOf = (r) => String(r?.game_pick_role || '')
  .split('/').map((t) => t.trim().toUpperCase()).filter(Boolean)

export const primaryRole = (r) => {
  const toks = rolesOf(r)
  for (const k of ROLE_ORDER) if (toks.includes(k)) return k
  return null
}

// WATCH is coverage, never a pick (the standing decision), and NONE is a
// hitter the bot did not designate at all — neither wears a market hue, so the
// badges keep owning the colour.
export const roleColor = (role) => ((role === 'WATCH' || role === 'NONE') ? C.text3 : catColor('role', role))

export const avg3 = (v) => (n(v, 0)).toFixed(3).replace(/^0/, '')

// The slate publishes doubles, triples and homers but no season XBH total, so
// the first Props build printed an em-dash on every CONTACT card. It is a sum.
export const seasonXBH = (r) => n(r?.season_xbh, 0)
  || (n(r?.season_doubles, 0) + n(r?.season_triples, 0) + n(r?.season_hr, 0))

export const VERDICTS = {
  TOP: {
    score: (r) => n(r?.overall_score, null),
    market: 'best bat',
    // NOT `plain`: simple_reason_1 is the bot's POWER line, and a column of
    // fifteen "Reached NNN feet recently" reads as boilerplate even though
    // the number is real. The best-bat slot is about the whole bat, so it
    // says what the whole bat did.
    why: (r) => `the game's best bat — ${n(r?.season_hr, 0)} HR season, ${n(r?.last10_hits, 0)} hits in his last 10`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)}H·${n(r?.last5_hr, 0)}HR` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)}H·${n(r?.last10_hr, 0)}HR` },
      { k: 'SZN', v: avg3(r?.season_avg) },
    ],
  },
  HR: {
    score: (r) => n(r?.hr_score, null),
    market: 'home run',
    plain: true,
    why: (r) => `${n(r?.last10_hr, 0)} HR in his last 10 · ${n(r?.season_hr, 0)} on the season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hr, 0)} HR` },
      { k: 'L10', v: `${n(r?.last10_hr, 0)} HR` },
      { k: 'SZN', v: `${n(r?.season_hr, 0)} HR` },
    ],
  },
  HIT: {
    score: (r) => n(r?.hit_score, null),
    market: '1+ hit',
    why: (r) => `${n(r?.last10_hits, 0)} hits in his last 10 · ${avg3(r?.season_avg)} season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)} H` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)} H` },
      { k: 'SZN', v: avg3(r?.season_avg) },
    ],
  },
  HRR: {
    score: (r) => n(r?.hrr_score, null),
    market: 'hits+runs+RBI',
    why: (r) => `${n(r?.last5_hits, 0) + n(r?.last5_runs, 0) + n(r?.last5_rbi, 0)} H+R+RBI over his last 5`,
    tiles: (r) => [
      { k: 'L5 H', v: `${n(r?.last5_hits, 0)}` },
      { k: 'L5 R', v: `${n(r?.last5_runs, 0)}` },
      { k: 'L5 RBI', v: `${n(r?.last5_rbi, 0)}` },
    ],
  },
  CONTACT: {
    score: (r) => n(r?.contact_score, null),
    market: '2+ total bases',
    why: (r) => `${n(r?.last10_xbh, 0)} XBH in his last 10 · ${seasonXBH(r)} on the season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_xbh, 0)} XBH` },
      { k: 'L10', v: `${n(r?.last10_xbh, 0)} XBH` },
      { k: 'SZN ISO', v: avg3(r?.season_iso) },
    ],
  },
  WATCH: {
    score: (r) => n(r?.hr_score, null),
    market: 'coverage watch',
    plain: true,
    why: (r) => `next power bat in this game — ${n(r?.season_hr, 0)} HR season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hr, 0)} HR` },
      { k: 'L10', v: `${n(r?.last10_hr, 0)} HR` },
      { k: 'SZN', v: `${n(r?.season_hr, 0)} HR` },
    ],
  },
  // A hitter the bot did not designate. He gets the overall score and says so,
  // rather than borrowing a market's badge he was never given.
  NONE: {
    score: (r) => n(r?.overall_score, null),
    market: 'no badge',
    why: (r) => `${n(r?.season_hr, 0)} HR season · ${n(r?.last10_hits, 0)} hits in his last 10`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)}H·${n(r?.last5_hr, 0)}HR` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)}H·${n(r?.last10_hr, 0)}HR` },
      { k: 'SZN', v: avg3(r?.season_avg) },
    ],
  },
}

export const verdictFor = (role) => VERDICTS[role] || VERDICTS.NONE

// The sentence. `plain` markets (the power slots) prefer the bot's own
// beginner line — it is personal to the hitter and states its evidence. The
// rest get the generated stat line, because their reason fields are boilerplate:
// `hit_reason` is "Low K + split BA + recent hits" on EVERY hitter in the file,
// and so are hrr_reason and contact_reason. A sentence that is the same for
// everybody decides nothing.
export function sentenceFor(r, role) {
  const v = verdictFor(role)
  if (v.plain) {
    const s = txt(r?.simple_reason_1).trim()
    if (s) return s
  }
  return v.why(r)
}

// At most two chips, and a live trap warning outranks a signal every time —
// it is the one place a card contradicts its own badge, so it says so.
export function chipsFor(r, role) {
  const out = []
  if (r?.trap_flag && (role === 'HR' || role === 'TOP' || role === 'WATCH')) {
    out.push({ t: '⚠ trap risk', warn: true })
  }
  for (const p of arr(r?.signal_pills)) {
    if (out.length >= 2) break
    const s = String(p || '').trim()
    if (s) out.push({ t: s, warn: false })
  }
  return out.slice(0, 2)
}
