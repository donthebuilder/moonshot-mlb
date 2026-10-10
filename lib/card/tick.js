// THE CARD'S TICK (2026-10-10). Run by the TOP TOTALS cron (/api/totals/tick, every ten minutes through the playing day): the Card
// needs no cron of its own, so it adds no invocation to the daily budget (scripts/check-crons.mjs). Per sport, in this order:
//   1. GRADE   the open rows whose games are final -> result / leg_results (once; lib/card/store.js gradeCardRows)
//   2. LOCK    each card window, from an hour before its first game, never at or after a game's start (lib/card/store.js lockCard)
//   3. POST    the pregame card (X: the #1 straight + Donovan's Two-Man) and the members card (#members only), once the card is locked
//              and before its first game; the free result once every row of the card is graded
// Most runs end in one cheap select: nothing open, the card already locked, the window not yet open. A sport that fails never costs
// another its turn. CARD_POSTS_PAUSE=on stops the posts only (the cards and the page are untouched).
import { easternDate } from '../data'
import { CARD_SPORTS, lockWindowOpen, lockAtOf } from './core'
import { loadWindows, loadCandidates, loadLegResults, pairNoteOf } from './sources'
import { lockedCards, lockCard, openRows, gradeCardRows, cardRows, MISSING } from './store'
import { postCardX, postCardMembers, postCardResult } from './post'

const _wait = new Map()    // sport -> ms before which the windows are not read again (this warm instance)
const _tried = new Map()   // `${sport}|${card_date}` -> ms of the last lock attempt that did not lock (not retried for 8 minutes)
const _resultDone = new Set()   // `${sport}|${card_date}` whose free result is out

async function oneSport(db, sport, now) {
  const out = {}
  let have = await lockedCards(db, sport, now)
  if (have.missing) return { error: MISSING }

  // 1. GRADE
  const open = await openRows(db, sport, now)
  if (open.length) out.graded = await gradeCardRows(db, open, await loadLegResults(sport, open, now), now)

  // 2. LOCK: every window not yet locked whose hour has come and that still has a game to come
  if (now >= (_wait.get(sport) || 0)) {
    const w = await loadWindows(sport, now)
    if (!w.ok) out.lock = `no-windows: ${w.why}`
    else {
      const locked = new Set(have.rows.map((r) => String(r.card_date).slice(0, 10)))
      let next = now + 30 * 60e3
      const notes = []
      for (const win of w.windows) {
        if (locked.has(win.card_date) || win.last_start_ms <= now) continue
        if (!lockWindowOpen(win.first_start_ms, now)) { next = Math.min(next, lockAtOf(win.first_start_ms)); continue }
        const k = `${sport}|${win.card_date}`
        if (now - (_tried.get(k) || 0) < 8 * 60e3) continue
        const c = await loadCandidates(sport, win, now)
        const res = c.ok ? await lockCard(db, sport, win, c.cands, { now, pairNote: pairNoteOf(sport) }) : `no-candidates: ${c.why}`
        if (!/^locked/.test(res)) _tried.set(k, now)
        notes.push(`${win.card_date}: ${res}`)
      }
      _wait.set(sport, next)
      if (notes.length) out.lock = notes.join(' | ')
      if (notes.some((n) => /: locked/.test(n))) have = await lockedCards(db, sport, now)
    }
  }

  // 3. POST: the cards of the last two game days
  const since = easternDate(now - 2 * 864e5)
  const dates = [...new Set(have.rows.map((r) => String(r.card_date).slice(0, 10)))].filter((d) => d >= since).sort()
  for (const day of dates) {
    const starts = have.rows.filter((r) => String(r.card_date).slice(0, 10) === day).map((r) => Date.parse(r.start_at))
    const rk = `${sport}|${day}`
    const post = {}
    if (starts.some((t) => t > now)) {
      const rows = await cardRows(db, sport, day, { now })
      post.x = await postCardX(db, { sport, day, rows, now })
      post.members = await postCardMembers(db, { sport, day, rows, now })
    } else if (!_resultDone.has(rk)) {
      const rows = await cardRows(db, sport, day, { now })
      post.result = await postCardResult(db, { sport, day, rows })
      if (/^(posted|already-posted)/.test(post.result)) _resultDone.add(rk)
    }
    if (Object.keys(post).length) (out.post ||= {})[day] = post
  }
  return out
}


/** The whole Card tick for every sport the Card runs in: { nhl: {...}, nfl: {...}, mlb: {...} }. Never throws; a sport that fails says so. */
export async function cardTick(db, now = Date.now()) {
  const out = {}
  for (const sport of CARD_SPORTS) {
    try { out[sport] = await oneSport(db, sport, now) } catch (e) { console.error(`[card] ${sport} failed: ${e?.message || e}`); out[sport] = { error: String(e?.message || e) } }
  }
  return out
}
