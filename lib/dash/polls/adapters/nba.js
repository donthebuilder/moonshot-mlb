// BUCKETS' poll adapter (X overhaul stage 3 piece 2). BUILT AND ON, but it can only fire when the
// slate has REGULAR-SEASON (or playoff) games: the preseason and the offseason have none, so no
// BUCKETS poll goes out until the season starts. No site-pointer line in any poll, and no guess
// format (no stored per-game result to reveal from yet). A player listed OUT is never named.
import { readNbaBoard } from '../../../nba/boardRead'
import { hotRows } from '../../../nba/hot'
import { byBoard, num, onePerPlayer, runLength, txt } from './shared'

const BAR = 25
const STREAK_MIN = 2
const CHECKED = 20
const OUT = /\b(out|inactive|suspended|doubtful)\b/i

/** Pure: a readNbaBoard('pts') result -> { players, pending }. seasonType 2 = regular season, 3 = playoffs. */
export function nbaPlayersFrom({ board, now = Date.now() }) {
  const startOf = new Map()
  let active = false
  for (const g of board?.games || []) {
    if (Number(g.seasonType) < 2 || g.state !== 'pre') continue
    const t = Date.parse(g.start)
    if (Number.isFinite(t) && t > now) { startOf.set(String(g.id), t); active = true }
  }
  const players = []
  for (const r of board?.rows || []) {
    const startMs = startOf.get(String(r.gameId))
    const id = txt(r.playerId)
    if (!startMs || !id || !txt(r.name) || OUT.test(txt(r.injury))) continue
    players.push({ id, name: txt(r.name), team: txt(r.team), opp: txt(r.opp) || null, startMs, rank: num(r.rank), score: num(r.score), pos: txt(r.pos), status: r.status })
  }
  return { active, players: onePerPlayer(players).sort((a, b) => (num(b.score) ?? 0) - (num(a.score) ?? 0) || byBoard(a, b)), pending: [] }
}

/** Pure: BUCKETS hot rows (spark = last ten games' points, oldest first) -> the 25+ points facts. */
export function nbaBarsFrom(hot, players) {
  const byId = new Map((hot?.rows || []).map((r) => [String(r.playerId), r]))
  const out = []
  for (const p of players) {
    const r = byId.get(p.id)
    if (!r || !Array.isArray(r.spark) || r.spark.length < 5) continue
    out.push({ id: p.id, label: `${BAR}+ points`, threshold: BAR, cleared: r.spark.filter((v) => Number(v) >= BAR).length, of: r.spark.length })
  }
  return out
}
export function nbaStreaksFrom(hot, players) {
  const byId = new Map((hot?.rows || []).map((r) => [String(r.playerId), r]))
  const out = []
  for (const p of players) {
    const r = byId.get(p.id)
    if (!r || !Array.isArray(r.spark)) continue
    const n = runLength([...r.spark].reverse(), (v) => Number(v) >= BAR)        // newest first
    if (n >= STREAK_MIN) out.push({ id: p.id, what: `${BAR}+ points`, whatKey: 'p25', n, min: STREAK_MIN })
  }
  return out
}

export function createNbaPollAdapter({ day, now = Date.now() } = {}) {
  let _slate = null, _hot
  const slate = async () => {
    if (_slate) return _slate
    const board = await readNbaBoard(day, 'pts').catch((e) => { console.error(`[polls] nba board: ${e?.message}`); return null })
    if (!board) return (_slate = { active: false, why: 'no board', players: [], pending: [] })
    const s = nbaPlayersFrom({ board, now })
    return (_slate = { ...s, why: s.active ? undefined : 'no regular-season BUCKETS game left tonight' })
  }
  const hot = async () => (_hot !== undefined ? _hot : (_hot = await hotRows(day).catch(() => null)))
  return {
    sport: 'nba',
    slate,
    bars: async () => nbaBarsFrom(await hot(), (await slate()).players.slice(0, CHECKED)),
    streaks: async () => nbaStreaksFrom(await hot(), (await slate()).players.slice(0, CHECKED)),
    called: async () => (await slate()).players.filter((p) => p.status === 'called').map((p) => ({ id: p.id, name: p.name, team: p.team })),
    async results() { return { known: false, ranking: [] } },
  }
}
