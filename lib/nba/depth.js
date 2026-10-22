// 🏀 FIVE POSITIONS FROM ESPN'S DEPTH CHART (2026-10-21). Server only.
//
// ESPN's box score says G / F / C. Its team depth chart (/teams/{id}/depthcharts, probed 10-21) lists PG / SG / SF /
// PF / C, three deep, and a man can sit in two slots (Reaves: PG 3rd, SG 1st). His position is the slot he ranks
// highest in; a tie goes to the earlier slot in PG..C order. A man the chart doesn't list gets no pos5 (never guessed).
// The chart is today's, so it is read the night a game is graded (app/api/buckets/tick) and never applied to old seasons.
import { nbaGet } from './api'
import { nbaTeam } from './teams'

export const POS5 = ['PG', 'SG', 'SF', 'PF', 'C']

/** One club's depth chart JSON -> Map(athleteId -> 'PG'..'C'). PURE. */
export function pos5FromChart(j) {
  const slots = j?.depthchart?.[0]?.positions || {}
  const best = new Map()   // id -> { pos, rank, order }
  POS5.forEach((pos, order) => {
    const list = slots[pos.toLowerCase()]?.athletes || []
    list.forEach((a, rank) => {
      const id = String(a?.id || '')
      if (!id) return
      const was = best.get(id)
      if (!was || rank < was.rank || (rank === was.rank && order < was.order)) best.set(id, { pos, rank, order })
    })
  })
  return new Map([...best].map(([id, v]) => [id, v.pos]))
}

/** Club abbrev -> Map(athleteId -> pos5); an empty Map when the chart can't be read (the caller writes null, never a guess). */
export async function pos5For(abbrev) {
  const t = nbaTeam(abbrev)
  if (!t?.id) return new Map()
  try { return pos5FromChart(await nbaGet(`/teams/${t.id}/depthcharts`, 6 * 3600)) } catch { return new Map() }
}
