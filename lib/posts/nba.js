// BUCKETS' ADAPTER FOR THE SLATE (X overhaul piece 3). Pure: takes lib/nba/boardRead.js readNbaBoard()
// ('pts'). The line appears only when BUCKETS has REGULAR-SEASON games that day (seasonType 2): a
// preseason night is not on the Slate. It never points at the site: the pointer line leaves BUCKETS out
// until the product is public (lib/posts/slate.js).
import { nbaTeam } from '../nba/teams'
import { resultOf } from '../record/nba'

export const SPORT = 'nba'
const txt = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export function nbaSlate({ board = null, now = Date.now() } = {}) {
  const games = (board?.games || []).filter((g) => g && g.seasonType === 2 && g.state !== 'postponed' && g.state !== 'canceled')
  const starts = games.map((g) => Date.parse(g.start)).filter(Number.isFinite)
  const out = { sport: SPORT, hasGames: games.length > 0, firstStartMs: starts.length ? Math.min(...starts) : NaN, hold: null, cands: [] }
  const byGame = new Map(games.map((g) => [String(g.id), g]))
  for (const r of board?.rows || []) {
    const g = byGame.get(String(r.gameId))
    if (!g || r.status !== 'called' || !(r.score != null)) continue
    const id = txt(r.playerId)
    const rank = num(r.nightRank), of = num(r.nightOf)
    if (!id || !(rank > 0) || !(of > 0)) continue
    const startMs = Date.parse(g.start)
    let problem = null
    if (/\bout\b/i.test(txt(r.injury))) problem = { id, reason: `listed ${txt(r.injury)}`, pending: false }
    else if (g.state !== 'pre' || startMs <= now) problem = { id, reason: 'game already started', pending: false }
    const t = nbaTeam(r.team)
    out.cands.push({
      sport: SPORT, id, name: txt(r.name), team: txt(r.team), teamName: t ? `${t.place} ${t.nick}` : '', rank, of, startMs, problem,
      proof: `#${rank} of ${of} on tonight's board`,
    })
  }
  return out
}

// ── THE NIGHT RECEIPT's grade for a named player (lib/posts/receipt.js) ─────────────────────────────
// BUCKETS grades its own rows (buckets_log: played + hit, graded when the game is final); lib/record/nba.js resultOf
// is the one word for it: hit / miss / void (did not play) / null (not graded yet). The receipt reads it only when
// BUCKETS is public (lib/posts/receiptLoad.js), so this is an adapter, not a change to what posts today.
/**
 * @param p   { id }
 * @param res { rows: Map<id, buckets_log row> }
 * @returns {'cashed'|'missed'|'void'|'pending'}
 */
export function nbaOutcome(p, res = {}) {
  const row = res.rows instanceof Map ? res.rows.get(txt(p?.id)) : null
  const r = row ? resultOf(row) : null
  return r === 'hit' ? 'cashed' : r === 'miss' ? 'missed' : r === 'void' ? 'void' : 'pending'
}
