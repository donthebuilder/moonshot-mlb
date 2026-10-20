// BUCKETS' ATTACK SHEET (2026-10-20, Donovan: "how to attack for all sports"; TUDDY's lib/nfl/attackSheet.js is the
// model). The other club's defense against each position (lib/nba/defPos.js: what it allows a game to guards, forwards
// and centers, rank of 30 with 1 = allows the most), the most extreme five, each answered by this club's player at that
// position who does the most of it a game (tonight's board rows, lib/nba board `legs`). Client-safe and pure; a count
// of what happened, never a chance.

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1)
const POS = { G: 'GUARD', F: 'FORWARD', C: 'CENTER' }
const STAT = [
  { k: 'pts', word: 'POINTS', leg: 'ptsPg', unit: 'points', market: 'pts' },
  { k: 'reb', word: 'REBOUNDS', leg: 'rebPg', unit: 'rebounds', market: 'reb' },
  { k: 'ast', word: 'ASSISTS', leg: 'astPg', unit: 'assists', market: 'ast' },
  { k: 'tpm', word: 'THREES', leg: 'tpmPg', unit: 'threes', market: '3pm' },
]
const tierOf = (r, of) => (r == null ? 1 : r <= 8 ? 0 : r > of - 8 ? 2 : 1)
export const NBA_ATTACK_MARKETS = STAT.map((s) => s.market)

/** defPos: /api/buckets/defpos body; boards: { pts, reb, ast, '3pm' } board bodies; off attacks def. */
export function nbaAttackRows(defPos, boards, off, def, take = 5) {
  const out = []
  for (const [pos, posWord] of Object.entries(POS)) {
    const club = defPos?.byPos?.[pos]?.Season?.[def]
    if (!club) continue
    const of = Object.keys(defPos.byPos[pos].Season).length
    for (const s of STAT) {
      const v = club.v?.[s.k], rank = club.r?.[s.k]
      if (!fin(v) || !fin(rank)) continue
      const mine = (boards?.[s.market]?.rows || []).filter((p) => p.team === off && p.pos === pos && fin(p.legs?.[s.leg]) && p.legs[s.leg] > 0)
      const b = mine.sort((x, y) => y.legs[s.leg] - x.legs[s.leg])[0]
      if (!b) continue
      const tier = tierOf(rank, of)
      out.push({ k: `${pos}-${s.k}`, word: `${['SOFT ON', 'AVERAGE ON', 'TOUGH ON'][tier]} ${posWord} ${s.word}`, val: `${r1(v)} a game`, rank, of, tier,
        player: b, name: b.name, why: `${r1(b.legs[s.leg])} ${s.unit} a game` })
    }
  }
  // the soft spots first (what to attack, softest first), then the walls (what to avoid, toughest first), then the rest
  const soft = out.filter((r) => r.tier === 0).sort((a, b) => a.rank - b.rank)
  const tough = out.filter((r) => r.tier === 2).sort((a, b) => b.rank - a.rank)
  const mid = out.filter((r) => r.tier === 1).sort((a, b) => Math.abs(b.rank - (b.of + 1) / 2) - Math.abs(a.rank - (a.of + 1) / 2))
  return [...soft.slice(0, 3), ...tough.slice(0, 2), ...soft.slice(3), ...tough.slice(2), ...mid].slice(0, take)
}
