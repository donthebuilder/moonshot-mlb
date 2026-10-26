// 🏀 THE WEAK SPOT, ONE RULE (2026-10-25): a defence whose stat allowed a game is in TONIGHT's top third of the clubs playing.
// PURE. Read by the Slate's Weak spots card (components/buckets/BucketsWeakSpots.js), the slate card's angle (lib/nba/gameAngles.js)
// and the board's optional WEAK SPOT column below (components/buckets/tabs/Board.js), so they cannot drift apart. Information, not a
// forecast: it names a number and says nothing about a chance.
// The stat allowed is the board's own opp leg (lib/nba/legs.js); the market -> leg table is lib/nba/angles.js's, so a market with no
// opp leg (double-double, triple-double) has no column.
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export const WEAK_KEY = 'weak_spot'
export const WEAK_LEG = { pts: 'oppPts', pra: 'oppPts', first: 'oppPts', reb: 'oppReb', ast: 'oppAst', '3pm': 'oppTpm' }
const WEAK_WORD = { oppPts: 'PTS', oppReb: 'REB', oppAst: 'AST', oppTpm: '3PM' }
export const hasWeakSpot = (market) => Boolean(WEAK_LEG[market])

/**
 * The defences in tonight's top third for one stat.
 * @param rows   board rows ({ opp, legs })
 * @param leg    'oppPts' | 'oppReb' | 'oppAst' | 'oppTpm'
 * @returns Map(def abbrev -> stat allowed a game); empty under 3 clubs read
 */
export function weakSpotSet(rows = [], leg = 'oppPts') {
  const allow = new Map()
  for (const r of rows) { const v = num(r.legs?.[leg]); if (v != null && r.opp) allow.set(r.opp, v) }
  const vals = [...allow.values()].sort((a, b) => a - b)
  const out = new Map()
  if (vals.length < 3) return out
  const cut = vals[Math.floor((vals.length - 1) * (2 / 3))]
  for (const [def, v] of allow) if (v >= cut) out.set(def, v)
  return out
}

/** The board column's lookup for a market: Map(def -> allowed), or null when the market has no opp leg. */
export function weakSpotMap(rows = [], market = 'pts') {
  const leg = WEAK_LEG[market]
  return leg ? weakSpotSet(rows, leg) : null
}

/** The cell's words for one row: "119.2 PTS allowed", or nothing when his opponent is not in the top third. */
export function weakSpotCell(r, map, market) {
  const leg = WEAK_LEG[market]
  const v = leg && map ? map.get(r?.opp) : null
  return v == null ? '' : `${v.toFixed(1)} ${WEAK_WORD[leg]} allowed`
}

/** The column; `open(gameId)` is called on a tap. Group "Game", after the legs. */
export function weakSpotColumn({ open = null } = {}) {
  return {
    key: WEAK_KEY, label: 'WEAK SPOT', cset: 'lean', group: 'Game', w: 132, heat: false, numeric: false, mono: true,
    link: (r) => (open && r.gameId ? () => open(r.gameId) : null),
    title: 'His opponent gives up this stat in the top third of tonight’s clubs, with the number it allows a game. Blank: it does not. Measured over the clubs playing tonight. Tap to open the game. Information, not a forecast.',
  }
}
