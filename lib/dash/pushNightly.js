// THE NOTES ADDRESSED TO ONE PERSON, NOT TO WHOEVER FOLLOWS A MAN (2026-10-13; the notifications audit, "brake the noise" and "add missing pushes").
// Three pushes whose words depend on ONE person's follow list, so each event carries `owner` (the account) and the sender's wants() skips the follow gate for it
// (the same path a FRANCHISE draft pick takes) while still checking the person's category switch, their pause and their muted men:
//
//   recap        "Your 10 hitters: 3 cleared, 7 did not" -- ONE per person per night, after the last game of THEIR followed hitters is final. It replaced the per-hitter
//                final line. NEVER sent on a night where nothing cleared (a 0-for night is not news anyone asked for).
//   callsgraded  "Your CALLED picks: 3 of 5 cleared" -- ONE per person per night, once the CALLED picks of players they follow are graded (the receipt's own graders).
//                Not sent when none cleared, and a man who did not play is outside the count, exactly as the public receipt counts.
//   weekly       Monday: "Last week: 3 cards earned, 2 of 5 CALLED picks cleared" -- only for a person with something to say.
//
// PURE here (no I/O): lib/dash/pushNightlyIO.js does the reads and hands the data in. Test data only in the checks; nothing is invented.
import { clearedNight } from './pushBrake'
import { TEAM_ABBR } from './homerFeed'
import { watchHash, appHref } from '../routes'
import { mlb as mlbCopy, nightly as nightlyCopy } from '../copy/notifications'

const txt = (v) => String(v == null ? '' : v).trim()
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** The followed MLB men of one person's saved state: { ids, teams } (a muted man is not counted: a bell-off is silence). */
export function followedMlb(state) {
  const ids = new Set(); const teams = new Set()
  for (const [key, row] of Object.entries(state?.dash_follow_v1 && typeof state.dash_follow_v1 === 'object' ? state.dash_follow_v1 : {})) {
    if (!row || row.removed || row.mute || !key.startsWith('mlb:')) continue
    ids.add(String(row.id))
    if (row.team) teams.add(txt(row.team).toUpperCase())
  }
  return { ids, teams }
}

// ── THE NIGHT RECAP (MLB) ─────────────────────────────────────────────────────
/**
 * One recap event per person per game day, from the live slate. Pure.
 * @param snap         fetchLiveSlate(): { games, lines }
 * @param stateByUser  { [userId]: { dash_follow_v1, dash_alerts_v1 } }
 * @param wantsFn      (state, event) => boolean -- pushRules wants(): the person's category switch, pause and cut, in one place
 * A game day is READY for a person when every game of THEIR followed clubs on that day is over (settled) or called off (postponed): a night game still to come, or
 * still going, holds the recap. The hitters counted are the followed men with a batting line (an at-bat) that day; none, or none cleared = no event.
 */
export function mlbRecapEventsFrom(snap, stateByUser, wantsFn, now = Date.now()) {
  if (!snap || !Array.isArray(snap.games)) return []
  const lines = snap.lines && typeof snap.lines === 'object' ? snap.lines : {}
  const out = []
  const days = [...new Set(snap.games.map((g) => (ISO_DAY.test(String(g?.gameDate || '')) ? String(g.gameDate) : '')).filter(Boolean))]
  for (const [userId, state] of Object.entries(stateByUser || {})) {
    const probe = { category: 'recap', owner: userId, sport: 'mlb' }
    if (typeof wantsFn === 'function' && !wantsFn(state, probe, now)) continue
    const { ids, teams } = followedMlb(state)
    if (!ids.size) continue
    for (const day of days) {
      const games = snap.games.filter((g) => String(g?.gameDate) === day)
      const mine = games.filter((g) => teams.has(TEAM_ABBR[g.homeId]) || teams.has(TEAM_ABBR[g.awayId])
        || ['home', 'away'].some((side) => (g.lineup?.[side] || []).some((x) => ids.has(txt(x?.id)))))
      if (!mine.length) continue
      if (!mine.every((g) => g.settled === true || g.postponed === true)) continue          // a game still to come or still going holds the recap
      const pks = new Set(mine.map((g) => Number(g.pk)))
      const played = [...ids].map((id) => lines[id]).filter((l) => l && pks.has(Number(l.pk)) && Number(l.ab) >= 1)
      if (!played.length) continue
      const cleared = played.filter(clearedNight).length
      if (!cleared) continue                                                                  // NEVER a push for a night nothing cleared
      out.push({
        key: `recap:${day}:${userId}`, owner: userId, sport: 'mlb', category: 'recap', priority: 3,
        url: `/app${watchHash('mlb')}`,
        ...mlbCopy.nightRecap({ total: played.length, cleared }),
      })
    }
  }
  return out
}

// ── THE CALLED PICKS, GRADED ──────────────────────────────────────────────────
/**
 * Grade a person's CALLED picks. Pure; the graders are the public receipt's (lib/posts/receipt.js nightSettled / outcomeOf), passed in.
 * @param called  [{ sport, id, name, team?, role?, game? }]  the CALLED picks of players this person follows
 * @returns { ready, cashed, missed, voids, waiting }
 */
export function gradeCalled(called, { games = {}, results = {}, nightSettled, outcomeOf } = {}) {
  if (!called.length) return { ready: false, cashed: 0, missed: 0, voids: 0, waiting: ['no calls'] }
  const settled = nightSettled(called, games)
  if (!settled.ready) return { ready: false, cashed: 0, missed: 0, voids: 0, waiting: settled.waiting }
  let cashed = 0; let missed = 0; let voids = 0
  for (const p of called) {
    const o = outcomeOf(p, results)
    if (o === 'pending') return { ready: false, cashed: 0, missed: 0, voids: 0, waiting: [`${p.id} not graded yet`] }
    if (o === 'cashed') cashed += 1
    else if (o === 'missed') missed += 1
    else voids += 1
  }
  return { ready: true, cashed, missed, voids, waiting: [] }
}

/** One calls-graded event for one person-night, or null: nothing to grade, not ready, or none cleared (a night of misses is not pushed). */
export function callsGradedEvent(userId, day, g) {
  if (!g?.ready) return null
  const total = g.cashed + g.missed
  if (!total || !g.cashed) return null
  return {
    key: `calls:${day}:${userId}`, owner: userId, sport: 'all', category: 'callsgraded', priority: 3,
    url: appHref('mlb', 'ledger'),
    ...nightlyCopy.callsGraded({ cashed: g.cashed, total, voids: g.voids }),
  }
}

// ── THE WEEK ──────────────────────────────────────────────────────────────────
/** The Monday (ET date) a week's note belongs to: its key. */
export const mondayKey = (etDay) => etDay

/**
 * One weekly event for one person, or null when there is nothing to say. `cards` = STAR+ cards the players they follow earned last week; `cashed` / `total` = their
 * CALLED picks graded last week (from the calls-graded notes they were sent). Pure.
 */
export function weeklyEvent(userId, mondayEt, { cards = 0, cashed = 0, total = 0 } = {}) {
  if (!(cards > 0) && !(total > 0)) return null
  return {
    key: `weekly:${mondayEt}:${userId}`, owner: userId, sport: 'all', category: 'weekly', priority: 3,
    url: appHref('mlb', 'ledger'),
    ...nightlyCopy.weekly({ cards, cashed, total }),
  }
}

/** "3 of 5 cleared" -> { cashed: 3, total: 5 } (the body of a calls-graded note we sent), or null. */
export function parseCallsBody(body) {
  const m = /^(\d+) of (\d+) cleared/.exec(txt(body))
  return m ? { cashed: Number(m[1]), total: Number(m[2]) } : null
}
