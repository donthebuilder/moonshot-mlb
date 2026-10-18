// TONIGHT'S CALLS FOR THE PHONE APP (2026-10-16). One small public file, no database: pick_lock.json (about 50 KB), the ledger the bot keeps of who was
// CALLED in each game (TOP / HR / HIT / HRR / CONTACT). It is the same record the locked-record rule reads, so a card in the phone app is a call that was posted,
// never a re-derived one. Read through the framework cache for two minutes so a page view never costs a fetch. Null on any failure: the caller shows the
// board card instead, nothing is invented.
import { dataUrl } from '../dataSource'

const ROLES = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']

/** Pure: pick_lock.json -> { date, items:[{ id, name, roles, gameId, firstPitch }] }, one entry per man, in first-pitch order. */
export function callsFromLock(lock) {
  const games = lock && typeof lock === 'object' ? lock.games : null
  if (!games || typeof games !== 'object') return { date: null, items: [] }
  const items = []
  for (const [gameId, g] of Object.entries(games)) {
    const byPid = new Map()
    for (const role of ROLES) {
      const c = g?.cats?.[role]
      if (!c?.pid) continue
      const e = byPid.get(String(c.pid)) || { id: String(c.pid), name: String(c.name || ''), roles: [], gameId, firstPitch: g.first_pitch || null }
      e.roles.push(role)
      byPid.set(String(c.pid), e)
    }
    items.push(...byPid.values())
  }
  items.sort((a, b) => String(a.firstPitch).localeCompare(String(b.firstPitch)) || a.name.localeCompare(b.name))
  return { date: lock.date || null, items }
}

/** Pure: nfl_picks.json -> { week, label, items:[{ id, name, team, opp, position }] }, the week's anytime-TD board, top N in the bot's own order. */
export function nflBoardFromPicks(picks, n = 5) {
  const rungs = picks && picks.mode === 'week' ? picks.card?.TD?.rungs : null
  if (!Array.isArray(rungs)) return null
  const items = rungs.slice(0, n).filter((r) => r?.player_id && r?.name)
    .map((r) => ({ id: String(r.player_id), name: String(r.name), team: String(r.team || ''), opp: String(r.opp || ''), position: String(r.position || '') }))
  return items.length ? { week: picks.week ?? null, label: String(picks.label || ''), items } : null
}

export async function nflWeekBoard() {
  try {
    const res = await fetch(dataUrl('current/nfl_picks.json'), { next: { revalidate: 120 } })
    return res.ok ? nflBoardFromPicks(await res.json()) : null
  } catch { return null }
}

/**
 * Pure: the LOCKED goal-board rows of a night (lamp_goal_log) + the games that have locked -> the CALLED skaters, best score first.
 * `status` is the record's own word (goalModel scoreNight wrote it at lock); nothing is re-derived here. Rows of a game that has not
 * locked yet are left out: a preview is not a call.
 */
export function nhlCalledFromLog(rows, games, n = 6) {
  const lockedIds = new Set((games || []).filter((g) => g?.locked_at).map((g) => String(g.game_id)))
  const seen = new Set()
  const items = (rows || [])
    .filter((r) => r && r.status === 'called' && lockedIds.has(String(r.game_id)) && r.player_id != null && r.name)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || String(a.name).localeCompare(String(b.name)))
    .filter((r) => (seen.has(String(r.player_id)) ? false : (seen.add(String(r.player_id)), true)))
    .slice(0, n)
    .map((r) => ({ id: String(r.player_id), name: String(r.name), team: String(r.team || ''), opp: String(r.opp || ''), position: String(r.pos || ''), gameId: String(r.game_id) }))
  return items.length ? { items } : null
}

/** Tonight's CALLED skaters (GOAL board) for the front door; null before any game has locked or when the log cannot be read. */
export async function nhlTonightCalls(date) {
  if (!date) return null
  try {
    const { readLocked } = await import('../nhl/boardRead')
    const { locked, games } = await readLocked(date, 'GOAL', { cols: 'pulse' })
    return nhlCalledFromLog(locked, games)
  } catch { return null }
}

export async function mlbTodayCalls() {
  try {
    const res = await fetch(dataUrl('current/pick_lock.json'), { next: { revalidate: 120 } })
    if (!res.ok) return null
    const out = callsFromLock(await res.json())
    return out.items.length ? out : null
  } catch { return null }
}

// ── THE SWIPE DECK'S LISTS FOR TUDDY AND LAMP (2026-10-18, PHONE-PARITY 9a) ──────────────────────────────────────────────────────────────────
// Same men, same order as the front door's lists above; each item also carries what the member gate and CardSwipe need: the game's id (the lock key for NHL is
// `${gameId}|${playerId}`, for NFL the player id), its start time (a call whose game has started is open to everyone), and the word 'called'.

/** Pure: nflBoardFromPicks() output + the week file's games -> deck items. A man whose club has no game in the file keeps a null start (never started, never open). */
export function nflDeckItems(board, games) {
  if (!board?.items?.length) return null
  const gameOf = new Map()
  for (const g of games || []) { gameOf.set(String(g?.home), g); gameOf.set(String(g?.away), g) }
  const items = board.items.map((it) => {
    const g = gameOf.get(it.team)
    return { ...it, roles: ['TD'], status: 'called', gameId: g?.game_id != null ? String(g.game_id) : null, firstPitch: g?.kickoff || null }
  })
  return { week: board.week, label: board.label, items }
}

/** Pure: nhlCalledFromLog() output + the night's games (reduceScoreDay) -> deck items. */
export function nhlDeckItems(called, games) {
  if (!called?.items?.length) return null
  const startOf = new Map((games || []).map((g) => [String(g.id), g.startUtc || null]))
  return { items: called.items.map((it) => ({ ...it, roles: ['GOAL'], status: 'called', firstPitch: startOf.get(String(it.gameId)) || null })) }
}

export async function nflTodayCalls() {
  try {
    const board = await nflWeekBoard()
    if (!board) return null
    const { fetchNfl, nflSlatePaths, nflSlateLooksReal } = await import('../nfl/dataSource')
    const week = await fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)
    return nflDeckItems(board, week?.games)
  } catch { return null }
}

export async function nhlTodayCalls(date) {
  if (!date) return null
  try {
    const called = await nhlTonightCalls(date)
    if (!called) return null
    const [{ scoreFor }, { reduceScoreDay }] = await Promise.all([import('../nhl/api'), import('../nhl/reduce')])
    const sd = reduceScoreDay(await scoreFor(date).catch(() => null))
    return nhlDeckItems(called, sd?.games)
  } catch { return null }
}
