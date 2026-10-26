// THE CARD'S TICK (2026-10-10). Run by the TOP TOTALS cron (/api/totals/tick, every ten minutes through the playing day): the Card
// needs no cron of its own, so it adds no invocation to the daily budget (scripts/check-crons.mjs). Per sport, in this order:
//   1. GRADE   the open rows whose games are final -> result / leg_results (once; lib/card/store.js gradeCardRows)
//   2. LOCK    each card window, from an hour before its first game, never at or after a game's start (lib/card/store.js lockCard):
//              the straights by slate size in their markets, the Two-Man (same-game on a one-game slate, never baseball), and, on a
//              full slate (6+ games), the Long Shot of the day, all in one insert
//   3. POST    the pregame card (X: the lead straight + Donovan's Two-Man), the Long Shot (the free channel; X on Tuesdays, step 6) and the members card (#members only),
//              once the card is locked and before its first game; the free result once every row of the card is graded; the Long Shot's result
//              the next day
// Then, across sports:
//   4. THE DOUBLE  one per day when two sports each have a plus-money player: frozen at the earlier of the two sports' locks (lib/card/core.js pickDouble)
//   5. THE DAY     the #members briefing (one post a day at the first lock, a follow-up for later windows) and the free X line "Today's Card"
//   6. LONGSHOT TUESDAY  on a Tuesday game day, ONE X post with each sport's long shot; the next day, one reply with how they did (lib/card/longshotTuesday.js)
// Most runs end in one cheap select: nothing open, the card already locked, the window not yet open. A sport that fails never costs
// another its turn. CARD_POSTS_PAUSE=on stops the posts only (the cards and the page are untouched).
import { easternDate } from '../data'
import { CARD_SPORTS, DOUBLE_SPORT, lockWindowOpen, lockAtOf, pickDouble, doubleRow } from './core'
import { loadWindows, loadCardInputs, loadLegResults, pairNoteOf } from './sources'
import { TRACKED_TABLE, lockedCards, lockCard, lockDouble, doubleLocked, openRows, gradeCardRows, cardRows, dayRows, recordRows, recordsFor, currentPrices, MISSING } from './store'
import { postCardX, postDonovanEntries, postDonovanResults, postCardMembers, postCardResult, postLongShot, postLongShotResult, postDoubleResult, postDay, postLongshotTuesday, postLongshotTuesdayResult, postMembersWins, postMembersGraded, postMembersLegs, postPartnerPack, DAY_KINDS, rowKeyOf } from './post'
import { partnerHooks } from '../dash/discordChannels'
import { slateLoader } from '../posts/slateLoad'
import { isTuesday, tuesdayTiming, tuesdayOff, TUESDAY_KIND } from './longshotTuesday'

const _wait = new Map()   // sport -> ms before which the windows are not read again (this warm instance)
const _wins = new Map()   // sport -> { at, windows } the last windows read (the Double and THE DAY look at them without a second read)
const _tried = new Map()  // `${sport}|${card_date}` -> ms of the last lock attempt that did not lock (not retried for 8 minutes)
const _resultDone = new Set()   // `${sport}|${card_date}` whose free result is out
const _donResultDone = new Set() // `${sport}|${card_date}` whose N-man result posts are all settled (posted, or never announced)
const _lsDone = new Set()       // `${sport}|${card_date}` whose Long Shot result is out
const _dblNext = new Map()      // game date -> ms before which the Double is not tried again
const _dblDone = new Set()      // game dates whose Double is locked (or cannot be)
const _dblResult = new Set()    // game dates whose Double result is out
const _tueDone = new Set()      // Tuesdays whose LONGSHOT TUESDAY post is settled (posted, or nothing to post)
const _tueResDone = new Set()   // Tuesdays whose result reply is settled

async function oneSport(db, sport, now) {
  const out = {}
  let have = await lockedCards(db, sport, now)
  if (have.missing) return { error: MISSING }

  // 1. GRADE
  const open = await openRows(db, sport, now)
  if (open.length) out.graded = await gradeCardRows(db, open, await loadLegResults(sport, open, now), now)
  // the tracked picks (the ones the floors kept off the Card) are graded by the same grader; a missing table is simply no rows
  const openT = await openRows(db, sport, now, TRACKED_TABLE)
  if (openT.length) out.trackedGraded = await gradeCardRows(db, openT, await loadLegResults(sport, openT, now), now, TRACKED_TABLE)

  // 2. LOCK: every window not yet locked whose hour has come and that still has a game to come
  if (now >= (_wait.get(sport) || 0)) {
    const w = await loadWindows(sport, now)
    if (!w.ok) out.lock = `no-windows: ${w.why}`
    else {
      _wins.set(sport, { at: now, windows: w.windows })
      const locked = new Set(have.rows.map((r) => String(r.card_date).slice(0, 10)))
      let next = now + 30 * 60e3
      const notes = []
      for (const win of w.windows) {
        if (locked.has(win.card_date) || win.last_start_ms <= now) continue
        if (!lockWindowOpen(win.first_start_ms, now)) { next = Math.min(next, lockAtOf(win.first_start_ms)); continue }
        const k = `${sport}|${win.card_date}`
        if (now - (_tried.get(k) || 0) < 8 * 60e3) continue
        const inputs = await loadCardInputs(db, sport, win, now, { prices: true })     // every window reads the stored prices: the floors need one on every pick (10-11)
        const res = inputs.ok ? await lockCard(db, sport, win, inputs, { now, pairNote: pairNoteOf(sport) }) : `no-candidates: ${inputs.why}`
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
    const hasLongShot = have.rows.some((r) => String(r.card_date).slice(0, 10) === day && r.product === 'long_shot')
    const lsOpen = !_lsDone.has(rk) && hasLongShot
    if (starts.some((t) => t > now) || lsOpen || !_resultDone.has(rk) || !_donResultDone.has(rk)) {
      const rows = await cardRows(db, sport, day, { now, audience: 'members' })      // the tick serves the posters in-process; each poster narrows to its own audience (lib/card/post.js)
      const ls = rows.find((r) => r.lane === 'bot' && r.product === 'long_shot') || null
      if (starts.some((t) => t > now)) {
        post.x = await postCardX(db, { sport, day, rows: rows.filter((r) => r.product !== 'long_shot'), now })
        post.donovan = await postDonovanEntries(db, { sport, day, rows: rows.filter((r) => r.product !== 'long_shot'), now })      // HIS entries (up to 3 a day and sport: a straight .. a 6-man), each its own post, oldest saved first; the Two-Man waits for / is left to the card post above when it named him
        post.members = await postCardMembers(db, { sport, day, rows: rows.filter((r) => r.product !== 'long_shot'), now })
        if (ls) post.longShot = await postLongShot(db, { sport, day, row: ls, now })
      } else if (!_resultDone.has(rk)) {
        post.result = await postCardResult(db, { sport, day, rows })
        if (/^(posted|already-posted)/.test(post.result)) _resultDone.add(rk)
      }
      if (!_donResultDone.has(rk)) {
        // HIS N-MAN RESULTS (2026-10-13): one post per graded entry, once it grades, for an entry whose pregame post went out; settled when no game of the day is still to come
        const nm = rows.filter((r) => r.lane === 'donovan' && r.product === 'n_man')
        const later = starts.some((t) => t > now)
        if (nm.some((r) => r.result != null)) {
          const res = await postDonovanResults(db, { sport, day, rows, now })
          post.donovanResults = res
          if (!later && nm.every((r) => r.result != null) && Object.values(res).every((v) => /^(posted|already-posted|dropped|no-pregame-post)/.test(v))) _donResultDone.add(rk)
        } else if (!later && !nm.length) _donResultDone.add(rk)
      }
      if (ls && ls.result != null && lsOpen) {
        const rec = (await recordsFor(db, sport, await recordRows(db, sport, { now }))).long_shot
        post.longShotResult = await postLongShotResult(db, { sport, day, row: ls, rec, now })
        if (/^(posted|already-posted)/.test(post.longShotResult)) _lsDone.add(rk)
      }
    }
    if (Object.keys(post).length) (out.post ||= {})[day] = post
  }
  return out
}

// ── 4. THE DOUBLE ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Grade the open Doubles: each leg from its own sport's box score (keys carry the sport). */
async function gradeDoubles(db, now) {
  const open = await openRows(db, DOUBLE_SPORT, now)
  if (!open.length) return 0
  const results = new Map()
  for (const sport of CARD_SPORTS) {
    const legs = open.flatMap((r) => r.legs).filter((l) => l.sport === sport)
    if (!legs.length) continue
    const pseudo = legs.map((l) => ({ legs: [l], slate_key: l.slate_key || null, start_at: l.start_at }))
    for (const [k, v] of await loadLegResults(sport, pseudo, now)) results.set(`${sport}|${k}`, v)
  }
  return gradeCardRows(db, open, results, now)
}

async function doubleStep(db, now) {
  const today = easternDate(now)
  const out = {}
  if (!_dblDone.has(today) && now >= (_dblNext.get(today) || 0)) {
    const wins = CARD_SPORTS.map((sport) => ({ sport, win: (_wins.get(sport)?.windows || []).find((w) => w.card_date === today) })).filter((x) => x.win && x.win.last_start_ms > now)
    if (wins.length < 2) out.double = 'fewer than two sports have games to come today'
    else if (now < Math.min(...wins.map((x) => lockAtOf(x.win.first_start_ms)))) out.double = 'before the first lock'
    else {
      const dl = await doubleLocked(db, today)
      if (dl.missing) return { error: MISSING }
      if (dl.locked) { _dblDone.add(today); out.double = 'already locked' } else {
        const pools = []
        for (const { sport, win } of wins) {
          const inputs = await loadCardInputs(db, sport, win, now, { prices: true })
          if (inputs.ok && inputs.prices) pools.push({ sport, games: inputs.games ?? win.games, cands: inputs.all || [], prices: inputs.prices, board: inputs.byMarket?.anytime?.board || null, lockAtMs: lockAtOf(win.first_start_ms) })
        }
        const pick = pickDouble(pools, now)
        if (!pick.legs) { _dblNext.set(today, now + 20 * 60e3); out.double = `no double yet: ${pick.why}` }
        else if (now < pick.lockAtMs) { _dblNext.set(today, pick.lockAtMs); out.double = 'waiting for the lock of the two sports' }
        else {
          const res = await lockDouble(db, doubleRow({ legs: pick.legs, lockAtMs: pick.lockAtMs, card_date: today }), now)
          out.double = res
          if (res === 'locked double') _dblDone.add(today); else _dblNext.set(today, now + 8 * 60e3)
        }
      }
    }
  }
  // the Double's own result, once graded (the ticket itself is #members only; only its RESULT is public)
  const g = await gradeDoubles(db, now)
  if (g) out.doubleGraded = g
  return out
}

// ── 5. THE DAY ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function dayStep(db, now) {
  const today = easternDate(now)
  const rows = await dayRows(db, today, { now })
  const out = {}
  const locked = rows.filter((r) => Date.parse(r.locks_at) <= now && r.product !== 'n_man' && !(r.lane === 'donovan' && r.product === 'straight'))      // his N-man is not part of THE DAY's briefing
  if (!locked.length) return out
  const { data: posted } = await db.from('homer_feed_posts').select('kind,payload').eq('day', today).in('kind', DAY_KINDS)
  const seen = new Set((posted || []).flatMap((p) => p.payload?.keys || []))
  if (locked.some((r) => !seen.has(rowKeyOf(r)))) {
    // the stored prices of anytime legs that froze none (the members text), by sport
    const prices = new Map()
    for (const sport of CARD_SPORTS) {
      const legs = locked.filter((r) => r.sport === sport && r.lane === 'bot' && !seen.has(rowKeyOf(r))).flatMap((r) => r.legs).filter((l) => !l.price)
      if (legs.length) for (const [id, p] of await currentPrices(db, sport, legs)) prices.set(`${sport}|${id}`, p)
    }
    out.day = await postDay(db, { day: today, rows: locked, posted: posted || [], prices, now })
  }
  // the free line: the lead straight of the Cards locked so far
  const bySport = {}
  for (const r of locked) if (r.lane === 'bot' && r.product === 'straight') (bySport[r.sport] ||= []).push(r)
  // RETIRED 2026-10-23 (Donovan, volume review): "Today's Card" named the same player as that day's product pick post, every day (McDavid,
  // Burden III, MacKinnon, Matthews, Kaprizov). postToday stays for its tests; nothing calls it.
  void bySport
  return out
}

/** Today's and yesterday's #members wins, and yesterday's morning grade. */
async function membersStep(db, now) {
  const out = {}
  for (const day of [easternDate(now - 864e5), easternDate(now)]) {
    const rows = await dayRows(db, day, { now })
    if (!rows.length) continue
    // the live check first (a leg the moment it lands), then the graded wins (which skip a one-leg pick the live check already posted)
    const legs = await postMembersLegs(db, { day, rows, now }).catch((e) => `error: ${e?.message || e}`)
    const err = (e) => `error: ${e?.message || e}`
    out[day] = { legs, wins: await postMembersWins(db, { day, rows, now }).catch(err), graded: await postMembersGraded(db, { day, rows, now }).catch(err) }
  }
  return out
}

/** The Double's free result, for the last two game days (graded rows only). */
async function doubleResults(db, now) {
  const out = {}
  const since = easternDate(now - 2 * 864e5)
  const rows = (await recordRows(db, DOUBLE_SPORT, { now, limit: 12 })).filter((r) => r.lane === 'bot' && r.product === 'double' && r.result != null && String(r.card_date).slice(0, 10) >= since)
  for (const r of rows) {
    const d = String(r.card_date).slice(0, 10)
    if (_dblResult.has(d)) continue
    out[d] = await postDoubleResult(db, { day: d, row: r })
    if (/^(posted|already-posted)/.test(out[d])) _dblResult.add(d)
  }
  return out
}

// ── 6. LONGSHOT TUESDAY ────────────────────────────────────────────────────────────────────────────────────────────────────
/** The Tuesday post (when every full slate has locked, or just before the first leg) and, the next days, its result reply. Cheap on other days: no read. */
async function tuesdayStep(db, now) {
  if (tuesdayOff()) return {}
  const out = {}
  const today = easternDate(now)
  if (isTuesday(today) && !_tueDone.has(today)) {
    const rows = await dayRows(db, today, { now })
    const windows = Object.fromEntries([..._wins].map(([sport, w]) => [sport, w.windows || []]))
    const t = tuesdayTiming({ day: today, rows, windows, now })
    out.post = t.go ? await postLongshotTuesday(db, { day: today, legs: t.legs, now }) : t.reason
    if (/^(posted|already-posted|dropped|claim-failed)/.test(out.post)) _tueDone.add(today)      // claim-failed = the kinds SQL (202610202000) not run: try once per warm instance, not every tick (each try draws the front cards)
  }
  for (const back of [1, 2]) {
    const d = easternDate(now - back * 864e5)
    if (!isTuesday(d) || _tueResDone.has(d)) continue
    const { data: post } = await db.from('homer_feed_posts').select('x_post_id,payload').match({ day: d, kind: TUESDAY_KIND }).maybeSingle()
    if (!post?.x_post_id) { _tueResDone.add(d); out.result = 'no-tuesday-post'; continue }
    out.result = await postLongshotTuesdayResult(db, { day: d, post, rows: await dayRows(db, d, { now }), now })
    if (/^(posted|already-posted)/.test(out.result)) _tueResDone.add(d)
  }
  return out
}

/** The whole Card tick for every sport the Card runs in, then the Double and THE DAY: { nhl: {...}, nfl: {...}, mlb: {...}, double: {...}, day: {...} }. Never throws; a step that fails says so. */
export async function cardTick(db, now = Date.now()) {
  const out = {}
  const t0 = Date.now()
  for (const sport of CARD_SPORTS) {
    try { out[sport] = await oneSport(db, sport, now) } catch (e) { console.error(`[card] ${sport} failed: ${e?.message || e}`); out[sport] = { error: String(e?.message || e) } }
  }
  const budgetLeft = () => Date.now() - t0 < 40e3          // the cron is allowed 60 s: the cross-sport steps wait for the next tick rather than risk it
  if (budgetLeft()) { try { out.double = await doubleStep(db, now) } catch (e) { console.error(`[card] double failed: ${e?.message || e}`); out.double = { error: String(e?.message || e) } } }
  if (budgetLeft()) {
    try { out.day = await dayStep(db, now) } catch (e) { console.error(`[card] day failed: ${e?.message || e}`); out.day = { error: String(e?.message || e) } }
    try { const r = await doubleResults(db, now); if (Object.keys(r).length) (out.double ||= {}).results = r } catch (e) { console.error(`[card] double result failed: ${e?.message || e}`) }
  }
  // THE PARTNER FEED (lib/posts/partnerPack.js): other servers' free posts, once a day before the first game; nothing read while no partner is set
  if (budgetLeft() && partnerHooks()) {
    try {
      const today = easternDate(now)
      // today's expected Card locks, from the windows this instance read (a sport not read yet adds none: the 'starts soon' rule still holds)
      const lockTimes = CARD_SPORTS.flatMap((s) => (_wins.get(s)?.windows || []).filter((w) => w.card_date === today).map((w) => lockAtOf(w.first_start_ms)))
      out.partner = await postPartnerPack(db, { day: today, rows: await dayRows(db, today, { now }), load: slateLoader({ day: today }), lockTimes, now })
    } catch (e) { console.error(`[card] partner feed failed: ${e?.message || e}`); out.partner = { error: String(e?.message || e) } }
  }
  // #MEMBERS: the wins as they grade, the morning grade of yesterday (lib/card/wins.js)
  if (budgetLeft()) { try { out.members = await membersStep(db, now) } catch (e) { console.error(`[card] members wins failed: ${e?.message || e}`); out.members = { error: String(e?.message || e) } } }
  if (budgetLeft()) { try { const r = await tuesdayStep(db, now); if (Object.keys(r).length) out.tuesday = r } catch (e) { console.error(`[card] longshot tuesday failed: ${e?.message || e}`); out.tuesday = { error: String(e?.message || e) } } }
  return out
}
