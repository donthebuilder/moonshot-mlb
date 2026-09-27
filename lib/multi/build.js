// THE 2+ CLUB, STEP 2 (2026-09-27, .claude-notes/BATCH-MULTI-PLAN.md).
// Server only. Every 2+ game this season, per sport, into multi_games, plus
// games played per player into multi_gp.
//
// THE ONE RULE: the league is the source, the board is the label.
//   the LIST   MLB  statsapi box scores (every final regular-season game)
//              NFL  nflverse weekly player stats (REG), dated off nflverse's
//                   own schedule (games.csv)
//              NHL  api.nhle.com/stats skater/summary, one row per skater per
//                   game, filtered to goals >= 2
//   the LABEL  from the record we kept AT THE TIME, never re-derived:
//              MLB  homer_feed (08-22 on: role/on_board frozen when the homer
//                   landed, lib/callStatus.js callStatus) -> else the night's
//                   graded file (the Called Ledger's own rule: a called role
//                   -> CALLED, on the sheet -> ON THE BOARD, else NOT) -> else
//                   'pre' (BEFORE OUR RECORD: no graded file for that date)
//              NFL  nfl_td_feed (tdCallStatus, frozen at the touchdown) ->
//                   else 'pre'. PASS_TD rows: the model makes no passing-TD
//                   call, so they are stored 'off' and the page shows NO chip
//                   for them (never faked as CALLED)
//              NHL  lamp_goal_log.status for that game -> 'off' when the
//                   game was logged and he wasn't in it -> 'pre' otherwise
//                   (every 2025-26 game: LAST SEASON, before LAMP existed)
//   the PRICE  our saved pregame price (odds_snap lock, lib/odds/priceAtLock),
//              else null.
import { callStatus, tdCallStatus, isCalledRole } from '../callStatus'
import { readPaged } from '../record/paged'
import { readLockPrices, priceKey } from '../odds/priceAtLock'

const MLB = 'https://statsapi.mlb.com/api/v1'
const NHL_STATS = 'https://api.nhle.com/stats/rest/en'
const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, { cache: 'no-store' })
      if (r.status === 404) return null
      if (r.ok) return await r.json()
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)))
  }
  throw new Error(`fetch failed: ${url}`)
}
async function getText(url) {
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}
/** CSV with quoted fields (nflverse headshot URLs carry commas). */
function csvRows(text) {
  const [head, ...lines] = text.split('\n')
  const cols = head.split(',')
  return lines.filter(Boolean).map((line) => {
    const f = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')) || []
    return Object.fromEntries(cols.map((c, i) => [c, f[i]]))
  })
}
async function pool(items, size, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

// ── MLB ────────────────────────────────────────────────────────────────────
async function mlbFinals(from, to) {
  const j = await getJson(`${MLB}/schedule?sportId=1&gameType=R&startDate=${from}&endDate=${to}&hydrate=team`)
  const games = []
  for (const d of j?.dates || []) {
    for (const g of d.games || []) {
      if (g.status?.abstractGameState !== 'Final' || /postponed|cancel/i.test(g.status?.detailedState || '')) continue
      games.push({ pk: g.gamePk, date: g.officialDate, away: g.teams.away.team.abbreviation, home: g.teams.home.team.abbreviation })
    }
  }
  return games
}

async function mlbLabeler(db, date) {
  const feed = await db.from('homer_feed').select('player_id, role, on_board, board_rank, hr_score').eq('day', date)
  const byFeed = new Map((feed.data || []).map((r) => [String(r.player_id), r]))
  const graded = await getJson(`${DATA}/graded_results_${date}.json`).catch(() => null)
  const slots = new Map()
  for (const s of graded?.graded_slots || []) {
    const id = String(s.player_id)
    const cur = slots.get(id) || { roles: new Set(), hr_score: s.hr_score, board_rank: s.board_rank }
    for (const r of String(s.game_pick_role || '').split('/')) if (r.trim()) cur.roles.add(r.trim())
    slots.set(id, cur)
  }
  const dist = new Map()
  for (const e of graded?.hr_capture_report?.all_homer_entries || []) dist.set(`${e.player_id}|${e.game_pk}`, e.distances_ft || null)
  return (pid, pk) => {
    const f = byFeed.get(pid)
    const distances = dist.get(`${pid}|${pk}`) || null
    if (f) return { status: callStatus(f), board_rank: f.board_rank ?? null, score: f.hr_score ?? null, distances }
    if (graded) {
      const s = slots.get(pid)
      const role = s ? [...s.roles].join('/') : ''
      return { status: s ? (isCalledRole(role) ? 'called' : 'board') : 'off', board_rank: s?.board_rank ?? null, score: s?.hr_score ?? null, distances }
    }
    return { status: 'pre', board_rank: null, score: null, distances }
  }
}

export async function buildMlb(db, { from, to, season = 2026, log = () => {} }) {
  const games = await mlbFinals(from, to)
  log(`mlb: ${games.length} final games ${from}..${to}`)
  const hits = []
  await pool(games, 8, async (g) => {
    const box = await getJson(`${MLB}/game/${g.pk}/boxscore`)
    for (const side of ['away', 'home']) {
      for (const p of Object.values(box?.teams?.[side]?.players || {})) {
        const hr = n0(p.stats?.batting?.homeRuns)
        if (hr >= 2) hits.push({ g, side, pid: String(p.person.id), name: p.person.fullName, hr })
      }
    }
  })
  const byDate = [...new Set(hits.map((h) => h.g.date))]
  const labelers = new Map()
  for (const d of byDate) labelers.set(d, await mlbLabeler(db, d))
  const prices = byDate.length ? (await readLockPrices(db, { sport: 'mlb', since: byDate.sort()[0], until: byDate.sort().at(-1) })).prices : new Map()
  const rows = hits.map((h) => {
    const lab = labelers.get(h.g.date)(h.pid, h.g.pk)
    const team = h.side === 'away' ? h.g.away : h.g.home
    const opp = h.side === 'away' ? h.g.home : h.g.away
    return {
      sport: 'mlb', season, day: h.g.date, game_id: String(h.g.pk), player_id: h.pid, name: h.name, team, opp,
      n: h.hr, kind: 'HR', detail: lab.distances ? { distances_ft: lab.distances } : null,
      status: lab.status, board_rank: lab.board_rank, score: lab.score,
      odds: prices.get(priceKey('mlb', h.g.date, h.pid))?.median ?? null,
    }
  })
  const st = await getJson(`${MLB}/stats?stats=season&group=hitting&season=${season}&sportId=1&playerPool=ALL&limit=5000`)
  const gp = (st?.stats?.[0]?.splits || []).map((s) => ({
    sport: 'mlb', season, player_id: String(s.player.id), name: s.player.fullName, team: s.team?.abbreviation || null, gp: n0(s.stat?.gamesPlayed),
  }))
  return { rows, gp }
}

// ── NFL ────────────────────────────────────────────────────────────────────
export async function buildNfl(db, { season = 2026, log = () => {} }) {
  const [weekly, games] = await Promise.all([
    getText(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`).then(csvRows),
    getText('https://github.com/nflverse/nfldata/raw/master/data/games.csv').then(csvRows),
  ])
  const dayOf = new Map(games.filter((g) => Number(g.season) === season).map((g) => [g.game_id, g.gameday]))
  const reg = weekly.filter((r) => r.season_type === 'REG')
  log(`nfl: ${reg.length} player-weeks`)
  const feed = await readPaged(() => db.from('nfl_td_feed').select('day, game_id, td_n, gsis_id, on_bot, td_board')
    .not('gsis_id', 'is', null).order('day', { ascending: true }).order('game_id', { ascending: true }).order('td_n', { ascending: true }))
  const labelOf = new Map()   // gsis|day -> status (first TD of his that day)
  for (const r of feed.data || []) {
    const k = `${r.gsis_id}|${r.day}`
    if (!labelOf.has(k)) labelOf.set(k, tdCallStatus(r))
  }
  const days = [...new Set(reg.map((r) => dayOf.get(r.game_id)).filter(Boolean))].sort()
  const prices = days.length ? (await readLockPrices(db, { sport: 'nfl', since: days[0], until: days.at(-1) })).prices : new Map()
  const rows = []
  const gpBy = new Map()
  for (const r of reg) {
    const day = dayOf.get(r.game_id)
    if (!day) continue
    const g = gpBy.get(r.player_id) || { sport: 'nfl', season, player_id: r.player_id, name: r.player_display_name, team: r.team, gp: 0, starts: null }
    g.gp += 1; g.team = r.team
    gpBy.set(r.player_id, g)
    const rush = n0(r.rushing_tds); const rec = n0(r.receiving_tds); const ret = n0(r.special_teams_tds)
    const td = rush + rec + ret
    const base = { sport: 'nfl', season, day, game_id: r.game_id, player_id: r.player_id, name: r.player_display_name, team: r.team, opp: r.opponent_team, board_rank: null, score: null }
    if (td >= 2) {
      rows.push({ ...base, n: td, kind: 'TD', detail: { rush, rec, ret, week: Number(r.week) }, status: labelOf.get(`${r.player_id}|${day}`) || 'pre', odds: prices.get(priceKey('nfl', day, r.player_id))?.median ?? null })
    }
    const pass = n0(r.passing_tds)
    if (pass >= 2) rows.push({ ...base, n: pass, kind: 'PASS_TD', detail: { week: Number(r.week), attempts: n0(r.attempts) }, status: 'off', odds: null })
  }
  return { rows, gp: [...gpBy.values()] }
}

// ── NHL ────────────────────────────────────────────────────────────────────
const nhlReport = (seasonId, isGame, extra = '') => getJson(`${NHL_STATS}/skater/summary?isAggregate=false&isGame=${isGame}&start=0&limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2${extra}`)}`)

export async function buildNhl(db, { seasonId, log = () => {} }) {
  const season = Math.floor(Number(seasonId) / 10000)   // 20252026 -> 2025
  const [multi, summary] = await Promise.all([nhlReport(seasonId, true, ' and goals>=2'), nhlReport(seasonId, false)])
  const list = multi?.data || []
  log(`nhl ${seasonId}: ${list.length} 2+ goal games`)
  const days = [...new Set(list.map((r) => r.gameDate))].sort()
  const logRows = days.length ? await readPaged(() => db.from('lamp_goal_log').select('game_id, player_id, status, rank_in_game, score')
    .gte('game_date', days[0]).lte('game_date', days.at(-1)).neq('game_type', 1)
    .order('game_id', { ascending: true }).order('player_id', { ascending: true })) : { data: [] }
  const logged = new Map((logRows.data || []).map((r) => [`${r.game_id}|${r.player_id}`, r]))
  const loggedGames = new Set((logRows.data || []).map((r) => String(r.game_id)))
  const prices = days.length ? (await readLockPrices(db, { sport: 'nhl', since: days[0], until: days.at(-1) })).prices : new Map()
  const rows = list.map((r) => {
    const l = logged.get(`${r.gameId}|${r.playerId}`)
    return {
      sport: 'nhl', season, day: r.gameDate, game_id: String(r.gameId), player_id: String(r.playerId), name: r.skaterFullName,
      team: r.teamAbbrev, opp: r.opponentTeamAbbrev, n: n0(r.goals), kind: 'G',
      detail: { pp: n0(r.ppGoals), sh: n0(r.shGoals), ev: n0(r.evGoals), ot: n0(r.otGoals), hat_trick: n0(r.goals) >= 3 },
      status: l ? l.status : loggedGames.has(String(r.gameId)) ? 'off' : 'pre',
      board_rank: l?.rank_in_game ?? null, score: l?.score ?? null,
      odds: prices.get(priceKey('nhl', r.gameDate, String(r.playerId)))?.median ?? null,
    }
  })
  const gp = (summary?.data || []).map((s) => ({ sport: 'nhl', season, player_id: String(s.playerId), name: s.skaterFullName, team: String(s.teamAbbrevs || '').split(',').pop() || null, gp: n0(s.gamesPlayed) }))
  return { rows, gp }
}

// ── STORE ──────────────────────────────────────────────────────────────────
/** Upsert (idempotent: the key is sport+game+player+kind). */
export async function storeMulti(db, { rows, gp }) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('multi_games').upsert(rows.slice(i, i + 500), { onConflict: 'sport,game_id,player_id,kind' })
    if (error) throw new Error(`multi_games: ${error.message}`)
  }
  const now = new Date().toISOString()
  for (let i = 0; i < gp.length; i += 1000) {
    const { error } = await db.from('multi_gp').upsert(gp.slice(i, i + 1000).map((g) => ({ ...g, updated_at: now })), { onConflict: 'sport,season,player_id' })
    if (error) throw new Error(`multi_gp: ${error.message}`)
  }
  return { rows: rows.length, gp: gp.length }
}
