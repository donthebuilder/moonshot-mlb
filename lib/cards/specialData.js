// THE SPECIAL CARDS' DATA (server only, no JSX; READ-ONLY: it never writes, never polls). Two jobs:
//   buildSpecialModel(key, row, { ident, test })   the special MODEL lib/cards/specialCard.js draws, from one moment data row
//                                                         (lib/cards/moments.js) and the picture / number a sport adapter hands back
//   loadSpecial({ key, id, db })                           one real event by its id, or { ok:false, status:404 }
//   candidates(key, db, { since })                         the recent real events of a moment (for the preview scripts)
// Sources, all already stored and public once an event has happened:
//   nhl_*   lamp_goal_feed (lib/nhl/goalFeed.js writes it; status = the lock's label, frozen on the row)
//   mlb_*   homer_feed (the MOONSHOT homer feed; the label is lib/callStatus callStatus over its stored role)
//   nfl_multi_td   nfl_td_feed (the label is lib/callStatus tdCallStatus over its stored on_bot / td_board)
//   nfl_100_yards  the data branch's nfl_results.json (the graded week lines) + nfl_week.json (team, opponent, kickoff)
//   long_shot_cashed  the events above that were CALLED, with the best stored price from odds_snap (lib/cards/price.js) and its book count
// A moment id is its parts joined by ':' (see ID_SHAPE). An event that does not exist, or whose trigger is false, is a 404, never a guess.
import { MOMENTS, evaluate, nhlGameLines, mlbGameLines, nflGameLines, nflYardRows, nflSides, nflHomeOf, LONG_PRICE } from './moments'
import { CARD_WORDS } from '../card/core'
import { callLineOf, brandOf, prettyDay } from './model'
import { hasRoleIn, HR_CALL_ROLES, callStatus, tdCallStatus } from '../callStatus'
import { adapterFor } from './registry'
import { pricesForLegs } from './price'
import { nhlTeam } from '../nhl/teams'
import { teamFullName } from '../mlbTeams'

/** What an id looks like, per moment (a documentation table; parseId enforces it). */
export const ID_SHAPE = {
  nhl_goal: 'gameId:playerId:goalN', nhl_season_goal_milestone: 'gameId:playerId:goalN',
  nhl_hat_trick: 'gameId:playerId', nhl_three_points: 'gameId:playerId',
  mlb_multi_hr: 'gamePk:playerId', nfl_multi_td: 'gameId:gsisId', nfl_100_yards: 'gsisId',
  long_shot_cashed: 'sport:playerId:YYYY-MM-DD',
}
const PART = /^[A-Za-z0-9_-]{1,24}$/
export function parseId(key, id) {
  const parts = String(id || '').split(':')
  const want = String(ID_SHAPE[key] || '').split(':').length
  if (!ID_SHAPE[key] || parts.length !== want || !parts.every((p) => PART.test(p) || /^\d{4}-\d{2}-\d{2}$/.test(p))) return null
  return parts
}
export const idOf = {
  nhl_goal: (r) => `${r.game_id}:${r.player_id}:${r.goal_n}`,
  nhl_season_goal_milestone: (r) => `${r.game_id}:${r.player_id}:${r.goal_n}`,
  nhl_hat_trick: (l) => `${l.game_id}:${l.player_id}`,
  nhl_three_points: (l) => `${l.game_id}:${l.player_id}`,
  mlb_multi_hr: (l) => `${l.game_pk}:${l.player_id}`,
  nfl_multi_td: (l) => `${l.game_id}:${l.gsis_id}`,
  nfl_100_yards: (r) => r.gsis_id,
  long_shot_cashed: (r) => `${r.sport}:${r.player_id}:${r.day}`,
}

const miss = (why, status = 404) => ({ ok: false, status, why })
const homeFromScore = (scoreAfter, team) => { const m = /^(\S+) \d+ · (\S+) \d+$/.exec(String(scoreAfter || '')); return m ? m[2] === team : null }

// ── the model ───────────────────────────────────────────────────────────────

/** Who the card is about, from a moment data row: { sport, name, team, opp, home, day, role, playerId }. Pure. */
export function subjectOf(key, row) {
  switch (key) {
    case 'nhl_goal': case 'nhl_season_goal_milestone':
      return { sport: 'nhl', name: row.name, team: row.team, opp: row.opp, home: homeFromScore(row.score_after, row.team), day: row.day, role: 'TOP', playerId: String(row.player_id) }
    case 'nhl_hat_trick': case 'nhl_three_points': {
      const last = (row.goals.at(-1) || row.assists.at(-1))
      return { sport: 'nhl', name: row.name, team: row.team, opp: row.opp, home: homeFromScore(last?.score_after, row.team), day: row.day, role: 'TOP', playerId: String(row.player_id) }
    }
    case 'mlb_multi_hr':
      return { sport: 'mlb', name: row.name, team: row.team, opp: row.opponent, home: row.home === true ? true : row.home === false ? false : null, day: row.day, role: row.first?.role || '', playerId: String(row.player_id) }
    case 'nfl_multi_td':
      return { sport: 'nfl', name: row.name, team: row.team, opp: row.opponent, home: row.home ?? null, day: row.day, role: '', playerId: String(row.gsis_id) }
    case 'nfl_100_yards':
      return { sport: 'nfl', name: row.name, team: row.team, opp: row.opp, home: row.home ?? null, day: row.day, role: '', playerId: String(row.gsis_id) }
    case 'long_shot_cashed':
      return { sport: row.sport, name: row.name, team: row.team, opp: row.opp, home: row.home ?? null, day: row.day, role: row.role || '', playerId: String(row.player_id) }
    default: return null
  }
}

// the club's long name, per sport (a sport with no table here has none: the card then prints the code only)
const CLUB_NAME = { nhl: (t) => nhlTeam(t)?.name || '', mlb: (t) => teamFullName(t) || '' }
const clubOf = (sport, team) => (CLUB_NAME[sport] ? CLUB_NAME[sport](team) : '')
// the role word, per sport (MOONSHOT's roles have words; the others print none)
// the full name of a man the feed only knows by a short name, per sport (today only the NHL feed shortens an assister's name)
const FULL_NAME = {
  nhl: async (who) => {
    const { rosterFor } = await import('../nhl/api')
    const { reduceRoster } = await import('../nhl/reduce')
    return reduceRoster(await rosterFor(who.team), who.team).find((x) => String(x.id) === who.playerId)?.name || ''
  },
}
const ROLE_WORDS = { mlb: async () => (await import('../dash/homerFeed')).roleWord }

/**
 * The special model of one moment data row, or null when the moment's trigger is false for it. `ident` = what a sport adapter's identity()
 * returns ({ face, logo, logoPlate, tone, number, pos }). A long shot's price and book count ride on its row.
 * `test` marks a TEST fixture: the card prints TEST DATA on its face. `holo` (true / false) overrides the tier's own holo setting (previews only). Pure: no I/O.
 */
export function buildSpecialModel(key, row, { ident = {}, test = false, holo = undefined, roleWord = (r) => r } = {}) {
  const ev = evaluate(key, row)
  if (!ev) return null
  const who = subjectOf(key, row)
  const status = ev.status
  const market = CARD_WORDS[who.sport].market
  return {
    sport: who.sport, brand: brandOf(who.sport),
    moment: { key, label: MOMENTS[key].label, tier: ev.tier, holo: holo === undefined ? ev.holo : Boolean(holo) },
    status,
    name: who.name, team: who.team, opp: who.opp, home: who.home, teamName: clubOf(who.sport, who.team), club: clubOf(who.sport, who.team),
    pos: ident.pos || null, number: ident.number ?? null,
    face: ident.face || '', logo: ident.logo || '', logoPlate: Boolean(ident.logoPlate), tone: ident.tone || null,
    kicker: ev.print.kicker, hero: ev.print.hero, tag: ev.print.tag, tiles: ev.print.tiles, line: ev.print.line, note: ev.print.note,
    callLine: status ? callLineOf({ status, role: who.role ? roleWord(who.role) : '', market }) : '',
    day: who.day, dayWord: prettyDay(who.day), playerId: who.playerId, test: Boolean(test),
  }
}

/** The picture / number / position of a man (his sport's adapter identity). A miss is an empty identity: the card draws a monogram. */
export async function identityOf(sport, { player_id, team, pos }) {
  try {
    const adapter = await adapterFor(sport)
    return (await adapter.identity({ player_id, team, pos })) || {}
  } catch { return {} }
}

/** A row's model with its real picture and, for a long shot, its stored price. */
export async function modelFromRow(key, row) {
  const who = subjectOf(key, row)
  if (!who) return null
  const ident = await identityOf(who.sport, { player_id: who.playerId, team: who.team, pos: null })
  const roleWord = ROLE_WORDS[who.sport] ? await ROLE_WORDS[who.sport]() : undefined
  const model = buildSpecialModel(key, row, { ident, roleWord })
  // a man who only ASSISTED is known to the goal feed by his short name ("F. Minten"): his club's roster has the full one
  if (model && row.scorer === false && FULL_NAME[who.sport]) {
    try { const full = await FULL_NAME[who.sport](who); if (full) model.name = full } catch { /* the short name stays */ }
  }
  return model
}

// ── reading real events (every query is a select) ───────────────────────────
const FEED_COLS = 'game_id,player_id,goal_n,day,season,period,period_type,time_in_period,strength,empty_net,team,opp,name,season_goals,assists,score_after,status,rank_in_game,overturned_at'
const MLB_COLS = 'day,player_id,hr_n,name,team,opponent,game_pk,inning,home,role,on_board,board_rank,stats'
const NFL_COLS = 'day,game_id,td_n,team,opponent,quarter,clock,kind,kind_word,yards,passer_name,scorer_name,gsis_id,on_bot,td_board,away_score,home_score'
const q = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data || [] }

async function nflWeek() {
  const { fetchNfl, nflSlatePaths, nflSlateLooksReal, nflResultsPaths } = await import('../nfl/dataSource')
  const [week, results] = await Promise.all([fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null), fetchNfl(nflResultsPaths()).catch(() => null)])
  return { week, results }
}
const etDay = (iso) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)) } catch { return null } }
async function yardRows() {
  const { week, results } = await nflWeek()
  if (!week || !results) return []
  const rows = nflYardRows({ results, players: week.players, games: week.games })
  return rows.map((r) => {
    const g = (week.games || []).find((x) => x.home === r.team || x.away === r.team)
    return { ...r, day: g?.kickoff ? etDay(g.kickoff) : r.day, home: g ? g.home === r.team : null }
  })
}

/** Recent real events of a moment, newest first: [{ id, row }]. `since` = 'YYYY-MM-DD' (the earliest game day read). Read-only. */
export async function candidates(key, db, { since, limit = 400 } = {}) {
  const m = MOMENTS[key]
  if (!m || !db) return []
  const keep = (rows, idf) => rows.filter((r) => m.trigger(r)).map((r) => ({ id: idf(r), row: r }))
  if (key === 'nhl_goal' || key === 'nhl_season_goal_milestone') {
    const rows = await q(db.from('lamp_goal_feed').select(FEED_COLS).is('overturned_at', null).gte('day', since).order('day', { ascending: false }).limit(limit * 4))
    return keep(rows, idOf[key]).slice(0, limit)
  }
  if (key === 'nhl_hat_trick' || key === 'nhl_three_points') {
    const rows = await q(db.from('lamp_goal_feed').select(FEED_COLS).is('overturned_at', null).gte('day', since).order('day', { ascending: false }).limit(limit * 6))
    return keep([...nhlGameLines(rows).values()], idOf[key]).sort((a, b) => String(b.row.day).localeCompare(String(a.row.day)))
  }
  if (key === 'mlb_multi_hr') {
    const rows = await q(db.from('homer_feed').select(MLB_COLS).gte('day', since).order('day', { ascending: false }).limit(limit * 4))
    return keep([...mlbGameLines(rows).values()], idOf[key]).sort((a, b) => String(b.row.day).localeCompare(String(a.row.day)))
  }
  if (key === 'nfl_multi_td') {
    const rows = await q(db.from('nfl_td_feed').select(NFL_COLS).gte('day', since).order('day', { ascending: false }).limit(limit * 3))
    return keep([...nflGameLines(rows).values()], idOf[key]).sort((a, b) => String(b.row.day).localeCompare(String(a.row.day)))
  }
  if (key === 'nfl_100_yards') return keep(await yardRows(), idOf[key])
  if (key === 'long_shot_cashed') return longShots(db, since, limit)
  return []
}

/** CALLED events with a stored best price (+LONG_PRICE or longer) and its book count. Only events that happened (a goal / homer / TD is a cashed anytime call). */
async function longShots(db, since, limit) {
  const events = []
  const goals = await q(db.from('lamp_goal_feed').select(FEED_COLS).is('overturned_at', null).eq('status', 'called').gte('day', since).order('day', { ascending: false }).limit(limit))
  for (const r of goals) events.push({ sport: 'nhl', player_id: String(r.player_id), name: r.name, team: r.team, opp: r.opp, day: r.day, role: 'TOP', home: homeFromScore(r.score_after, r.team) })
  const homers = await q(db.from('homer_feed').select(MLB_COLS).gte('day', since).order('day', { ascending: false }).limit(limit * 2))
  for (const r of homers) if (hasRoleIn(r.role, HR_CALL_ROLES) && callStatus({ role: r.role }) === 'called') events.push({ sport: 'mlb', player_id: String(r.player_id), name: r.name, team: r.team, opp: r.opponent, day: r.day, role: r.role, home: r.home === true ? true : r.home === false ? false : null })
  const tds = await q(db.from('nfl_td_feed').select(NFL_COLS).gte('day', since).order('day', { ascending: false }).limit(limit))
  const sides = nflSides(tds)
  for (const r of tds) if (r.gsis_id && tdCallStatus({ on_bot: r.on_bot, td_board: r.td_board }) === 'called') events.push({ sport: 'nfl', player_id: String(r.gsis_id), name: r.scorer_name, team: r.team, opp: r.opponent, day: r.day, role: '', home: nflHomeOf(sides, r.game_id, r.team) })
  const out = []
  const seen = new Set()
  for (const sport of ['nhl', 'mlb', 'nfl']) {
    const evs = events.filter((e) => e.sport === sport && !seen.has(`${sport}:${e.player_id}:${e.day}`))
    for (const e of evs) seen.add(`${sport}:${e.player_id}:${e.day}`)
    if (!evs.length) continue
    const prices = await pricesForLegs(db, sport, evs.map((e) => ({ player_id: e.player_id, game_date: e.day })))
    for (const e of evs) {
      const p = prices.get(String(e.player_id))
      if (!p) continue
      const row = { ...e, status: 'called', hit: true, market: CARD_WORDS[sport].market, best: Number(p.raw?.best), books: p.books }
      if (MOMENTS.long_shot_cashed.trigger(row)) out.push({ id: idOf.long_shot_cashed(row), row })
    }
  }
  return out.sort((a, b) => String(b.row.day).localeCompare(String(a.row.day)))
}

/** One real event by id: { ok:true, row } or { ok:false, status, why }. 404 when it does not exist or its trigger is false. */
export async function loadSpecial({ key, id, db }) {
  if (!MOMENTS[key]) return miss('no such moment')
  const parts = parseId(key, id)
  if (!parts) return miss(`bad id (${ID_SHAPE[key] || 'unknown moment'})`, 400)
  if (!db) return { ok: false, status: 503, why: 'not configured' }
  try {
    let row = null
    if (key === 'nhl_goal' || key === 'nhl_season_goal_milestone') {
      const [g, p, n] = parts
      row = (await q(db.from('lamp_goal_feed').select(FEED_COLS).eq('game_id', Number(g)).eq('player_id', Number(p)).eq('goal_n', Number(n)).is('overturned_at', null).limit(1)))[0] || null
    } else if (key === 'nhl_hat_trick' || key === 'nhl_three_points') {
      const [g, p] = parts
      row = nhlGameLines(await q(db.from('lamp_goal_feed').select(FEED_COLS).eq('game_id', Number(g)).is('overturned_at', null))).get(`${g}:${p}`) || null
    } else if (key === 'mlb_multi_hr') {
      const [g, p] = parts
      row = mlbGameLines(await q(db.from('homer_feed').select(MLB_COLS).eq('game_pk', g).eq('player_id', p))).get(`${g}:${p}`) || null
    } else if (key === 'nfl_multi_td') {
      const [g, p] = parts
      row = nflGameLines(await q(db.from('nfl_td_feed').select(NFL_COLS).eq('game_id', g))).get(`${g}:${p}`) || null
    } else if (key === 'nfl_100_yards') {
      row = (await yardRows()).find((r) => r.gsis_id === parts[0]) || null
    } else if (key === 'long_shot_cashed') {
      const [sport, , day] = parts
      row = (await candidates(key, db, { since: day, limit: 200 })).map((c) => c.row).find((r) => r.sport === sport && String(r.player_id) === parts[1] && r.day === day) || null
    }
    if (!row || !MOMENTS[key].trigger(row)) return miss('that moment did not happen')
    return { ok: true, row }
  } catch (e) {
    console.error(`[special] ${key}/${id}: ${e?.message || e}`)
    return { ok: false, status: 502, why: 'read failed' }
  }
}

export { LONG_PRICE }
