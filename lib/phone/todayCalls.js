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

export async function mlbTodayCalls() {
  try {
    const res = await fetch(dataUrl('current/pick_lock.json'), { next: { revalidate: 120 } })
    if (!res.ok) return null
    const out = callsFromLock(await res.json())
    return out.items.length ? out : null
  } catch { return null }
}
