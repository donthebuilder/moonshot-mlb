import { C } from './theme'

// THE FIELD'S MODEL, PURE (2026-10-01, 0e c / BATCH-FIELD-FUSION-PLAN F1).
//
// Moved out of components/nfl/MatchupMap.js unchanged, so the one football
// picture (components/nfl/TheField.js), the Matchups tab, FootballField and
// the explorer all read the same zones off the same numbers -- and so the
// numbers can be tested without React. The leak math is exactly what the
// Matchup map printed (+66 / -14 / -6 / -42 / +19 / +7 for PIT in week 4,
// scripts/check-field-model.mjs): no number Donovan has seen moves.
//
// One rule is new: SPOT_MIN_MINE. With one target his share of a zone is
// 100%, and the old rule would circle a fluke. No spot unless at least five
// of HIS plays are behind the share.

export const SIDES = ['left', 'middle', 'right']
export const DEPTHS = ['deep', 'mid', 'short', 'behind']

// Plain English, everywhere, for both halves of a zone name.
export const DEPTH_WORD = {
  deep: 'long balls', mid: 'medium passes', short: 'quick passes',
  behind: 'dumpoffs behind the line',
}
export const DEPTH_AX = {
  deep: ['LONG', '20+ yds'], mid: ['MEDIUM', '10–19'],
  short: ['QUICK', '0–9'], behind: ['BEHIND', 'the line'],
}
export const SIDE_WORD = {
  left: 'down the left', middle: 'over the middle', right: 'down the right',
}

export const LANES = ['left|end', 'left|tackle', 'left|guard', 'middle|middle',
  'right|guard', 'right|tackle', 'right|end']
export const LANE_AX = {
  'left|end': 'OUTSIDE L', 'left|tackle': 'L TACKLE', 'left|guard': 'L GUARD',
  'middle|middle': 'MIDDLE', 'right|guard': 'R GUARD', 'right|tackle': 'R TACKLE',
  'right|end': 'OUTSIDE R',
}
// Short enough for seven across a phone.
export const LANE_SHORT = {
  'left|end': 'L END', 'left|tackle': 'L TKL', 'left|guard': 'L GRD', 'middle|middle': 'MID',
  'right|guard': 'R GRD', 'right|tackle': 'R TKL', 'right|end': 'R END',
}
export const LANE_WORD = {
  'left|end': 'runs round the left end', 'left|tackle': 'runs behind the left tackle',
  'left|guard': 'runs behind the left guard', 'middle|middle': 'runs straight up the middle',
  'right|guard': 'runs behind the right guard', 'right|tackle': 'runs behind the right tackle',
  'right|end': 'runs round the right end',
}

// A leak is only a leak against the league. Against its own grid every defense
// on earth has a worst zone and the map says nothing at all.
export const MIN_DEF_ATT = 8
export const SPOT_MIN_DEF_ATT = 12
export const SPOT_MIN_SHARE = 4
export const SPOT_MIN_MINE = 5

// Ink saturates at +40% over league. Past that the picture stops
// distinguishing anything, and +40% is already an enormous hole.
export const HEAT_FULL = 40
export const heatOf = (leak) => (Number.isFinite(leak) && leak > 0 ? Math.min(1, leak / HEAT_FULL) : 0)
export const coolOf = (leak) => (Number.isFinite(leak) && leak < 0 ? Math.min(1, -leak / HEAT_FULL) : 0)

export const TURF = `linear-gradient(180deg, ${C.turf1}, ${C.turf2})`
export const CHALK = 'rgba(255,255,255,.17)'
export const CHALK_SOFT = 'rgba(255,255,255,.09)'

// THE ONE SCALE (2026-09-27, matchups Part A): soft = DASH orange at an
// alpha; holding up = cyan (TUDDY's analysis ink).
export const HEAT = (a) => `color-mix(in srgb, ${C.green} ${Math.round(Math.max(0, Math.min(1, a)) * 100)}%, transparent)`
export const fmtPct = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}%`

/** Plays in one of field.player_pass / player_rush / qb_pass grids. */
export const mapAttempts = (m) => Object.values(m || {}).reduce((n, z) => n + (Number(z?.att) || 0), 0)

export function phrase(z) {
  const [side, d] = z.split('|')
  return d === 'behind'
    ? `dumpoffs behind the line, ${side === 'middle' ? 'in the middle' : `to the ${side}`}`
    : `${DEPTH_WORD[d]} ${SIDE_WORD[side]}`
}

export function fieldModel({ field, defTeam, player = null, mode = 'def', pass = true, qb = false }) {
  if (!field || !defTeam) return null
  const dGrid = (pass ? field.def_pass : field.def_rush)?.[defTeam]
  const lg = (pass ? field.league_pass : field.league_rush) || {}
  const zones = pass ? SIDES.flatMap((s) => DEPTHS.map((d) => `${s}|${d}`)) : LANES
  const metric = pass ? 'ypa' : 'ypc'
  if (!dGrid) return null

  let src = null
  let sizeOf = null
  let mineTotal = null
  // QB MODE: pass reads from qb_pass (his own throws) instead of
  // player_pass (who was thrown to). Rush is untouched -- a scramble is a
  // carry either way, already correctly attributed by rusher_player_id.
  if (mode === 'player') {
    src = (pass ? (qb ? field.qb_pass : field.player_pass) : field.player_rush)?.[player?.player_id]
    if (!src) return null
    const tot = zones.reduce((a, z) => a + (src[z]?.att || 0), 0)
    if (!tot) return null
    mineTotal = tot
    sizeOf = (z) => (100 * (src[z]?.att || 0)) / tot
  } else {
    const tot = zones.reduce((a, z) => a + Math.max(0, dGrid[z]?.yds || 0), 0)
    if (!tot) return null
    sizeOf = (z) => (100 * Math.max(0, dGrid[z]?.yds || 0)) / tot
  }

  const cells = zones.map((z) => {
    const dz = dGrid[z]
    const lz = lg[z]
    const att = dz?.att || 0
    const share = sizeOf(z)
    const leak = (att >= MIN_DEF_ATT && lz?.[metric] > 0)
      ? ((dz[metric] - lz[metric]) / lz[metric]) * 100
      : null
    const mine = mode === 'player' ? src[z] : null
    const where = pass ? phrase(z) : LANE_WORD[z]
    const unit = qb ? 'throws' : (pass ? 'targets' : 'carries')

    // TD LEAK: the same shape as the yards leak, off the same payload.
    const tdN = dz?.td || 0
    const tdRate = att > 0 ? tdN / att : null
    const lgTdRate = lz?.att > 0 ? (lz.td || 0) / lz.att : null
    const tdLeak = (att >= MIN_DEF_ATT && tdRate != null && lgTdRate > 0)
      ? ((tdRate - lgTdRate) / lgTdRate) * 100
      : null
    const tdLine = att >= MIN_DEF_ATT
      ? (tdN
        ? `${tdN} TD${tdN === 1 ? '' : 's'} on ${att} ${unit}${Number.isFinite(tdLeak) && tdLeak > 15 ? ` — ${fmtPct(tdLeak)} vs a normal defense` : ''}`
        : `No touchdowns there yet on ${att} ${unit}`)
      : null

    return {
      z, share, leak, att, dz, lz, mine, tdN, tdLeak, tdLine, where,
      heat: heatOf(leak), cool: coolOf(leak),
      tip: [
        where,
        Number.isFinite(leak)
          ? `${defTeam} give up ${fmtPct(leak)} vs a normal defense here`
          : `${defTeam}: too few plays here to call it`,
        mode === 'player'
          ? `${player?.name}: ${mine?.att || 0} of his ${unit} (${share.toFixed(1)}%)`
          : `${dz?.yds || 0} yards allowed — ${share.toFixed(1)}% of everything they give up`,
        tdLine,
      ].filter(Boolean).join('\n'),
    }
  })

  let spot = null
  // Five of his own plays, or the share is a fluke (SPOT_MIN_MINE).
  if (mode !== 'player' || mineTotal >= SPOT_MIN_MINE) {
    for (const c of cells) {
      if (!Number.isFinite(c.leak) || c.leak <= 0) continue
      if (c.share < SPOT_MIN_SHARE || c.att < SPOT_MIN_DEF_ATT) continue
      const v = c.share * c.leak
      if (!spot || v > spot.v) spot = { ...c, v }
    }
  }
  return { cells, by: Object.fromEntries(cells.map((c) => [c.z, c])), spot, metric, mineTotal }
}

// ONE VIEW DECIDER (plan item 8). tg = his targets (a QB: his throws, from
// qb_pass), ca = his carries, both from the season grids. Carries outside
// the 20 are not in the plays file, so the grid is the only place both
// counts live on one footing. The picture follows where his work is; a
// Passing / Running toggle shows only when BOTH samples are real
// (FALLBACK_MIN_ATT each): a pass-catching back.
export const FALLBACK_MIN_ATT = 20
export function fieldView({ tg = 0, ca = 0 }) {
  if (!(tg > 0) && !(ca > 0)) return { view: null, toggle: false }
  return { view: tg >= ca ? 'pass' : 'rush', toggle: tg >= FALLBACK_MIN_ATT && ca >= FALLBACK_MIN_ATT }
}
