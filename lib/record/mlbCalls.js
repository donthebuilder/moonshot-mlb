// MOONSHOT'S HOME-RUN CALLS, FROM THE ONE LOCKED RECORD (2026-10-10, ledger audit finding 1).
// /api/record/calls listed MLB's TOP / HR calls from the post-game graded files since Sep 1, which include
// nights whose board was stamped after first pitch -- a second population beside the lock-enforced one the
// front door, /called and the Record tab read. A home-run call is now a TOP or HR call from
// lib/calibration/readMlbCalibration (stamped before first pitch, graded, regular season), a hitter counted
// ONCE a night however many of the two lanes named him (one bet, one result), with the lock price joined on.
import { readCalibrationCalls } from '../calibration/readMlbCalibration'
import { readLockPrices, priceKey } from '../odds/priceAtLock'
import { HR_CALL_ROLES } from '../callStatus'

/** Pure: per-role call lists (callsOf rows) -> one row per hitter-night, roles joined, newest first. */
export function mergeHrCalls(listsByRole) {
  const by = new Map()
  for (const [role, calls] of Object.entries(listsByRole)) {
    for (const c of calls || []) {
      const k = `${c.date}|${c.pid}`
      const row = by.get(k) || { game_date: c.date, player_id: String(c.pid), name: c.name, team: c.team, roles: [], hit: true }
      row.roles.push(role)
      row.hit = row.hit && Boolean(c.hit)   // both lanes are 1+ HR; they cannot disagree, but never let one hide a miss
      by.set(k, row)
    }
  }
  return [...by.values()].map((r) => ({
    sport: 'mlb', game_date: r.game_date, player_id: r.player_id, name: r.name, team: r.team,
    role: r.roles.join('/'), hrCall: true, result: r.hit ? 'hit' : 'miss',
  }))
}

/** The locked home-run calls with their lock price (or null). `through`: the reader's day key. */
export async function lockedHrCalls(db, through) {
  const lists = Object.fromEntries(await Promise.all(HR_CALL_ROLES.map(async (r) => [r, await readCalibrationCalls(through, r, 'regular')])))
  const picks = mergeHrCalls(lists)
  if (!picks.length) return { picks, error: null }
  const dates = picks.map((p) => p.game_date).sort()
  const lock = await readLockPrices(db, { sport: 'mlb', since: dates[0], until: dates.at(-1) })
  if (lock.error) return { picks: [], error: lock.error }
  for (const p of picks) p.price = lock.prices.get(priceKey('mlb', p.game_date, p.player_id)) || null
  return { picks, error: null }
}
