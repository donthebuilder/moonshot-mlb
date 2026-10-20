// A SETTLED NIGHT IS READ ONCE (2026-10-20, Supabase egress). A model record's
// rows for a night stop changing once the night is graded and past its regrade
// window (LAMP rechecks a box for 12 h after the grade, lib/nhl/regrade.js;
// BUCKETS doesn't regrade). The whole-season readers (calibration, the ladder,
// the record, /api/record/calls) re-read every graded row on every rebuild --
// ~5,400 LAMP rows (5 pages, ~120 KB on the wire) on 10-20, growing every night
// to ~80k rows by April. A night SETTLED_LAG_DAYS or more behind the ET day
// now sits in Next's Data Cache under that night and the reader's filters (one
// item each, a day long, the lockRows pattern in lib/odds/priceAtLock.js);
// only the newest nights are read fresh. Same rows, same order.
// Outside a Next request (a script) it reads the whole range directly.
import { unstable_cache } from 'next/cache'
import { readPaged } from './paged'

export const SETTLED_LAG_DAYS = 3
const DAY = 86400

const etToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const shift = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const nightsDesc = (from, to) => { const out = []; for (let d = to; d >= from; d = shift(d, -1)) out.push(d); return out }
const noCache = (e) => /incrementalCache|static generation store|outside a request/i.test(String(e?.message))

/** The table's first game_date, cached a day (null when the table is empty). */
const firstNight = (db, table) => unstable_cache(async () => {
  const { data, error } = await db.from(table).select('game_date').order('game_date', { ascending: true }).limit(1)
  if (error) throw new Error(error.message)
  return data?.[0]?.game_date ?? null
}, ['settled-first-night-v1', table], { revalidate: DAY })()

/**
 * readPaged over [since, until] by game_date, newest night first, with the
 * settled nights cached. `build(from, to)` returns a fresh query with every
 * filter applied and those game_date bounds (either may be null), ordered
 * game_date desc then a total order inside the night. `key` names every filter
 * `build` applies -- two different reads must never share a key.
 * @returns {{ data: object[], error: object|null }}
 */
export async function readPagedSettled(db, { table, key, since = null, until = null, build }) {
  try {
    const cut = shift(etToday(), -SETTLED_LAG_DAYS)
    const lo = since || await firstNight(db, table)
    const hi = until && until < cut ? until : cut
    if (!lo || lo > hi) return readPaged(() => build(since, until))
    const nights = await Promise.all(nightsDesc(lo, hi).map((d) => unstable_cache(async () => {
      const r = await readPaged(() => build(d, d))
      if (r.error) throw new Error(r.error.message)
      return r.data
    }, ['settled-night-v1', table, key, d], { revalidate: DAY })()))
    const freshFrom = shift(hi, 1)
    const rest = !until || until >= freshFrom ? await readPaged(() => build(freshFrom, until)) : { data: [], error: null }
    if (rest.error) return rest
    return { data: [...rest.data, ...nights.flat()], error: null }
  } catch (e) {
    if (!noCache(e)) return { data: [], error: e }
    return readPaged(() => build(since, until))
  }
}
