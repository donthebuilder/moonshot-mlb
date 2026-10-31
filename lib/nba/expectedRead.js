// 🏀 BUCKETS' PROJECTED POINTS, READ (server only). lib/nba/expectedPoints.js is the arithmetic; this feeds it
// from the same ESPN reads the rest of the site uses: each player's game log (regular season and playoffs, this
// season then last), the league's season totals for the opponent's points allowed, and the night's board for who is
// playing. The board's rotation players only (>= 12 pooled minutes a game, the top 12 a club by minutes), as Hot
// hands reads them; everyone else shows a dash with the reason. Cached 15 minutes per day, like Hot.
import { unstable_cache } from 'next/cache'
import { readNbaBoard } from './boardRead'
import { gamelogFor, reduceGamelog } from './api'
import { nbaSeason } from './season'
import { seasonStats } from './stats'
import { projectPoints, xptsLine } from './expectedPoints'

// the other counts (2026-10-29): rebounds, assists, threes -- the same minutes x rate arithmetic, no opponent factor (we hold a points-allowed number only)
const OTHER = [['reb', 'xreb', 'rebounds'], ['ast', 'xast', 'assists'], ['tpm', 'xtpm', 'threes']]

const WINDOW = 82   // the season line the rate shrinks toward: his last 82 games across seasons (LAMP's pooled window)
const real = (log) => log.filter((g) => g.seasonType === 2 || g.seasonType === 3)
const NOT_SEASON = /all-star|cup\s*-\s*(championship|final)/i
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } }))
  return out
}

/** The opponent's real points allowed a game and the league mean, from the season totals (this season, else last). */
export function oppAllowance(S, P, abbrev) {
  const pick = (m) => { const v = [...(m?.teams?.values() || [])].map((t) => t.oppPts).filter((x) => Number.isFinite(x)); return v.length >= 20 ? { teams: m.teams, league: v.reduce((a, b) => a + b, 0) / v.length } : null }
  const src = pick(S) || pick(P)
  const allowed = src?.teams.get(abbrev)?.oppPts
  return src && Number.isFinite(allowed) ? { allowed, league: src.league } : null
}

/** Project one player from his games (newest first, both seasons) and his opponent. */
export function projectFromLog(log, opp) {
  const games = (log || []).filter((g) => !NOT_SEASON.test(g.note || '') && g.min > 0 && g.pts != null)
  const last82 = games.slice(0, WINDOW)
  const sum = (k) => last82.reduce((t, g) => t + (g[k] || 0), 0)
  const season = { min: sum('min'), pts: sum('pts'), reb: sum('reb'), ast: sum('ast'), tpm: sum('tpm') }
  const p = projectPoints({ recent: games, season, opp })
  const others = Object.fromEntries(OTHER.map(([stat, key, word]) => {
    const q = projectPoints({ recent: games, season, opp: null }, { stat })
    return [key, q.ok ? { x: q.xpts, line: xptsLine(q, word) } : null]
  }))
  return p.ok ? { ...p, line: xptsLine(p), lastGame: games[0]?.date || null, others } : p
}

/** His log, this season first and last season behind it only while this one is short of the recent window. */
export async function logFor(id, sn) {
  const cur = real(reduceGamelog(await gamelogFor(id, sn.cur).catch(() => ({}))))
  if (cur.length >= 20) return cur
  const prev = real(reduceGamelog(await gamelogFor(id, sn.prev).catch(() => ({}))))
  return [...cur, ...prev]
}

async function compute(date) {
  const [sn, board] = await Promise.all([nbaSeason(), readNbaBoard(date, 'pts')])
  const [S, P] = await Promise.all([seasonStats(sn.cur), seasonStats(sn.prev)])
  const pick = (board.rows || []).filter((r) => (r.legs?.minPg || 0) >= 12).sort((a, b) => (b.legs?.minPg || 0) - (a.legs?.minPg || 0))
  const counted = new Map(); const players = []
  for (const r of pick) { const k = counted.get(r.team) || 0; if (k < 12) { counted.set(r.team, k + 1); players.push(r) } }
  const rows = (await pool(players, 6, async (r) => {
    const p = projectFromLog(await logFor(r.playerId, sn), oppAllowance(S, P, r.opp))
    const o1 = (k) => (p.ok && p.others?.[k] ? { v: Math.round(p.others[k].x * 10) / 10, line: p.others[k].line } : null)
    return p.ok ? { playerId: r.playerId, xpts: Math.round(p.xpts * 10) / 10, xreb: o1('xreb')?.v ?? null, xrebLine: o1('xreb')?.line ?? null, xast: o1('xast')?.v ?? null, xastLine: o1('xast')?.line ?? null, xtpm: o1('xtpm')?.v ?? null, xtpmLine: o1('xtpm')?.line ?? null, minRecent: Math.round(p.minRecent * 10) / 10, rate: Math.round(p.rate * 1000) / 1000, oppFactor: Math.round(p.oppFactor * 1000) / 1000, oppKnown: p.oppKnown, n: p.n, line: p.line }
      : { playerId: r.playerId, xpts: null, reason: p.reason }
  })).filter(Boolean)
  return { date, rows }
}

/** { date, rows: [{ playerId, xpts, minRecent, rate, oppFactor, oppKnown, n, line }] } for a day's rotation players. */
export function expectedRows(date) {
  return unstable_cache(() => compute(date), ['nba-xpts-v2', date], { revalidate: 900 })()
    .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? compute(date) : Promise.reject(e)))
}
