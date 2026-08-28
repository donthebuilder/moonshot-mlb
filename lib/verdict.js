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

// THE HITTER'S ROLE, DISTINCT FROM THE MARKET (2026-08-27).
//
// `game_pick_role` must stay machine-readable because Results settles it:
// HR/TOP need a homer, HIT needs a hit, HRR needs 2+ H+R+RBI, and CONTACT
// needs 2+ total bases. But those market codes are poor descriptions of the
// actual hitter. This layer gives the bat a recognizable archetype while the
// market remains visible in parentheses: "Moonshooter (HR)" or
// "Production Engine (HRR)". Nothing here changes selection or grading.
const rate = (v) => {
  const x = n(v, 0)
  return x > 1 ? x / 100 : x
}

const marketFamily = (role) => {
  const k = String(role || '').toUpperCase()
  if (k === 'TOP' || k === 'WATCH') return 'HR'
  if (k === 'CONTACT' || k === 'BASES' || k === 'TB') return 'BASES'
  return k || 'NONE'
}

/** Return the descriptive bat type for one settlement market. */
export function hitterArchetype(r, role = primaryRole(r) || 'NONE') {
  const family = marketFamily(role)
  const iso = rate(r?.season_iso)
  const ev = n(r?.recent_ev ?? r?.avg_ev, 0)
  const hard = rate(r?.recent_hard_hit_rate ?? r?.hard_hit_rate)
  const barrel = rate(r?.l20pa_barrel_rate ?? r?.recent_barrel_rate ?? r?.barrel_rate)
  const fly = rate(r?.recent_fb_rate ?? r?.l20pa_fb_rate ?? r?.fb_rate)
  const pull = rate(r?.recent_pull_rate ?? r?.l20pa_pull_rate ?? r?.pull_rate)
  const airPull = rate(r?.air_pull_rate ?? r?.recent_air_pull_rate)
  const kRate = rate(r?.season_k_rate)
  const hr = n(r?.hr_score, 0)
  const hit = n(r?.hit_shape_score ?? r?.hit_score, 0)
  const hrr = n(r?.production_shape_score ?? r?.hrr_score, 0)
  const contact = n(r?.contact_shape_score ?? r?.contact_score, 0)
  const multi = n(r?.multi_hit_score ?? r?.multi_hit_shape_score, 0)
  const damage = n(r?.damage_conversion_score, 0)
  const pitch = n(r?.pitch_type_match_score, 0)
  const mix = n(r?.pitch_mix_score ?? r?.pmix_score, 0)
  const hr9 = n(r?.pitcher_hr9, 0)
  const l5Hits = n(r?.last5_hits, 0)
  const l5Hr = n(r?.last5_hr, 0)
  const l5Xbh = n(r?.last5_xbh, 0)
  const spot = n(r?.lineup_spot, 0)

  if (family === 'HR') {
    if (iso >= .230 && fly >= .35 && (ev >= 92 || barrel >= .10)) {
      return { key: 'moonshooter', label: 'Moonshooter', why: 'High ISO, lifted contact, and home-run-quality impact.' }
    }
    if ((ev >= 92 || hard >= .48) && (barrel >= .08 || damage >= 55)) {
      return { key: 'laser', label: 'Laser', why: 'Elite exit speed or hard-hit rate with damage behind it.' }
    }
    if ((pitch >= 80 || mix >= 80) && hr9 >= 1.20) {
      return { key: 'matchup_hunter', label: 'Matchup Hunter', why: 'His swing matches this arsenal and the opposing arm allows home-run damage.' }
    }
    if (airPull >= .24 || (pull >= .47 && fly >= .32)) {
      return { key: 'pull_side', label: 'Pull-Side Threat', why: 'He combines pull intent with enough lift to attack the short side.' }
    }
    if (l5Hr >= 2 || (l5Hits >= 6 && l5Xbh >= 2)) {
      return { key: 'heater', label: 'Heater', why: 'His locked last-five-game line shows both hits and extra-base damage.' }
    }
    if (iso >= .180 && hr >= 55) {
      return { key: 'value_power', label: 'Value Power', why: 'A playable power baseline without the full Moonshooter shape.' }
    }
    return { key: 'standard_power', label: 'Standard Power', why: 'The balanced power profile when no specialized shape clears its threshold.' }
  }

  if (family === 'HIT') {
    if (hit >= 75 || l5Hits >= 6) return { key: 'hit_machine', label: 'Hit Machine', why: 'Top hit score or six-plus hits in the locked last-five window.' }
    if (contact >= 70 && kRate > 0 && kRate <= .20) return { key: 'bat_to_ball', label: 'Bat-to-Ball Star', why: 'Strong contact score with a low strikeout rate.' }
    if (multi >= 65) return { key: 'multi_hit', label: 'Multi-Hit Threat', why: 'His multi-hit score clears the strong-signal band.' }
    if (hit >= 70) return { key: 'contact_king', label: 'Contact King', why: 'His hit model sits in the strongest established band.' }
    return { key: 'reliable_hitter', label: 'Reliable Hitter', why: 'A steady one-hit profile without a stronger specialist flag.' }
  }

  if (family === 'HRR') {
    if (multi >= 65 && hit >= 70) return { key: 'multi_event', label: 'Multi-Event Engine', why: 'Strong multi-hit and hit scores create several ways to reach the combo.' }
    if (hrr >= 60 && (hit >= 65 || contact >= 65)) return { key: 'production_engine', label: 'Production Engine', why: 'The HRR score is backed by a second strong hit or contact lane.' }
    if (spot >= 3 && spot <= 5 && hrr >= 55) return { key: 'run_driver', label: 'Run Driver', why: 'A middle-order production bat with an actionable HRR score.' }
    if (spot > 0 && spot <= 2 && hit >= 65) return { key: 'table_setter', label: 'Table Setter', why: 'Top-of-order plate appearances and a strong hit profile support run production.' }
    if (iso >= .230 && hr >= 60) return { key: 'power_producer', label: 'Power Producer', why: 'Power supplies multiple events at once when the ball leaves the yard.' }
    return { key: 'contact_producer', label: 'Contact Producer', why: 'A balanced route to H+R+RBI through balls in play and lineup context.' }
  }

  if (family === 'BASES') {
    if ((ev >= 92 || hard >= .48) && damage >= 50) return { key: 'laser', label: 'Laser', why: 'Hard contact plus damage conversion supports extra bases.' }
    if (iso >= .200 || l5Xbh >= 2) return { key: 'extra_base', label: 'Extra-Base Threat', why: 'Season power or recent extra-base hits create a direct two-base path.' }
    if (contact >= 65 && iso >= .150) return { key: 'gap_hitter', label: 'Gap Hitter', why: 'Contact strength and usable ISO support doubles and multi-base outcomes.' }
    return { key: 'bases_builder', label: 'Bases Builder', why: 'The most balanced remaining route to two total bases.' }
  }

  // Undesignated hitters still get a descriptive lane rather than another
  // generic market word, but the parenthetical remains NONE so it cannot be
  // mistaken for an official pick.
  const scores = [
    ['HR', hr], ['HIT', hit], ['HRR', hrr], ['BASES', contact],
  ].sort((a, b) => b[1] - a[1])
  return hitterArchetype(r, scores[0]?.[0] || 'HR')
}

export const hitterRoleLabel = (r, role = primaryRole(r) || 'NONE') => {
  const a = hitterArchetype(r, role)
  const tags = rolesOf(r)
  const market = tags.length ? tags.join('/') : String(role || 'NONE').toUpperCase()
  return `${a.label} (${market})`
}

export const hitterRoleTitle = (r, role = primaryRole(r) || 'NONE') => {
  const a = hitterArchetype(r, role)
  const family = marketFamily(role)
  const settles = family === 'HR' ? '1+ HR'
    : family === 'HIT' ? '1+ hit'
      : family === 'HRR' ? '2+ H+R+RBI'
        : family === 'BASES' ? '2+ total bases' : 'not an official pick'
  return `${a.label}: ${a.why} Graded as ${settles}.`
}

/** Descriptive role for an undesignated hitter's strongest relative lane. */
export const hitterLaneLabel = (r, lane) => lane
  ? `${hitterArchetype(r, lane.key).label} (${lane.key})`
  : '—'

export const hitterLaneTitle = (r, lane, size) => {
  if (!lane) return 'No market scored for this hitter tonight.'
  const a = hitterArchetype(r, lane.key)
  return `${a.label}: ${a.why} ${laneTitle(lane, size)} This is a profile lane, not an official bot pick.`
}

// THE DESIGNATION, FOR A TABLE CELL (2026-08-23).
// Donovan: "i dont see the watch on the role row." The dense tables' Role
// column shows `shortRole()` — the MODEL's tier (Power / Contact / HR Bet),
// out of final_hr_role. That is a different fact from the bot's DESIGNATION
// (game_pick_role), and the designation is the actionable one: it is what
// Results grades, what the Props page groups by, and the only place WATCH
// exists at all. Tonight's slate carries 45 WATCH rows across 15 games and not
// one of them was visible in a table.
//
// Every token, joined — a hitter designated HIT and WATCH is both, and picking
// one to print is how the coverage tier stayed invisible. Falls back to null so
// the caller can keep the model tier for undesignated bats.
export const designationOf = (r) => {
  const toks = rolesOf(r)
  if (!toks.length) return null
  return hitterRoleLabel(r, primaryRole(r) || toks[0])
}

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
//
// THE MISTAKE CHIP (2026-08-23). meatball_fit_score is the bot's new
// mistake-fit column — how much more middle-middle this arm gives to THIS
// bat's side, crossed with what this bat does to a mistake. It sits between
// the trap warning and the bot's own signal pills, and only when it is
// actually a call:
//
//   · fit 65+ AND the side edge is real (a full percentage point or more).
//     Below either bar it is not a finding, and a chip on every card is
//     furniture — the same reason `plain` markets exist a few lines up.
//   · status must be "ok". "no_side_split" means the arm has a rate but not a
//     usable hand split, so there is no edge to chip about, and "missing"
//     means no Statcast data at all.
//   · absent entirely on a slate published before the field shipped, which is
//     every slate on disk right now. Renders nothing.
//
// Power markets only. A 2+ total-bases card does not need to know where the
// pitcher misses; a home-run card is the whole reason the field exists.
const MEATBALL_CHIP_FIT = 65
const MEATBALL_CHIP_EDGE = 1.0
export function meatballChip(r, role) {
  if (role !== 'HR' && role !== 'TOP' && role !== 'WATCH') return null
  if (String(r?.meatball_fit_status || '') !== 'ok') return null
  const fit = n(r?.meatball_fit_score, 0)
  const edge = n(r?.meatball_edge_pp, 0)
  if (fit < MEATBALL_CHIP_FIT || edge < MEATBALL_CHIP_EDGE) return null
  return { t: `🍝 mistake fit ${fit.toFixed(0)}`, warn: false }
}

export function chipsFor(r, role) {
  const out = []
  if (r?.trap_flag && (role === 'HR' || role === 'TOP' || role === 'WATCH')) {
    out.push({ t: '⚠ trap risk', warn: true })
  }
  const mb = meatballChip(r, role)
  if (mb) out.push(mb)
  for (const p of arr(r?.signal_pills)) {
    if (out.length >= 2) break
    const s = String(p || '').trim()
    if (s) out.push({ t: s, warn: false })
  }
  return out.slice(0, 2)
}

// ══ THE LANE ════════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-23: "it seems everyone is contact on the role colume, need
// a more diverse groupe of roles esp for differe pick rtpyes that will help
// wthi pair in some regards. but prescion."
//
// He is reading a real number off a real screen. Counted on tonight's slate:
// final_hr_role has four values and one of them, "🧭 Contact / Monitor", holds
// 74 of 106 hitters. shortRole() renders that as "Contact", so seventy percent
// of the Role column is the same word. designationOf() above fixes the column
// for the ~98 hitters the bot actually designates; everyone else falls through
// to a four-bucket ladder with one bucket in it.
//
// The honest fix is not a fifth bucket. It is to stop asking "which tier is
// he" and start asking the question the column is FOR: what is this bat for
// tonight? Every hitter already carries four scores — hr, hit, hrr, contact —
// and they are on four different scales, so they cannot be compared directly
// (hit_score simply runs hotter than hr_score; the note at the top of this
// file is about exactly that mistake). Compared as PERCENTILES WITHIN TONIGHT'S
// SLATE they can: "he is in the 91st percentile of hit_score and the 30th of
// hr_score" says he is a base-hit bat, in a way that "Contact / Monitor" never
// did.
//
// PRECISION, NOT DECORATION. The lane is always named — every bat is best at
// something — but the label only reads as a CALL when he actually sits in the
// top quarter of that lane tonight. Below that it is deliberately quiet and
// the tooltip says the percentile, because "least bad at H+R+RBI on a slate of
// 106" is not a role and should not look like one.

export const LANES = [
  ['HR', 'hr_score', 'home run'],
  ['HIT', 'hit_score', '1+ hit'],
  ['HRR', 'hrr_score', 'H+R+RBI'],
  ['BASES', 'contact_score', '2+ total bases'],
]

// A bat has to clear this within a lane before the lane is printed as a call.
export const LANE_STRONG = 75

/**
 * laneRanker(players) → (player) → { key, market, pct, score } | null
 *
 * Built ONCE per list, because the percentile only means anything against the
 * slate the list is drawn from. Callers that render a game's nine hitters get
 * percentiles within that game; callers that render the whole board get them
 * within the board. Both are defensible and neither is defensible if the two
 * are mixed, so the ranker is a closure over exactly the rows in view.
 *
 * Zeroes and blanks are excluded from each lane's distribution rather than
 * counted as the floor: a market the bot did not score for a hitter is missing
 * data, and letting it sit at rank 0 would push every real score up a bracket.
 */
export function laneRanker(players = []) {
  const dists = {}
  for (const [key, field] of LANES) {
    dists[key] = (players || [])
      .map((p) => n(p?.[field], null))
      .filter((v) => v != null && v > 0)
      .sort((a, b) => a - b)
  }
  const pctOf = (key, v) => {
    const arr = dists[key]
    if (!arr || !arr.length || v == null) return null
    let lo = 0, hi = arr.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid + 1; else hi = mid }
    return (100 * lo) / arr.length
  }
  return (p) => {
    let best = null
    for (const [key, field, market] of LANES) {
      const v = n(p?.[field], null)
      if (v == null || v <= 0) continue
      const pct = pctOf(key, v)
      if (pct == null) continue
      if (!best || pct > best.pct) best = { key, market, pct, score: v }
    }
    return best
  }
}

/** The cell text. Quiet when the lane is not actually a call. */
export const laneLabel = (lane) => (lane ? (lane.pct >= LANE_STRONG ? lane.key : lane.key.toLowerCase()) : '—')

// "the 93th percentile" — caught in the render. English ordinals are not
// a suffix you can hardcode, and 1st/2nd/3rd are exactly the numbers a
// percentile lands on most often at the bottom of a board.
const ordinal = (nRaw) => {
  const v = Math.round(nRaw)
  const t = v % 100
  if (t >= 11 && t <= 13) return `${v}th`
  return `${v}${['th', 'st', 'nd', 'rd'][v % 10] || 'th'}`
}

export const laneTitle = (lane, size) => {
  if (!lane) return 'No market scored for this hitter tonight.'
  const where = size ? ` of the ${size} in view` : ''
  const head = `Best lane: ${lane.market} — ${lane.score.toFixed(0)}, which is the ${ordinal(lane.pct)} percentile${where}.`
  return lane.pct >= LANE_STRONG
    ? `${head} Top quarter of this lane tonight, so it reads as a call.`
    : `${head} NOT in the top quarter of any lane, so this is what he is least bad at rather than a play. Lower-case on purpose.`
}
