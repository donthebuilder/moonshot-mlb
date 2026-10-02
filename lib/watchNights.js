'use client'

// ⭐ WHO WAS ON YOUR LIST, NIGHT BY NIGHT (2026-09-29).
//
// Donovan: "its supposed to be if you have them saved that night and they
// play, to track what they did for you. are they coin respecters or not. are
// they profitable for you."
//
// WHY THE OLD RECORD (lib/watchLedger.js) NEVER FILLED. The watchlist is a
// per-night list by design: an entry is the player PLUS tonight's game, and
// Dashboard prunes it the moment that game leaves the slate. The ledger could
// only grade the names still on the list while the page was open, so a night
// was recorded only if somebody had the Watchlist tab open after the games
// ended and before the slate rolled over -- and only for hitters the bot had
// picked, because it graded against the bot's graded file. Most nights never
// made it.
//
// THE FIX IS AT THE SOURCE: remember the save itself. Starring a player
// writes { his id: { pk, name, team, at } } under his GAME's own date, and the
// nightly prune never touches this store. Grading happens later, from the
// league's game logs (lib/watchGrade.js), so a night counts whether or not the
// page was open that night.
//
// Un-starring before his game starts takes him back off the night (he wasn't
// your guy); after first pitch the night keeps him -- the result is already
// on the line. The removal is a tombstone (`off`), not a delete, because the
// account sync (lib/dash/sync.js mergeDateMap) unions nights across devices
// and a deleted entry would come straight back from the other device.
//
// Shape: { 'YYYY-MM-DD': { '<sport>:<id>': { pk, name, team, at, off? } } }
// One store for every sport, the sport in the key, so one merge rule and one
// sync registration cover TUDDY and LAMP too.

import { registerSyncedKey } from './dash/sync'

const KEY = 'watch_nights_v1'
export const WATCH_NIGHTS_EVENT = 'watch-nights-change'
registerSyncedKey(KEY, { strategy: 'mergeDateMap', event: WATCH_NIGHTS_EVENT, dateMap: true })

// A season and a bit of nights. One entry is ~60 bytes; a 20-name list over
// 200 nights is ~240 KB, which is past what the account sync takes in one
// value (it drops whole nights oldest-first) but fine on the device.
const CAP_NIGHTS = 400

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}

const write = (all) => {
  try {
    const keys = Object.keys(all).sort()
    const kept = {}
    keys.slice(-CAP_NIGHTS).forEach((k) => { kept[k] = all[k] })
    localStorage.setItem(KEY, JSON.stringify(kept))
    window.dispatchEvent(new Event(WATCH_NIGHTS_EVENT))
  } catch { /* private mode, quota -- a nicety, never a blocker */ }
}

const entryKey = (sport, id) => `${sport}:${id}`

/**
 * He was saved for this night. `date` is his GAME's date (never the wall
 * clock); `pk` his game, so the grader reads that game and not a doubleheader's
 * other half (TUDDY: 'season:week'). `mk`, when given, is the markets he had a
 * score in that night -- the bars he is graded on (a receiver is not graded on
 * rush attempts). Idempotent: re-saving keeps the first `at`.
 */
export function stampSave({ sport, id, date, pk = null, name = '', team = '', mk = null }) {
  if (!sport || !id || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return
  const all = read()
  const night = { ...(all[date] || {}) }
  const k = entryKey(sport, id)
  const prev = night[k]
  if (prev && !prev.off) return
  night[k] = { pk: pk == null ? null : String(pk), name, team, at: prev?.at || Date.now(), ...(Array.isArray(mk) && mk.length ? { mk } : {}) }
  all[date] = night
  write(all)
}

/**
 * He came off the list. Before his game starts that means he was never your
 * guy that night; once it has started the night keeps him.
 */
export function unstampSave({ sport, id, date, startMs = null }) {
  if (!sport || !id || !date) return
  if (Number.isFinite(startMs) && Date.now() >= startMs) return
  const all = read()
  const night = all[date]
  const k = entryKey(sport, id)
  if (!night?.[k] || night[k].off) return
  all[date] = { ...night, [k]: { ...night[k], off: 1, at: Date.now() } }
  write(all)
}

/**
 * One player's stamped nights, oldest first: [{ date, at, pk }] (tombstoned
 * nights left out). `at` is when that night's save was first written -- LAMP
 * uses it to tell this star's night from an earlier star's (2026-10-01).
 */
export function nightsFor(sport, id) {
  const all = read()
  const k = entryKey(sport, String(id))
  return Object.keys(all).sort()
    .map((date) => ({ date, row: all[date]?.[k] }))
    .filter((x) => x.row && !x.row.off)
    .map((x) => ({ date: x.date, at: Number(x.row.at) || 0, pk: x.row.pk ?? null }))
}

/**
 * Every night with the players saved on it for one sport, oldest first:
 * [{ date, saves: [{ id, pk, name, team }] }]. Tombstoned entries are left out.
 */
export function savedNights(sport) {
  const all = read()
  const pre = `${sport}:`
  return Object.keys(all).sort().map((date) => ({
    date,
    saves: Object.entries(all[date] || {})
      .filter(([k, v]) => k.startsWith(pre) && v && !v.off)
      .map(([k, v]) => ({ id: k.slice(pre.length), pk: v.pk ?? null, name: v.name || '', team: v.team || '', mk: Array.isArray(v.mk) ? v.mk : null })),
  })).filter((n) => n.saves.length)
}

/**
 * ONE-TIME SEED from the old device record (watch_ledger_v1). Its rows carry a
 * per-player mask keyed by MLB id for every night it did record, so those
 * nights are real "he was on your list" facts. They come over with no game id;
 * the grader then reads the player's game on that date. Never overwrites a
 * night this store already holds for that player.
 */
export function seedFromOldLedger() {
  try {
    if (localStorage.getItem(`${KEY}_seeded`)) return 0
    const old = JSON.parse(localStorage.getItem('watch_ledger_v1') || '{}')
    const all = read()
    let added = 0
    Object.entries(old || {}).forEach(([date, row]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !row?.p) return
      const night = { ...(all[date] || {}) }
      Object.keys(row.p).forEach((pid) => {
        const k = entryKey('mlb', pid)
        if (night[k]) return
        night[k] = { pk: null, name: '', team: '', at: 0 }
        added += 1
      })
      all[date] = night
    })
    if (added) write(all)
    localStorage.setItem(`${KEY}_seeded`, '1')
    return added
  } catch { return 0 }
}
