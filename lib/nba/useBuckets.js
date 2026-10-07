'use client'
// 🏀 BUCKETS' readers -- one hook per app/api/buckets route, all on the shared
// live-data hook (lib/useLiveFetch.js, LAMP's own): { data, error, loading,
// refresh, at }. Nothing polls on a timer: the live pages pull on the ↻
// (lib/liveRefresh.js); `pollMs` only says when a read is worth that pull.
import { useLiveFetch } from '../useLiveFetch'
import { GAME_ID_RE, PLAYER_ID_RE } from './ids'

const HOUR = 60 * 60 * 1000
const q = (o) => { const s = Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'); return s ? `?${s}` : '' }

/** Is the day live? (a game on, or a tip within the hour) -- the ↻ pulls it then. */
export function scoresPollMs(day) {
  if (!day?.games?.length) return 0
  if (day.live > 0) return 30000
  const now = Date.now()
  return day.games.some((g) => g.state === 'pre' && g.start && Math.abs(Date.parse(g.start) - now) < HOUR) ? 120000 : 0
}
export function useBucketsScores(date) { return useLiveFetch(`/api/buckets/scores${q({ date })}`, { pollMs: scoresPollMs }) }
/** A picked day's scores, or nothing when no day is picked (the shell holds today's). */
export function useBucketsScoresOn(date) { return useLiveFetch(date ? `/api/buckets/scores${q({ date })}` : null, { pollMs: scoresPollMs }) }
/** The board for a day and market; worth a pull until every game is final. */
export function useBucketsBoard(date, market = 'pts') {
  return useLiveFetch(`/api/buckets/board${q({ date, market: market === 'pts' ? null : market })}`, { pollMs: (b) => (b?.games?.some((g) => g.state !== 'final') ? 120000 : 0) })
}
export function useBucketsGame(id) {
  const ok = GAME_ID_RE.test(String(id || ''))
  return useLiveFetch(ok ? `/api/buckets/game?id=${id}` : null, { enabled: ok, pollMs: (g) => (g?.state === 'live' ? 30000 : 0) })
}
/** Seven days of games from a day (null = today). Settled data: no pull. */
export function useBucketsSchedule(date) { return useLiveFetch(`/api/buckets/schedule${q({ date })}`) }
/** What each defence allows, ranked, and that day's games. Settled data: no pull. */
export function useBucketsNumerology(date) { return useLiveFetch(`/api/buckets/numerology${q({ date })}`) }
export function useBucketsDefense(date) { return useLiveFetch(`/api/buckets/defense${q({ date })}`) }
/** Hot hands for a day's rotation players. Settled for the day: no pull. */
export function useBucketsHot(date) { return useLiveFetch(`/api/buckets/hot${q({ date })}`) }
/** Projected points (xPTS) for a day's rotation players. Settled for the day: no pull. */
export function useBucketsExpected(date) { return useLiveFetch(`/api/buckets/expected${q({ date })}`) }
/** The night's ledger: live while a game is on (pulls on the ↻), settled after. */
// `poll: false` (Home's TONIGHT strip): read on load and on a ↻, no 30 s timer -- the Ledger tab keeps its poll
export function useBucketsLedger(date, { poll = true } = {}) { return useLiveFetch(`/api/buckets/ledger${q({ date })}`, { pollMs: (d) => (poll && d?.live ? 30000 : 0), tap: !poll }) }
export function useBucketsStandings(season = null) { return useLiveFetch(`/api/buckets/standings${q({ season })}`) }
export function useBucketsTeam(abbrev) { const ok = Boolean(abbrev); return useLiveFetch(ok ? `/api/buckets/team${q({ team: abbrev })}` : null, { enabled: ok }) }
export function useBucketsPlayer(id) { const ok = PLAYER_ID_RE.test(String(id || '')); return useLiveFetch(ok ? `/api/buckets/player?id=${id}` : null, { enabled: ok }) }
export function useBucketsPlayers() { return useLiveFetch('/api/buckets/players') }
export function useBucketsLeaders() { return useLiveFetch('/api/buckets/leaders') }
/** Where a club or a player shoots from. sel = { team } | { player } | null. */
export function useBucketsShots(sel, season = null) {
  const url = sel?.player ? `/api/buckets/shots${q({ player: sel.player, season })}` : sel?.team ? `/api/buckets/shots${q({ team: sel.team, season })}` : null
  return useLiveFetch(url, { enabled: Boolean(url) })
}
export function useBucketsRecord(days = 60, { pre = false } = {}) { return useLiveFetch(`/api/buckets/record${q({ days, pre: pre ? 1 : null })}`, { tap: true }) }
