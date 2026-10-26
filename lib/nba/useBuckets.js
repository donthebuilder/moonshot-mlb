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
  return useLiveFetch(`/api/buckets/board${q({ date, market: market === 'pts' ? null : market })}`, { pollMs: (b) => (b?.games?.some((g) => g.state !== 'final') ? 120000 : 0), keep: date || 'today' })
}
/** His teammates' played / missed game ids (lib/nba/without.js), for WITHOUT on the splits and the bars. */
export function useBucketsWithout(pid) { return useLiveFetch(/^\d+$/.test(String(pid || '')) ? `/api/buckets/without?pid=${pid}` : null) }
export function useBucketsGame(id) {
  const ok = GAME_ID_RE.test(String(id || ''))
  return useLiveFetch(ok ? `/api/buckets/game?id=${id}` : null, { enabled: ok, pollMs: (g) => (g?.state === 'live' ? 30000 : 0) })
}
/** Seven days of games from a day (null = today). Settled data: no pull. */
export function useBucketsSchedule(date) { return useLiveFetch(`/api/buckets/schedule${q({ date })}`) }
/** What each defence allows, ranked, and that day's games. Settled data: no pull. */
export function useBucketsNumerology(date) { return useLiveFetch(`/api/buckets/numerology${q({ date })}`) }
export function useBucketsDefense(date) { return useLiveFetch(`/api/buckets/defense${q({ date })}`) }
/** Defense vs position: every club's allowed to G / F / C, last 5 / 10 / season, ranked (lib/nba/defPos.js). */
export function useBucketsDefPos(date) { return useLiveFetch(`/api/buckets/defpos${q({ date })}`) }
/** Starters at a position against one club, each against his own average (lib/nba/defPos.js). */
export function useBucketsPosVs(opp, pos) { return useLiveFetch(opp && pos ? `/api/buckets/posvs${q({ opp, pos })}` : null) }
/** Hot hands for a day's rotation players. Settled for the day: no pull. */
export function useBucketsHot(date) { return useLiveFetch(`/api/buckets/hot${q({ date })}`) }
/** Projected points (xPTS) for a day's rotation players. Settled for the day: no pull. */
export function useBucketsExpected(date) { return useLiveFetch(`/api/buckets/expected${q({ date })}`) }
/** The team model's expected points for each game of a day. Settled for the day: no pull. */
export function useBucketsTeamModel(date) { return useLiveFetch(`/api/buckets/teammodel${q({ date })}`) }
/** Our line beside the book's for each game of a day (info only). Settled until tip: no pull. */
export function useBucketsLines(date) { return useLiveFetch(`/api/buckets/lines${q({ date })}`) }
/** The night's ledger: live while a game is on (pulls on the ↻), settled after. */
// `poll: false` (Home's TONIGHT strip): read on load and on a ↻, no 30 s timer -- the Ledger tab keeps its poll
export function useBucketsLedger(date, { poll = true } = {}) { return useLiveFetch(`/api/buckets/ledger${q({ date })}`, { pollMs: (d) => (poll && d?.live ? 30000 : 0), tap: !poll }) }
export function useBucketsStandings(season = null) { return useLiveFetch(`/api/buckets/standings${q({ season })}`) }
export function useBucketsTeam(abbrev) { const ok = Boolean(abbrev); return useLiveFetch(ok ? `/api/buckets/team${q({ team: abbrev })}` : null, { enabled: ok }) }
/** The club page's deep read: ranks, the read season's results (the splits' source), the next game's context, our calls (lib/nba/teamRead.js). */
export function useBucketsTeamDeep(abbrev) { const ok = Boolean(abbrev); return useLiveFetch(ok ? `/api/buckets/teamdeep${q({ team: abbrev })}` : null, { enabled: ok }) }
export function useBucketsPlayer(id) { const ok = PLAYER_ID_RE.test(String(id || '')); return useLiveFetch(ok ? `/api/buckets/player?id=${id}` : null, { enabled: ok }) }
export function useBucketsPlayers() { return useLiveFetch('/api/buckets/players') }
export function useBucketsLeaders() { return useLiveFetch('/api/buckets/leaders') }
/** Where a club or a player shoots from. sel = { team } | { player } | null. */
export function useBucketsShots(sel, season = null) {
  const url = sel?.player ? `/api/buckets/shots${q({ player: sel.player, season })}` : sel?.team ? `/api/buckets/shots${q({ team: sel.team, season })}` : null
  return useLiveFetch(url, { enabled: Boolean(url) })
}
export function useBucketsRecord(days = 60, { pre = false } = {}) { return useLiveFetch(`/api/buckets/record${q({ days, pre: pre ? 1 : null })}`, { tap: true }) }
/** The Called Ledger: one night (date null = the latest graded), or a season window when `days` is set. */
export function useBucketsCalledLedger({ date = null, days = null, enabled = true } = {}) {
  return useLiveFetch(enabled ? `/api/buckets/calledledger${days ? q({ days }) : q({ date })}` : null, { enabled, tap: true })
}
/** The PTS board once (no timer): the Watchlist reads it for the players you follow; a return to the tab pulls it. */
export function useBucketsBoardOnce(date = null) { return useLiveFetch(`/api/buckets/board${q({ date })}`) }
/** Who gains in a blowout: the night's blowout-watch games and each man's minutes in lopsided games vs the rest (lib/nba/blowoutRead.js). */
export function useBucketsBlowout(date) { return useLiveFetch(`/api/buckets/blowout${q({ date })}`) }
/** Every started game's live box lines (the shared live Status on the board tables). Asks nothing until a game has started. */
export function useBucketsLive(date, enabled = true) {
  return useLiveFetch(enabled ? `/api/buckets/live${q({ date })}` : null, { enabled, pollMs: (d) => (d?.games?.some((g) => g.state === 'live') ? 30000 : 0) })
}
