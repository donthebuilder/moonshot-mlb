// THE NFL WATCHLIST'S ROWS, PURE (2026-10-10 upgrade). Everything the page prints about a watched man is
// decided here so a check can prove it on labelled test data and the component only draws.
//
// Nothing here is a model number: the status word is lib/nfl/tdStatus (-> lib/callStatus), the rank is
// his place on this week's TD board (lib/nfl/tdPool), the injury tag is lib/nfl/injury, the role is
// lib/nfl/roles. The pin itself is read exactly as lib/nfl/watchlist.js stores it (the stored key and
// shape are untouched): `pinned_at` / `pinned_score` / `pinned_market` may be absent on an old pin and
// then the "since you saved him" move is blank, never back-filled.
import { injuryTag, isOut } from './injury'
import { roleLabel } from './roles'
import { easternDate } from '../data'

const fin = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** Score now minus score when saved, on the market he was pinned for (null when it cannot be said). */
export function movementOf(pin, player) {
  const from = fin(pin?.pinned_score)
  const market = pin?.pinned_market
  if (from == null || !market || !player) return null
  const to = fin(player.scores?.[market])
  if (to == null) return { market, from, to: null, delta: null }
  return { market, from, to, delta: Math.round((to - from) * 10) / 10 }
}

const DAY = 86400000
export function agoOf(iso, now = Date.now()) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const days = Math.floor((now - t) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

/**
 * One row per pin.
 * @param pins     useNflWatchlist().pins (rebuilt against the loaded slate; `stale` = not on it)
 * @param byId     Map player_id -> week-file player
 * @param statusOf (player) -> 'called' | 'board' | 'off'   (lib/nfl/tdStatus)
 * @param rankOf   Map player_id -> place on the TD board
 * @param moveOf   (player_id) -> { move, prevAt, source } | null   (useRankMove().cell)
 */
export function buildWatchRows({ pins = [], byId = new Map(), statusOf = null, rankOf = new Map(), moveOf = null, now = Date.now() } = {}) {
  return pins.map((pin) => {
    const id = String(pin.player_id)
    const player = byId.get(id) || null
    const base = { id, pin, player, ago: agoOf(pin.pinned_at, now), kickoffMs: Date.parse(pin.kickoff || '') }
    if (!player) return { ...base, status: null, rank: null, rankMove: null, inj: null, role: null, best: null, score: null, td: null, move: null, markets: [] }
    const markets = Object.entries(player.scores || {}).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1])
    const [best, raw] = markets[0] || []
    return {
      ...base,
      status: statusOf ? statusOf(player) : null,
      rank: rankOf.get(id) ?? null,
      rankMove: moveOf ? moveOf(id) : null,
      inj: injuryTag(player),
      role: roleLabel(player) || player.position || null,
      best: best || null,
      score: Number.isFinite(raw) ? raw : null,
      td: Number.isFinite(player.scores?.TD) ? player.scores.TD : null,
      move: movementOf(pin, player),
      markets,
    }
  })
}

/** Default order: the board's own TD score, highest first; a man off the slate sinks. */
export function sortRows(rows) {
  return [...rows].sort((a, b) => (b.td ?? b.score ?? -Infinity) - (a.td ?? a.score ?? -Infinity))
}

/** The one line at the top. `today` is an Eastern date key (lib/data easternDate), the game's own day compared to it. */
export function summarize(rows, today = easternDate(Date.now())) {
  const live = rows.filter((r) => r.player && !r.pin.stale)
  const playingToday = live.filter((r) => Number.isFinite(r.kickoffMs) && easternDate(r.kickoffMs) === today).length
  return {
    count: rows.length,
    playingToday,
    thisWeek: live.filter((r) => Number.isFinite(r.kickoffMs)).length,
    called: live.filter((r) => r.status === 'called').length,
    out: live.filter((r) => r.inj && isOut(r.inj)).length,
    questionable: live.filter((r) => r.inj && !isOut(r.inj)).length,
  }
}

const MOVE_MIN = 3   // points of score since he was saved before it is worth a line of its own
/** Who moved: a rank arrow (up / down / new) or >= MOVE_MIN points on his score since he was saved. Information only. */
export function movedRows(rows) {
  return rows.filter((r) => r.player && (r.rankMove?.move || (Number.isFinite(r.move?.delta) && Math.abs(r.move.delta) >= MOVE_MIN)))
}

/** Real suggestions for an empty list: the top of this week's board, nobody invented, never someone already watched. */
export function suggestions(boardRows = [], pinnedIds = new Set(), n = 3) {
  return boardRows.filter((p) => p && !pinnedIds.has(String(p.player_id)) && p.position !== 'DEF').slice(0, n)
}

/** Game filter options from the pins' own games, by kickoff. */
export function gameOptions(games = [], pins = []) {
  return games
    .map((g) => ({ game: g, count: pins.filter((p) => p.game_id === g.game_id).length }))
    .filter((o) => o.count > 0)
    .sort((a, b) => new Date(a.game.kickoff || 0) - new Date(b.game.kickoff || 0))
}
