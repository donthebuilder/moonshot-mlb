// THE 2+ CLUB, READ SIDE (2026-09-27, BATCH-MULTI-PLAN step 3). Server only.
// One sport's season out of multi_games + multi_gp, shaped for the Ledger's
// "2+ Club" view: a per-player season table, the recent games, three header
// numbers, and (NFL) the QB table. Every number is a count of stored rows --
// nothing here estimates.
//
// RATE only past a floor of games played (MLB 40, NFL 4, NHL 10), so a
// 2-for-2 rookie isn't #1; below it the rate is null and the page shows "--".
// SEASON: the sport's current season; if it has no rows yet (NHL before the
// 09-29 opener), the last season that does, flagged `stale`.
import { readPaged } from '../record/paged'

const PRIMARY = { mlb: 'HR', nfl: 'TD', nhl: 'G' }
const MIN_GP = { mlb: 40, nfl: 4, nhl: 10 }
const PER = { mlb: 100, nfl: 10, nhl: 100 }
// How each league names a season: NHL spans two years ("2025-26").
const LABEL = { mlb: (y) => String(y), nfl: (y) => String(y), nhl: (y) => `${y}-${String(y + 1).slice(2)}` }

function currentSeason(sport, now = Date.now()) {
  const [y, m] = new Date(now - 7 * 3600e3).toISOString().slice(0, 7).split('-').map(Number)
  if (sport === 'mlb') return y
  if (sport === 'nfl') return m <= 2 ? y - 1 : y
  return m >= 9 ? y : y - 1          // NHL: the season is named for the year it starts
}

async function rowsFor(db, sport, season) {
  const { data, error } = await readPaged(() => db.from('multi_games')
    .select('sport, season, day, game_id, player_id, name, team, opp, n, kind, detail, status, board_rank, score, odds')
    .eq('sport', sport).eq('season', season)
    .order('day', { ascending: false }).order('game_id', { ascending: true }).order('player_id', { ascending: true }).order('kind', { ascending: true }))
  if (error) throw new Error(`multi_games: ${error.message}`)
  return data
}

function playerTable(rows, gpBy, sport) {
  const by = new Map()
  for (const r of rows) {
    const p = by.get(r.player_id) || { player_id: r.player_id, name: r.name, team: r.team, multi: 0, most: 0, called: 0, recorded: 0, last: null }
    p.multi += 1
    if (r.status !== 'pre') p.recorded += 1   // games we kept a record for -- "called in" counts only these
    p.most = Math.max(p.most, r.n)
    if (r.status === 'called') p.called += 1
    if (!p.last || r.day > p.last) { p.last = r.day; p.team = r.team || p.team; p.name = r.name || p.name }
    by.set(r.player_id, p)
  }
  return [...by.values()].map((p) => {
    const g = gpBy.get(p.player_id)
    const gp = g?.gp ?? null
    const rate = gp != null && gp >= MIN_GP[sport] ? Math.round((10 * PER[sport] * p.multi) / gp) / 10 : null
    return { ...p, gp, rate }
  }).sort((a, b) => b.multi - a.multi || (b.rate ?? -1) - (a.rate ?? -1) || b.most - a.most || a.name.localeCompare(b.name))
}

export async function readMulti(db, sport) {
  const want = currentSeason(sport)
  let season = want
  let rows = await rowsFor(db, sport, season)
  let stale = false
  if (!rows.length) {
    const { data } = await db.from('multi_games').select('season').eq('sport', sport).lt('season', want).order('season', { ascending: false }).limit(1)
    if (data?.[0]) { season = data[0].season; rows = await rowsFor(db, sport, season); stale = true }
  }
  const gp = await readPaged(() => db.from('multi_gp').select('player_id, gp, starts').eq('sport', sport).eq('season', season).order('player_id', { ascending: true }))
  const gpBy = new Map((gp.data || []).map((g) => [g.player_id, g]))

  const main = rows.filter((r) => r.kind === PRIMARY[sport])
  const header = {
    games: main.length,
    onBoard: main.filter((r) => r.status === 'called' || r.status === 'board').length,
    called: main.filter((r) => r.status === 'called').length,
    before: main.filter((r) => r.status === 'pre').length,
  }
  const out = {
    sport, season, seasonLabel: LABEL[sport](season), currentSeason: want, stale, kind: PRIMARY[sport], minGp: MIN_GP[sport], per: PER[sport], header,
    players: playerTable(main, gpBy, sport),
    recent: main.slice(0, 80).map((r) => ({ day: r.day, player_id: r.player_id, name: r.name, team: r.team, opp: r.opp, n: r.n, status: r.status, odds: r.odds, detail: r.detail, game_id: r.game_id })),
  }
  if (sport === 'nfl') {
    // QBs: passing TDs, their own table (never added into TD). No chip -- the
    // model makes no passing-TD call. Sorted by 3+ games.
    const qb = new Map()
    for (const r of rows.filter((x) => x.kind === 'PASS_TD')) {
      const p = qb.get(r.player_id) || { player_id: r.player_id, name: r.name, team: r.team, g2: 0, g3: 0, g4: 0, most: 0, last: null }
      p.g2 += 1; if (r.n >= 3) p.g3 += 1; if (r.n >= 4) p.g4 += 1
      p.most = Math.max(p.most, r.n)
      if (!p.last || r.day > p.last) { p.last = r.day; p.team = r.team || p.team }
      qb.set(r.player_id, p)
    }
    out.qbs = [...qb.values()].map((p) => ({ ...p, gp: gpBy.get(p.player_id)?.gp ?? null }))
      .sort((a, b) => b.g3 - a.g3 || b.g2 - a.g2 || b.most - a.most || a.name.localeCompare(b.name))
  }
  return out
}

/** One player's 2+ games in a season (default: the current one) -- the
 *  tap-through list and the player-page line. */
export async function readPlayerMulti(db, sport, playerId, season = null) {
  const s = Number.isInteger(season) ? season : currentSeason(sport)
  const { data } = await db.from('multi_games').select('day, n, kind, status, opp, team, name, player_id, game_id, odds')
    .eq('sport', sport).eq('season', s).eq('player_id', String(playerId)).order('day', { ascending: false })
  return { season: s, seasonLabel: LABEL[sport](s), games: data || [] }
}
