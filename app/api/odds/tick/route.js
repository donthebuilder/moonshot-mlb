// ODDS CAPTURE — Vercel cron every ten minutes through the game windows
// (vercel.json), plus manual fire with any of the cron secrets. Step 1 of
// .claude-notes/BATCH-ODDS-PLAN.md: capture only. No page reads odds_snap yet.
//
// Per ET day and league (NFL, MLB): ONE list pull -- the day's games, stored
// as the event map (odds_events) and as snap 'list'. Then per game, two more
// reads by eventIDs (the cheapest call): 'lock' at 50-70 min before start and
// 'close' at 5-15 min before. About three objects a game.
//
// NOTHING PREGAME AT OR AFTER THE START. The clock is re-read at every write
// and a game the feed calls started is skipped. Rows are insert-only.
//
// BUDGET (2,500 objects a month, read fresh each tick -- it's free):
//   >= 2,200 used: no 'close' snapshots (list + lock only), logged.
//   >= 2,450 used: nothing is fetched, logged loudly.
// The plan said "skip the list pulls" at 2,200, but the list is the event map
// a lock needs; dropping the close keeps the lock, which is the priced pick.
//
// Manual: ?date=YYYY-MM-DD lists that ET day; ?event=<id>&snap=lock|close
// forces one snapshot of one pregame game; ?dry=1 writes nothing (it still
// spends objects -- the feed is what costs, not the write).
import { easternDate, easternToday, nextDay } from '../../../../lib/data'
import { validDate } from '../../../../lib/nhl/api'
import { whichSeason } from '../../../../lib/nhl/whichSeason'
import { cronAuthorized, adminClient } from '../../../../lib/supabase/admin'
import { hasKey, monthUsage, eventsBetween, eventsById } from '../../../../lib/odds/sgo'
import { playerJoin } from '../../../../lib/odds/playerJoin'
import { LEAGUES, MARKETS, snapRows, startsAt, gameDate } from '../../../../lib/odds/snap'
import { linesRows } from '../../../../lib/odds/lines'
import { freezeDashLines } from '../../../../lib/dashLock'
import { gradeDashLines } from '../../../../lib/dashGrade'
import { monthPlan } from '../../../../lib/odds/budget'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SOFT_CAP = 2200
const HARD_CAP = 2450
const MIN = 60 * 1000
const WINDOWS = { lock: [50, 70], close: [5, 15] } // minutes before start
// NHL (odds step 2): ONE snapshot, taken where LAMP's own lock lands -- the
// last write before puck drop (lamp_goal_log.locked_at, every 10 min up to
// the drop) -- so the price sits beside the call it prices. No close.
const SPORT_WINDOWS = { nhl: { lock: [5, 15] } }
const windowsFor = (sport) => SPORT_WINDOWS[sport] || WINDOWS

// The UTC instant an ET day begins (EDT or EST, whichever that day is on).
function etMidnight(ymd) {
  for (const h of [4, 5]) {
    const t = Date.parse(`${ymd}T0${h}:00:00Z`)
    if (easternDate(t) === ymd && easternDate(t - 1) !== ymd) return t
  }
  return Date.parse(`${ymd}T04:00:00Z`)
}

async function insertRows(db, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('odds_snap').upsert(rows.slice(i, i + 500), { onConflict: 'event_id,odd_id,book,snap', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (!hasKey()) return Response.json({ reason: 'no-key' }, { headers: { 'Cache-Control': 'no-store' } })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const t0 = Date.now()
  const q = new URL(request.url).searchParams
  const dry = q.get('dry') === '1'
  const date = validDate(q.get('date')) ? q.get('date') : easternToday()
  const out = { date, dry, usage: null, listed: [], snaps: [], skipped: [] }

  let used
  try { const u = await monthUsage(); used = u.used; out.usage = { before: u.used, max: u.max } } catch (e) {
    console.error(`[odds tick] usage read failed: ${e?.message} -- fetching nothing`)
    return Response.json({ ...out, reason: 'usage-unreadable' }, { status: 502 })
  }
  if (used >= HARD_CAP) {
    console.error(`[odds tick] !!! ODDS BUDGET STOP: ${used} objects used this month (cap ${HARD_CAP}). Nothing fetched.`)
    return Response.json({ ...out, reason: 'budget-stop' }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const joins = {}
  const joinFor = async (league) => {
    if (!joins[league]) joins[league] = await playerJoin(league).catch((e) => { console.error(`[odds tick] ${league} roster: ${e?.message} -- rows stored unmatched`); return () => null })
    return joins[league]
  }

  // ── LIST: once per league per ET day ─────────────────────────────────────
  // NHL waits for the regular season (odds step 2 says "on/after 09-29"):
  // LAMP's own season read says when -- preseason goal props are not the
  // record and would spend objects. It switches itself on, and next year too.
  const nhlLive = await whichSeason().then((sn) => !sn.stale).catch(() => false)
  for (const league of LEAGUES) {
    const sport = MARKETS[league].sport
    if (league === 'NHL' && !nhlLive) continue
    if (!dry) {
      const have = await db.from('odds_events').select('event_id').eq('sport', sport).eq('game_date', date).limit(1)
      if (have.error) { out.skipped.push({ league, why: `event map: ${have.error.message}` }); continue }
      if (have.data?.length) continue
    }
    let events
    try { events = await eventsBetween(league, new Date(etMidnight(date)).toISOString(), new Date(etMidnight(nextDay(date))).toISOString(), HARD_CAP - used) } catch (e) {
      out.skipped.push({ league, why: `list: ${e?.message}` }); continue
    }
    used += events.length
    const match = await joinFor(league)
    const takenAt = new Date().toISOString()
    const rows = []
    const lineRows = []
    let players = 0; let matched = 0
    for (const ev of events) {
      if (!(Date.now() < Date.parse(startsAt(ev))) || ev.status?.started) continue // already under way: no pregame row
      const r = snapRows(ev, 'list', takenAt, match)
      rows.push(...r.rows); players += r.players; matched += r.matched
      // The morning read of every market we score (lib/odds/lines.js), so the
      // site has hits / total bases / yards prices before each game's lock.
      lineRows.push(...linesRows(ev, 'list', takenAt, match).rows)
    }
    if (!dry) {
      const map = events.filter((ev) => startsAt(ev)).map((ev) => ({ event_id: ev.eventID, sport, game_date: gameDate(ev), starts_at: startsAt(ev), away: ev.teams?.away?.names?.short || null, home: ev.teams?.home?.names?.short || null, listed_at: takenAt }))
      // THE DAY'S "LISTED" MARKER (measured 09-26): a list that returns NO
      // games still costs one object, and without a row for the day the next
      // tick asked again -- every ten minutes, ~3,000 objects a month on NFL's
      // empty days alone. One marker row per league per day; its starts_at is
      // the day's own midnight, already past, so it is never a due game.
      map.push({ event_id: `listed:${sport}:${date}`, sport, game_date: date, starts_at: new Date(etMidnight(date)).toISOString(), away: null, home: null, listed_at: takenAt })
      const m = map.length ? await db.from('odds_events').upsert(map, { onConflict: 'event_id', ignoreDuplicates: true }) : { error: null }
      if (m.error) { out.skipped.push({ league, why: `event map write: ${m.error.message}` }); continue }
      try { await insertRows(db, rows) } catch (e) { out.skipped.push({ league, why: `list rows: ${e?.message}` }); continue }
      if (lineRows.length) {
        const w = await db.from('odds_lines').upsert(lineRows, { onConflict: 'event_id,odd_id,snap', ignoreDuplicates: true })
        if (w.error) console.error(`[odds tick] list lines ${league}: ${w.error.message}`)
      }
    }
    out.listed.push({ league, games: events.length, rows: rows.length, lines: lineRows.length, players, matched })
    console.log(`[odds tick] list ${league} ${date}: ${events.length} games, ${rows.length} rows, join ${matched}/${players}`)
  }

  // ── LOCK / CLOSE: the games inside a window, one eventIDs read ─────────
  const now = Date.now()
  const due = new Map() // event_id -> Set of snaps
  // THE MONTH PLANNER (lib/odds/budget.js): CLOSE stays off all month when the month can't afford it
  let plan = null
  try { plan = await monthPlan(date.slice(0, 7), LEAGUES); out.plan = { month: plan.month, games: plan.games, projected: plan.projected, closeOff: plan.closeOff, why: plan.why } } catch (e) { out.plan = { error: e?.message } }
  const forced = q.get('event')
  if (forced && WINDOWS[q.get('snap')]) due.set(forced, new Set([q.get('snap')]))
  else {
    const soon = await db.from('odds_events').select('event_id, sport, starts_at, lock_at, close_at').gt('starts_at', new Date(now + WINDOWS.close[0] * MIN).toISOString()).lte('starts_at', new Date(now + WINDOWS.lock[1] * MIN).toISOString())
    if (soon.error) out.skipped.push({ why: `due: ${soon.error.message}` })
    for (const g of soon.data || []) {
      if (String(g.event_id).startsWith('listed:')) continue
      const mins = (Date.parse(g.starts_at) - now) / MIN
      const W = windowsFor(g.sport)
      const want = new Set()
      if (!g.lock_at && mins >= W.lock[0] && mins <= W.lock[1]) want.add('lock')
      if (W.close && !g.close_at && mins >= W.close[0] && mins <= W.close[1]) {
        if (plan?.closeOff) out.skipped.push({ event: g.event_id, why: `close off this month: ${plan.why}` })
        else if (used < SOFT_CAP) want.add('close')
        else out.skipped.push({ event: g.event_id, why: `close skipped: ${used} objects used (soft cap ${SOFT_CAP})` })
      }
      if (want.size) due.set(g.event_id, want)
    }
    if (used >= SOFT_CAP) console.error(`[odds tick] odds budget soft cap: ${used} objects used this month -- close snapshots off`)
  }
  if (due.size && used + due.size <= HARD_CAP) {
    let events = []
    try { events = await eventsById([...due.keys()]) } catch (e) { out.skipped.push({ why: `by id: ${e?.message}` }) }
    used += events.length
    for (const ev of events) {
      const match = await joinFor(ev.leagueID)
      for (const snap of due.get(ev.eventID) || []) {
        const takenAt = new Date().toISOString()
        if (!(Date.parse(takenAt) < Date.parse(startsAt(ev))) || ev.status?.started) { out.skipped.push({ event: ev.eventID, snap, why: 'started' }); continue }
        const r = snapRows(ev, snap, takenAt, match)
        if (!dry) {
          try { await insertRows(db, r.rows) } catch (e) { out.skipped.push({ event: ev.eventID, snap, why: e?.message }); continue }
          const col = snap === 'lock' ? 'lock_at' : 'close_at'
          await db.from('odds_events').update({ [col]: takenAt, starts_at: startsAt(ev) }).eq('event_id', ev.eventID)
        }
        // EVERY MARKET WE SCORE, AT LOCK (lib/odds/lines.js): same object, no
        // extra cost. Its own failure, logged; never the snapshot's.
        let lines = null, dash = null
        if (snap === 'lock') {
          const L = linesRows(ev, snap, takenAt, match)
          lines = L.rows.length
          if (!dry && L.rows.length) {
            const w = await db.from('odds_lines').upsert(L.rows, { onConflict: 'event_id,odd_id,snap', ignoreDuplicates: true })
            if (w.error) { console.error(`[odds tick] lines ${ev.eventID}: ${w.error.message}`); lines = `error: ${w.error.message}` }
            // THE DASH LINE (lib/dashLock.js): ours, frozen beside the book's at this same instant
            else { try { dash = await freezeDashLines(db, ev, L.rows, takenAt) } catch (e) { dash = `error: ${e?.message}` } }
          }
        }
        out.snaps.push({ event: ev.eventID, league: ev.leagueID, snap, rows: r.rows.length, lines, dash, players: r.players, matched: r.matched, minutesToStart: Math.round((Date.parse(startsAt(ev)) - Date.parse(takenAt)) / MIN) })
      }
    }
  } else if (due.size) out.skipped.push({ why: `due ${due.size} games but ${used} objects used (cap ${HARD_CAP})` })

  // THE DASH LINE'S GRADE (lib/dashGrade.js): once a day, on the first run (11:00 UTC)
  if (!dry && new Date(t0).getUTCHours() === 11 && new Date(t0).getUTCMinutes() < 10) {
    try { out.dashGraded = await gradeDashLines(db, easternToday()) } catch (e) { out.dashGraded = `error: ${e?.message}` }
  }
  out.usage.spentThisTick = used - out.usage.before
  out.ms = Date.now() - t0
  console.log(`[odds tick] ${date} listed ${out.listed.length} snaps ${out.snaps.length} skipped ${out.skipped.length} objects +${out.usage.spentThisTick} (month ${used}) in ${out.ms}ms`)
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
