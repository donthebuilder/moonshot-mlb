// THE MOMENT EVENTS: the real, stored things that just happened, ready for lib/posts/momentPost.js (server only; every query is a select, nothing is written).
//   momentEvents(db, { source, now })  -> [{ moment, sport, row, ev, who, gameId, n, day, at, tier, status, goals }]
//   source 'nhl' | 'mlb' | 'nfl'   the sport's LIVE feed (lamp_goal_feed, homer_feed, nfl_td_feed): rows seen in the last FRESH window
//   source 'daily'                 the day-keyed events (the 100-yard games of the published logs, the long shots that cashed): the card tick's pass
// An event is the moment's own rule (lib/cards/moments.js evaluate: the exact real-data trigger) at the RUNG that just became true:
//   n = g<goal_n> (a goal / a season milestone: ONE event, the rarer card wins) | ht<goals> | pt<tier's first count> | hr<count> | td<count> | yd | ls
// Cheap by construction: step 1 asks only "is any row of this sport young?" (one light select); the full rows are read only for the games that have one,
// and a sport with nothing young is not asked again for IDLE_MS on this instance (the ticks run every minute). The same rows feed scripts/moment-posts-dryrun.mjs.
import { MOMENTS, evaluate, tierRank, nhlGameLines, mlbGameLines, nflGameLines } from '../cards/moments'
import { subjectOf, idOf, candidates } from '../cards/specialData'
import { FRESH_MS, FRESH_DAYS, SETTLE_MS } from '../cards/momentPosting'

const GOAL_COLS = 'game_id,player_id,goal_n,day,season,game_type,period,period_type,time_in_period,strength,empty_net,team,opp,name,season_goals,assists,score_after,status,rank_in_game,overturned_at,confirmed_at'
const MLB_COLS = 'day,player_id,hr_n,name,team,opponent,game_pk,inning,home,role,on_board,board_rank,stats,seen_at'
const NFL_COLS = 'day,game_id,td_n,team,opponent,quarter,clock,kind,kind_word,yards,passer_name,scorer_name,gsis_id,on_bot,td_board,away_score,home_score,seen_at'
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data || [] }
const iso = (ms) => new Date(ms).toISOString()
const ms = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null }

const _idle = new Map()   // source -> ms until which "nothing young" is trusted
export const IDLE_MS = 90e3
export const _resetMomentFeed = () => _idle.clear()

/** The ET calendar day of `now` ('YYYY-MM-DD'): a game's own date is an ET date. */
export const etDay = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
export const dayAge = (day, now) => Math.round((Date.parse(`${etDay(now)}T12:00:00Z`) - Date.parse(`${String(day).slice(0, 10)}T12:00:00Z`)) / 864e5)

const best = (list) => list.reduce((a, b) => (!a || tierRank(b.ev.tier) > tierRank(a.ev.tier) ? b : a), null)

/** One event from a moment key + its data row, or null (the trigger is false). `extra` = { gameId, n, at, goals }. */
export function makeEvent(moment, row, extra) {
  const ev = evaluate(moment, row)
  if (!ev) return null
  const who = subjectOf(moment, row)
  if (!who) return null
  return { moment, sport: who.sport, row, ev, who, tier: ev.tier, status: ev.status, day: who.day || row.day || null, id: idOf[moment](row), ...extra }
}

const goalRef = (r) => ({ game_id: Number(r.game_id), player_id: Number(r.player_id), goal_n: Number(r.goal_n) })

// ── NHL ─────────────────────────────────────────────────────────────────────
/** Pure: the confirmed rows of games -> events. Preseason goals never post; an unconfirmed or overturned goal does not exist yet. */
export function nhlEventsFrom(rows) {
  const ok = (rows || []).filter((r) => r.confirmed_at && !r.overturned_at && Number(r.game_type) !== 1)
  const out = []
  for (const r of ok) {
    const cands = [makeEvent('nhl_goal', r, { gameId: r.game_id, n: `g${r.goal_n}`, at: ms(r.confirmed_at), goals: [goalRef(r)] }), makeEvent('nhl_season_goal_milestone', r, { gameId: r.game_id, n: `g${r.goal_n}`, at: ms(r.confirmed_at), goals: [goalRef(r)] })].filter(Boolean)
    const e = best(cands.reverse())     // the milestone is listed last, so a tie keeps it
    if (e) out.push(e)
  }
  for (const l of nhlGameLines(ok).values()) {
    const refs = [...new Map([...l.goals, ...l.assists].map((r) => [`${r.game_id}:${r.player_id}:${r.goal_n}`, r])).values()]
    const at = Math.max(...refs.map((r) => ms(r.confirmed_at) || 0))
    const ht = makeEvent('nhl_hat_trick', l, { gameId: l.game_id, n: `ht${l.goals.length}`, at, goals: refs.map(goalRef) })
    if (ht) out.push(ht)
    const pts = l.goals.length + l.assists.length
    const pt = makeEvent('nhl_three_points', l, { gameId: l.game_id, n: `pt${pts >= 7 ? 7 : pts >= 5 ? 5 : 3}`, at, goals: refs.map(goalRef) })
    if (pt) out.push(pt)
  }
  return out
}
async function nhlEvents(db, now) {
  const young = await q(db.from('lamp_goal_feed').select('game_id').gte('confirmed_at', iso(now - FRESH_MS)).is('overturned_at', null).limit(200))
  const games = [...new Set(young.map((r) => r.game_id))]
  if (!games.length) return null
  return nhlEventsFrom(await q(db.from('lamp_goal_feed').select(GOAL_COLS).in('game_id', games)))
}

// ── MLB ─────────────────────────────────────────────────────────────────────
export function mlbEventsFrom(rows) {
  const out = []
  for (const l of mlbGameLines(rows).values()) {
    const at = Math.max(...l.hrs.map((r) => ms(r.seen_at) || 0))
    const e = makeEvent('mlb_multi_hr', l, { gameId: l.game_pk, n: `hr${l.hrs.length}`, at: at || null })
    if (e) out.push(e)
  }
  return out
}
async function mlbEvents(db, now) {
  const young = await q(db.from('homer_feed').select('game_pk').gte('seen_at', iso(now - FRESH_MS)).limit(200))
  const games = [...new Set(young.map((r) => r.game_pk).filter(Boolean))]
  if (!games.length) return null
  return mlbEventsFrom(await q(db.from('homer_feed').select(MLB_COLS).in('game_pk', games)))
}

// ── NFL ─────────────────────────────────────────────────────────────────────
export function nflEventsFrom(rows) {
  const out = []
  for (const l of nflGameLines(rows).values()) {
    const at = Math.max(...l.tds.map((r) => ms(r.seen_at) || 0))
    const e = makeEvent('nfl_multi_td', l, { gameId: l.game_id, n: `td${l.tds.length}`, at: at || null })
    if (e) out.push(e)
  }
  return out
}
async function nflEvents(db, now) {
  const young = await q(db.from('nfl_td_feed').select('game_id').gte('seen_at', iso(now - FRESH_MS)).limit(200))
  const games = [...new Set(young.map((r) => r.game_id).filter(Boolean))]
  if (!games.length) return null
  return nflEventsFrom(await q(db.from('nfl_td_feed').select(NFL_COLS).in('game_id', games)))
}

// ── DAY-KEYED: the 100-yard games of the published logs, the long shots that cashed ──────────────────────────────
async function dailyEvents(db, now, { only = null, lsDays = FRESH_DAYS.long_shot_cashed } = {}) {
  const out = []
  const since = etDay(now - 86400e3 * Math.max(...Object.values(FRESH_DAYS)))
  if (!only || only === 'nfl_100_yards') {
    for (const c of await candidates('nfl_100_yards', db, { since })) {
      const e = makeEvent('nfl_100_yards', c.row, { gameId: `s${c.row.season}w${c.row.week}`, n: 'yd', at: null })
      if (e) out.push(e)
    }
  }
  if (!only || only === 'long_shot_cashed') {
    const longs = await candidates('long_shot_cashed', db, { since: etDay(now - 86400e3 * lsDays), limit: 200 })
    // an NHL long shot is a goal: only one the league CONFIRMED and that still stands (the candidate read does not look at that)
    const nhl = longs.filter((c) => c.row.sport === 'nhl')
    let standing = null
    if (nhl.length) {
      const days = [...new Set(nhl.map((c) => c.row.day))]
      standing = new Set((await q(db.from('lamp_goal_feed').select('player_id,day').in('day', days).not('confirmed_at', 'is', null).is('overturned_at', null).limit(1000))).map((r) => `${r.player_id}:${r.day}`))
    }
    for (const c of longs) {
      if (c.row.sport === 'nhl' && !standing.has(`${c.row.player_id}:${c.row.day}`)) continue
      const e = makeEvent('long_shot_cashed', c.row, { gameId: String(c.row.day).replace(/-/g, ''), n: 'ls', at: null })
      if (e) out.push(e)
    }
  }
  return out
}

const SOURCES = { nhl: nhlEvents, mlb: mlbEvents, nfl: nflEvents, daily: dailyEvents }

/** Is this event young enough (and settled enough) to post at `now`? */
export function inWindow(e, now) {
  if (e.at != null) {
    const age = now - e.at
    return age >= (SETTLE_MS[e.sport] || 0) && age <= FRESH_MS
  }
  const max = FRESH_DAYS[e.moment]
  return max != null && e.day != null && dayAge(e.day, now) <= max && dayAge(e.day, now) >= 0
}

/** The events a pass may consider: young, settled, and of a tier that posts anywhere. Best tier first, then newest. */
export async function momentEvents(db, { source, now = Date.now(), skipIdle = true } = {}) {
  const read = SOURCES[source]
  if (!read) return []
  if (skipIdle && now < (_idle.get(source) || 0)) return []
  const all = await read(db, now)
  if (all == null) { _idle.set(source, now + IDLE_MS); return [] }     // nothing young in this sport: not asked again for a moment
  return all.filter((e) => inWindow(e, now)).sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || (b.at || 0) - (a.at || 0) || String(b.day).localeCompare(String(a.day)))
}

export { MOMENTS }

/** Which day-keyed moments a sport reads at night's end: null = all of them (football has the 100-yard games too), the rest only the long shots that cashed. */
const DAILY_ONLY = { nfl: null }

/**
 * EVERY event of ONE sport on ONE game date (the night's digest reads this at the end of the night; read-only, no freshness window). The live feed's rows of
 * that day, plus the day-keyed events (the NFL 100-yard games of the published logs, the long shots that cashed) whose game date and sport match.
 * The digest decides what makes the night (lib/cards/digestRank.js); BASE events are in the list and ignored there.
 */
export async function nightEvents(db, { sport, night, now = Date.now() }) {
  const rows = {
    nhl: async () => nhlEventsFrom(await q(db.from('lamp_goal_feed').select(GOAL_COLS).eq('day', night).limit(2000))),
    mlb: async () => mlbEventsFrom(await q(db.from('homer_feed').select(MLB_COLS).eq('day', night).limit(2000))),
    nfl: async () => nflEventsFrom(await q(db.from('nfl_td_feed').select(NFL_COLS).eq('day', night).limit(2000))),
  }[sport]
  if (!rows) return []
  const out = await rows()
  try {
    const daily = await dailyEvents(db, now, { only: sport in DAILY_ONLY ? DAILY_ONLY[sport] : 'long_shot_cashed', lsDays: 2 })
    out.push(...daily.filter((e) => e.day === night && e.sport === sport))
  } catch (err) { console.error(`[digest] day-keyed events (${sport} ${night}): ${err?.message || err}`) }
  return out
}

/**
 * EVERY event of the last `days` days, with no freshness window (the dry run's census: scripts/moment-posts-dryrun.mjs). Read-only. Rows are read whole for
 * the days asked; a source that fails is reported in `errors` and the rest still answer. Returns { events, errors }.
 */
export async function historicalEvents(db, { days = 2, now = Date.now() } = {}) {
  const since = etDay(now - days * 86400e3)
  const events = []
  const errors = []
  const run = async (name, fn) => { try { events.push(...await fn()) } catch (err) { errors.push(`${name}: ${err?.message || err}`) } }
  await run('nhl', async () => nhlEventsFrom(await q(db.from('lamp_goal_feed').select(GOAL_COLS).gte('day', since).limit(2000))))
  await run('mlb', async () => mlbEventsFrom(await q(db.from('homer_feed').select(MLB_COLS).gte('day', since).limit(2000))))
  await run('nfl', async () => nflEventsFrom(await q(db.from('nfl_td_feed').select(NFL_COLS).gte('day', since).limit(2000))))
  await run('daily', async () => {
    const all = await dailyEvents(db, now, { lsDays: days })
    return all.filter((e) => e.day && e.day >= since)
  })
  return { events, errors, since }
}
