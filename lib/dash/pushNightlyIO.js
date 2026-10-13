// THE READS BEHIND THE NIGHTLY NOTES (2026-10-13). Server only. lib/dash/pushNightly.js is the pure half; this fetches what it needs and nothing more:
//
//   callsgraded  Only when some account has the switch on AND follows a CALLED pick. Reads: tonight's saved board (dash_board_day, a few KB, the same row the sender
//                already keeps), the NHL CALLED rows of followed skaters (lamp_goal_log, one small select), and, only once every game those picks are in is over, the
//                public receipt's own loader (lib/posts/receiptLoad.js: schedule, homer_feed, box lines). It re-grades nothing: the graders are the receipt's.
//                A night that is not graded yet is asked about again after RETRY_MS, not every minute. NFL is not covered (no per-account CALLED list is stored).
//   weekly       Only on Monday, only for accounts that chose it (Everything), at most WEEKLY_PER_SWEEP accounts a sweep. Reads the cards the followed players earned
//                (lib/cards/specialData.js earnedFor, the Binder's own read) and the account's own calls-graded notes in dash_push_log.
//
// No new table, no new cron, no polling of anything new: it rides the sender's existing first sweep of each minute.
import { callStatus, CALL_ROLES } from '../callStatus'
import { callsGradedEvent, gradeCalled, weeklyEvent, parseCallsBody } from './pushNightly'
import { etDayOf, etHour, etWeekday } from './pushBrake'

const txt = (v) => String(v == null ? '' : v).trim()
export const RETRY_MS = 5 * 60 * 1000
export const WEEKLY_PER_SWEEP = 25
export const WEEKLY_MAX_FOLLOWS = 40

const dayBefore = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10) }

const _wait = new Map()    // day -> ms before which the night is not asked about again
const _done = new Set()    // `${day}:${userId}` already produced on this instance
const _weeklyDone = new Set()
export const _resetNightlyForTests = () => { _wait.clear(); _done.clear(); _weeklyDone.clear() }

/** The first CALLED role token of a slash list ("HR/CONTACT" -> "HR"), the one the grader reads. */
const roleOf = (r) => {
  const tokens = txt(r).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  return CALL_ROLES.find((c) => tokens.includes(c)) || 'HR'
}

/** Per account: the ids it follows, by sport. Muted men and tombstones are not followed for this purpose. */
function followsOf(state) {
  const out = { mlb: new Set(), nhl: new Set() }
  const list = state?.dash_follow_v1
  if (!list || typeof list !== 'object') return out
  for (const [key, row] of Object.entries(list)) {
    if (!row || row.removed || row.mute) continue
    const sport = key.slice(0, key.indexOf(':'))
    if (out[sport]) out[sport].add(String(row.id))
  }
  return out
}

/**
 * The calls-graded events for tonight (and last night, until 8 am ET). @param deps  test seam: { loadBoard, loadNhlCalled, receiptLoader, nightSettled, outcomeOf }
 */
export async function callsGradedEvents({ db, snap, stateByUser, wantsFn, now = Date.now(), deps = {} }) {
  const users = []
  for (const [userId, state] of Object.entries(stateByUser || {})) {
    if (typeof wantsFn === 'function' && !wantsFn(state, { category: 'callsgraded', owner: userId, sport: 'all' }, now)) continue
    const f = followsOf(state)
    if (f.mlb.size || f.nhl.size) users.push({ userId, ...f })
  }
  if (!users.length) return []
  const today = etDayOf(now)
  const days = etHour(now) < 8 ? [today, dayBefore(today)] : [today]
  const out = []
  for (const day of days) {
    if ((_wait.get(day) || 0) > now) continue
    const pending = users.filter((u) => !_done.has(`${day}:${u.userId}`))
    if (!pending.length) continue

    // who is CALLED, among the men anybody here follows
    const loadBoard = deps.loadBoard || (async (d) => {
      const { data, error } = await db.from('dash_board_day').select('rows').eq('day', d).maybeSingle()
      if (error) { console.error(`[push] calls board read failed: ${error.message}`); return null }
      return Array.isArray(data?.rows) ? data.rows : null
    })
    const loadNhl = deps.loadNhlCalled || (async (d, ids) => {
      if (!ids.length) return []
      const { ALL_VERSIONS } = await import('../nhl/goalModel')
      const { data, error } = await db.from('lamp_goal_log').select('player_id, name, team, game_id, status').eq('game_date', d).eq('status', 'called').in('player_id', ids).in('model_version', ALL_VERSIONS)
      if (error) { console.error(`[push] calls lamp_goal_log read failed: ${error.message}`); return [] }
      return data || []
    })
    const allMlb = new Set(pending.flatMap((u) => [...u.mlb]))
    const allNhl = new Set(pending.flatMap((u) => [...u.nhl]))
    const board = allMlb.size ? await loadBoard(day) : null
    const calledMlb = new Map()
    for (const r of board || []) {
      const id = txt(r?.player_id)
      if (!id || !allMlb.has(id) || calledMlb.has(id)) continue
      if (callStatus({ role: r.game_pick_role }) !== 'called') continue
      calledMlb.set(id, { sport: 'mlb', id, name: txt(r.name), role: roleOf(r.game_pick_role), game: r.game_pk ?? null, team: txt(r.team) })
    }
    const calledNhl = new Map()
    for (const r of allNhl.size ? await loadNhl(day, [...allNhl]) : []) {
      const id = txt(r.player_id)
      if (id && !calledNhl.has(id)) calledNhl.set(id, { sport: 'nhl', id, name: txt(r.name), role: null, game: r.game_id ?? null, team: txt(r.team) })
    }
    const forUser = (u) => [...[...u.mlb].map((id) => calledMlb.get(id)), ...[...u.nhl].map((id) => calledNhl.get(id))].filter(Boolean)
    const withCalls = pending.filter((u) => forUser(u).length)
    if (!withCalls.length) { _wait.set(day, now + RETRY_MS); continue }

    // a cheap check first: a CALLED MLB pick whose game the slate says is still going -> not yet (no schedule fetch, no box scores)
    const gamesInSnap = new Map((snap?.games || []).map((g) => [String(g.pk), g]))
    const stillOn = [...calledMlb.values()].some((p) => { const g = gamesInSnap.get(String(p.game)); return g && g.settled !== true && g.postponed !== true })
    if (stillOn) { _wait.set(day, now + 60 * 1000); continue }

    const mod = deps.receiptLoader ? null : await import('../posts/receiptLoad')
    const rcpt = deps.nightSettled ? null : await import('../posts/receipt')
    const loader = (deps.receiptLoader || mod.receiptLoader)(db, { day })
    const nightSettled = deps.nightSettled || rcpt.nightSettled
    const outcomeOf = deps.outcomeOf || rcpt.outcomeOf
    const everyone = [...calledMlb.values(), ...calledNhl.values()]
    let loaded
    try { loaded = await loader(everyone) } catch (e) { console.error(`[push] calls loader threw: ${e?.message || e}`); _wait.set(day, now + RETRY_MS); continue }
    let waiting = false
    for (const u of withCalls) {
      const g = gradeCalled(forUser(u), { games: loaded.games, results: loaded.results, nightSettled, outcomeOf })
      if (!g.ready) { waiting = true; continue }
      _done.add(`${day}:${u.userId}`)
      const ev = callsGradedEvent(u.userId, day, g)
      if (ev) out.push(ev)
    }
    if (waiting) _wait.set(day, now + RETRY_MS)
  }
  return out
}

/** The Monday of the week just gone, and the Monday before it: the window of "last week" as ET dates [from, to). */
export function lastWeekWindow(now = Date.now()) {
  const to = etDayOf(now)
  const [y, m, d] = to.split('-').map(Number)
  return { from: new Date(Date.UTC(y, m - 1, d - 7, 12)).toISOString().slice(0, 10), to }
}

/**
 * Monday's note, for the accounts that chose it. @param deps  test seam: { earnedFor, tierRank, minTier }
 */
export async function weeklyEvents({ db, stateByUser, wantsFn, now = Date.now(), deps = {} }) {
  if (etWeekday(now) !== 1 || etHour(now) < 9) return []
  const monday = etDayOf(now)
  const { from, to } = lastWeekWindow(now)
  const out = []
  let budget = WEEKLY_PER_SWEEP
  for (const [userId, state] of Object.entries(stateByUser || {})) {
    if (budget <= 0) break
    const dk = `${monday}:${userId}`
    if (_weeklyDone.has(dk)) continue
    if (typeof wantsFn === 'function' && !wantsFn(state, { category: 'weekly', owner: userId, sport: 'all' }, now)) continue
    const rows = Object.entries(state?.dash_follow_v1 && typeof state.dash_follow_v1 === 'object' ? state.dash_follow_v1 : {})
      .filter(([, r]) => r && !r.removed && !r.mute && ['mlb', 'nfl', 'nhl'].includes(r.sport || ''))
      .slice(0, WEEKLY_MAX_FOLLOWS).map(([, r]) => r)
    budget -= 1
    _weeklyDone.add(dk)
    let cards = 0
    const earnedFor = deps.earnedFor || (await import('../cards/specialData')).earnedFor
    const tierRank = deps.tierRank || (await import('../cards/moments')).tierRank
    const minTier = deps.minTier || { nhl: 'star', mlb: 'elite', nfl: 'elite' }
    for (const r of rows) {
      try {
        const { cards: list } = await earnedFor({ sport: r.sport, id: r.id, db, limit: 30 })
        cards += (list || []).filter((c) => String(c.day) >= from && String(c.day) < to && tierRank(c.tier) >= tierRank(minTier[r.sport])).length
      } catch (e) { console.error(`[push] weekly cards ${r.sport}/${r.id}: ${e?.message || e}`) }
    }
    let cashed = 0; let total = 0
    const { data, error } = await db.from('dash_push_log').select('body').eq('user_id', userId).eq('category', 'callsgraded').in('outcome', ['sent', 'bundled']).gte('at', new Date(Date.parse(`${from}T12:00:00Z`)).toISOString())
    if (error) console.error(`[push] weekly calls log: ${error.message}`)
    for (const row of data || []) { const p = parseCallsBody(row.body); if (p) { cashed += p.cashed; total += p.total } }
    const ev = weeklyEvent(userId, monday, { cards, cashed, total })
    if (ev) out.push(ev)
  }
  return out
}
