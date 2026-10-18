// lib/nfl/tags.js -- THE TAG REGISTRY, IN ONE PLACE (2026-10-10).
//
// Donovan: "we need tags like fumble prone or interception prone, defensive tags for good corners or good rushers."
//
// A TAG IS INFORMATION, NOT A PICK. It is a short neutral label that appears ONLY when a stored number clears a
// threshold written down in this file's TAG_RULES table, on a sample that clears a floor, in a named season. It says
// which number and which season in its explanation (lib/explain.js: tap or hover). It is never "will" language, it
// feeds the defense-versus-position line a reader already has, and it changes NO TUDDY score, NO status word
// (lib/callStatus.js is not imported here, on purpose) and NO model row. check-nfl-tags.mjs proves each of those.
//
// TWO KINDS
//   PLAYER tags (offence), from this season's finished box scores (lib/nfl/defStats.js, /api/nfl/defense):
//     Fumble-prone        fumbles LOST per 100 touches (carries + catches + pass attempts + sacks taken)
//     Interception-prone  a quarterback's interceptions per 100 pass attempts
//   TEAM tags (a defence), from the matchup file the site already reads (nfl_matchup.json):
//     Strong / Weak corners      receiving yards a game allowed to WR1+WR2+WR3 (the defense-versus-position table),
//                                with the three starting corners' passes defended and interceptions beside it
//     Strong / Weak pass rush    sacks a game (nfl_week team_defense); last season's pressure rate (disruption_team)
//                                only while a club is under the games floor, and then it says "last season"
//     Run stuffers / Soft vs run rushing yards a game allowed to RB1+RB2 (defense-versus-position)
//
// SEASON RULE (lib/nfl/seasonRule.js, the one rule): a club with MIN_GAMES_THIS (3) or more games this season is read
// from this season, labelled with the real count; under 3 games it is read from last season where a table exists
// (labelled "last season (2025)"), else NO tag. A rank is always inside ONE season's table (never a mix). A player
// with fewer than 3 games this season, or under the touches / attempts floor, gets no tag at all: no sample, no label.
//
// THRESHOLDS ARE MEASURED, NOT GUESSED (2025 full season, 272 finished games, ESPN box scores):
//   league fumbles lost = 239 on 42,165 touches = 0.57 per 100; the 90th percentile of men with 100+ touches was
//   0.96 per 100  -> FUMBLE_RATE_MIN 1.0 per 100 (a bit over that tenth), with FUMBLE_LOST_MIN 2 so one bounce is not a tag.
//   quarterbacks with 150+ attempts: league interceptions 2.1 per 100 attempts, the 85th percentile 3.08
//   -> INT_RATE_MIN 3.0 per 100, with INT_MIN 3 and INT_ATT_MIN 60 attempts (about two games).
//   defences: the best / worst QUARTER of the league (rank 8 or better of 32) in the one number named above.
// A tag describes the games played. Measured the same way on 2025, men tagged after week 5 lost fumbles at 0.55 per
// 100 touches afterwards against 0.49 for everyone: a faint carry-over, nothing a line could stand on. So the words
// say "has lost", never "will lose".
import { MIN_GAMES_THIS, defenseSeason } from './seasonRule'
import { ordinal as ord } from '../format'

// ── THE THRESHOLD TABLE (the only place a cut-off lives) ─────────────────────
export const MIN_GAMES = MIN_GAMES_THIS            // 3 games this season, the site-wide floor
export const TEAM_QUARTILE = 0.25                  // the best / worst quarter of the clubs that clear the games floor
export const TAG_RULES = {
  fumble_prone: {
    side: 'player', word: 'Fumble-prone',
    minGames: MIN_GAMES, minTouches: 40, minLost: 2, minRatePer100: 1.0,
    stat: 'fumbles lost per 100 touches',
  },
  interception_prone: {
    side: 'player', word: 'Interception-prone', position: 'QB',
    minGames: MIN_GAMES, minAttempts: 60, minInt: 3, minRatePer100: 3.0,
    stat: 'interceptions thrown per 100 pass attempts',
  },
  strong_corners: { side: 'team', word: 'Strong corners', dir: 'fewest', stat: 'receiving yards a game allowed to WR1, WR2 and WR3' },
  weak_corners: { side: 'team', word: 'Weak corners', dir: 'most', stat: 'receiving yards a game allowed to WR1, WR2 and WR3' },
  strong_pass_rush: { side: 'team', word: 'Strong pass rush', dir: 'most', stat: 'sacks a game' },
  weak_pass_rush: { side: 'team', word: 'Weak pass rush', dir: 'fewest', stat: 'sacks a game' },
  run_stuffers: { side: 'team', word: 'Run stuffers', dir: 'fewest', stat: 'rushing yards a game allowed to RB1 and RB2' },
  soft_vs_run: { side: 'team', word: 'Soft vs run', dir: 'most', stat: 'rushing yards a game allowed to RB1 and RB2' },
}
/** Pass rush may fall back on last season's pressure rate while a club is under the games floor; this many pressure
 *  plays must stand behind it (the bot's own sample size for that figure). */
export const PRESSURE_MIN_PLAYS = 300

export const TAG_ORDER = ['fumble_prone', 'interception_prone', 'strong_corners', 'weak_corners', 'strong_pass_rush', 'weak_pass_rush', 'run_stuffers', 'soft_vs_run']
export const TAG_WORD = Object.fromEntries(Object.entries(TAG_RULES).map(([k, r]) => [k, r.word]))
/** Which side of the ball a tag describes: 'player' tags go on the man, 'team' tags on a defence. */
export const isTeamTag = (key) => TAG_RULES[key]?.side === 'team'
/** Where a tag could also go later (NOT wired in this pass: Discord / X text is unchanged). */
export const TAG_SURFACES_NOT_WIRED = ['discord card why-line', 'x call post why-words', 'game write-up (lib/writeups/nfl.js) matchup clause']

const fin = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const r1 = (x) => Math.round(x * 10) / 10
const r2 = (x) => Math.round(x * 100) / 100
const gamesWord = (n) => `${n} ${n === 1 ? 'game' : 'games'}`
const TAIL = 'A label from the games played, not a forecast. It changes no score and no status.'

// ── PLAYER TAGS ──────────────────────────────────────────────────────────────
/** Touches for a rate: carries + catches + pass attempts + times sacked (every snap a ball could be fumbled). */
export const touchesOf = (p) => (fin(p?.car) || 0) + (fin(p?.rec) || 0) + (fin(p?.att) || 0) + (fin(p?.sacked) || 0)

/** The league rates a player tag is explained against, from the same payload: { lostPer100, intPer100 }. */
export function leagueRates(players = []) {
  let lost = 0, touches = 0, ints = 0, att = 0
  for (const p of players) {
    const t = touchesOf(p)
    if (t > 0) { lost += fin(p.lost) || 0; touches += t }
    if ((fin(p.att) || 0) >= 20) { ints += fin(p.int) || 0; att += fin(p.att) || 0 }
  }
  return { lostPer100: touches > 0 ? (100 * lost) / touches : null, intPer100: att > 0 ? (100 * ints) / att : null, touches, att }
}

/**
 * Tags for one offensive man. `line` = his season line from /api/nfl/defense?view=turnovers
 * ({ games, att, int, sacked, car, rec, fum, lost }); `ctx` = { season, league: leagueRates(...), position }.
 * Returns [] when nothing clears. Pure: the inputs are not touched.
 */
export function playerTags(line, ctx = {}) {
  if (!line) return []
  const out = []
  const games = fin(line.games) || 0
  const season = ctx.season ?? null
  const where = `${gamesWord(games)} this season${season ? ` (${season})` : ''}`
  const fr = TAG_RULES.fumble_prone
  const touches = touchesOf(line)
  const lost = fin(line.lost) || 0
  if (games >= fr.minGames && touches >= fr.minTouches && lost >= fr.minLost) {
    const rate = (100 * lost) / touches
    if (rate >= fr.minRatePer100) {
      const lg = ctx.league?.lostPer100
      const fum = fin(line.fum) || 0
      out.push({
        key: 'fumble_prone', side: 'player', word: fr.word, season, games, value: r2(rate), stat: fr.stat,
        n: lost, of: touches,
        note: `${fr.word}: ${lost} ${lost === 1 ? 'fumble' : 'fumbles'} lost (${fum} fumbled in all) on ${touches} touches in ${where}, ${r1(rate)} per 100 touches${lg != null ? ` against ${r1(lg)} for the league` : ''}. A touch is a carry, a catch, a pass attempt or a sack taken. Cleared when he has lost ${fr.minLost}+ fumbles at ${fr.minRatePer100.toFixed(1)}+ per 100 touches with ${fr.minGames}+ games. ${TAIL}`,
      })
    }
  }
  const ir = TAG_RULES.interception_prone
  const pos = String(ctx.position || line.position || '').toUpperCase()
  const att = fin(line.att) || 0
  const ints = fin(line.int) || 0
  if ((pos === ir.position || (!pos && att >= ir.minAttempts)) && games >= ir.minGames && att >= ir.minAttempts && ints >= ir.minInt) {
    const rate = (100 * ints) / att
    if (rate >= ir.minRatePer100) {
      const lg = ctx.league?.intPer100
      out.push({
        key: 'interception_prone', side: 'player', word: ir.word, season, games, value: r2(rate), stat: ir.stat,
        n: ints, of: att,
        note: `${ir.word}: ${ints} interceptions on ${att} pass attempts in ${where}, ${r1(rate)} per 100 attempts${lg != null ? ` against ${r1(lg)} for the league's passers` : ''}. Cleared when he has thrown ${ir.minInt}+ at ${ir.minRatePer100.toFixed(1)}+ per 100 attempts with ${ir.minAttempts}+ attempts and ${ir.minGames}+ games. ${TAIL}`,
      })
    }
  }
  return out
}

// ── TEAM TAGS ────────────────────────────────────────────────────────────────
const ROLES = { corners: ['WR1', 'WR2', 'WR3'], run: ['RB1', 'RB2'] }
const SUM_STAT = { corners: 'recyd_g', run: 'rshyd_g' }

/** The value of one defence over a set of roles: the sum of the stat across the roles, or null if any cell is missing. */
function sumRoles(roles, names, stat) {
  let sum = 0
  for (const r of names) { const v = fin(roles?.[r]?.[stat]); if (v == null) return null; sum += v }
  return sum
}
const rowSeasonOf = (matchup, roles) => fin(Object.values(roles || {})[0]?.s) ?? fin(matchup?.season)

/**
 * Every club's table for ONE season: the file's own rows of that season plus last season's full table when the
 * payload was blended (matchup.dvp_league). A club under the games floor is left out of the pool when the season is
 * this one, so a two-game cell cannot set the quarter.
 */
export function seasonPool(matchup, season) {
  const out = {}
  const thisYear = fin(matchup?.slate_season) ?? fin(matchup?.season)
  const add = (team, roles) => {
    if (rowSeasonOf(matchup, roles) !== season) return
    if (season === thisYear) {
      let g = 0
      for (const row of Object.values(roles || {})) g = Math.max(g, fin(row?.g) || 0)
      if (g < MIN_GAMES) return
    }
    out[team] = roles
  }
  for (const [t, roles] of Object.entries(matchup?.dvp?.season || {})) add(t, roles)
  for (const [t, roles] of Object.entries(matchup?.dvp_league || {})) add(t, roles)
  return out
}

/** Rank inside a pool of { team: value } where 1 is the LOWEST value (the fewest) or the highest ('most'). */
function rankIn(values, team, dir) {
  const v = values[team]
  if (v == null) return null
  const all = Object.values(values)
  return 1 + all.filter((x) => (dir === 'most' ? x > v : x < v)).length
}
/** How many clubs are at least as good as this one in `dir` (itself and every tie included). THE CUT TEST: a club is in
 *  the quarter only if this is <= the quarter's size, so a tie that straddles the line tags nobody. */
function atLeast(values, team, dir) {
  const v = values[team]
  if (v == null) return null
  return Object.values(values).filter((x) => (dir === 'most' ? x >= v : x <= v)).length
}
const inQuarter = (values, team, dir, q) => { const k = atLeast(values, team, dir); return k != null && k <= q }
const quarter = (n) => Math.max(1, Math.floor(n * TEAM_QUARTILE))
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i
const lastName = (full) => { const parts = String(full || '').trim().split(/\s+/).filter(Boolean); while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop(); return parts[parts.length - 1] || '' }
const POOL_MIN = 12   // a "quarter" of fewer clubs than this is not a quarter of the league

function dvpTagPair(matchup, team, slateSeason, kind) {
  const ds = defenseSeason(matchup, team, slateSeason)
  if (!ds) return []
  if (ds.current && ds.small) return []                 // under the floor with no last-season table to read: no tag
  const pool = seasonPool(matchup, ds.season)
  const stat = SUM_STAT[kind]
  const vals = {}
  for (const [t, roles] of Object.entries(pool)) { const v = sumRoles(roles, ROLES[kind], stat); if (v != null) vals[t] = v }
  const n = Object.keys(vals).length
  if (n < POOL_MIN || vals[team] == null) return []
  const q = quarter(n)
  const fewest = rankIn(vals, team, 'fewest')
  const most = rankIn(vals, team, 'most')
  const keyFew = kind === 'corners' ? 'strong_corners' : 'run_stuffers'
  const keyMost = kind === 'corners' ? 'weak_corners' : 'soft_vs_run'
  const which = inQuarter(vals, team, 'fewest', q) ? [keyFew, fewest, 'fewest'] : inQuarter(vals, team, 'most', q) ? [keyMost, most, 'most'] : null
  if (!which) return []
  const [key, rank, dir] = which
  const rule = TAG_RULES[key]
  const value = r1(vals[team])
  const sample = ds.current ? `${gamesWord(ds.games)} this season (${ds.season})` : `last season (${ds.season}), ${gamesWord(ds.games)}`
  const rankWord = dir === 'most' ? `the ${rank === 1 ? 'most' : `${ord(rank)} most`} of ${n}` : `the ${rank === 1 ? 'fewest' : `${ord(rank)} fewest`} of ${n}`
  let extra = ''
  if (kind === 'corners') {
    const cs = matchup?.pass_game?.corners?.[team]
    const cSeason = fin(matchup?.pass_game?.corner_season)
    if (Array.isArray(cs) && cs.length && (cSeason == null || cSeason === ds.season)) {
      const pd = cs.reduce((a, c) => a + (fin(c.pd) || 0), 0), ints = cs.reduce((a, c) => a + (fin(c.int) || 0), 0)
      extra = ` Its three starting corners (${cs.map((c) => lastName(c.name) || c.slot).join(', ')}) have ${pd} passes defended and ${ints} ${ints === 1 ? 'interception' : 'interceptions'} between them.`
    }
  }
  return [{
    key, side: 'team', word: rule.word, team, season: ds.season, games: ds.games, current: ds.current, value, rank, of: n, stat: rule.stat, dir,
    note: `${team} ${rule.word.toLowerCase()}: ${value} ${rule.stat.replace(' a game', '')} a game, ${rankWord} clubs (${sample}). The best and worst quarter of the clubs carry the tag (${q} of ${n}; a tie across that line carries none).${extra} It feeds the defense-versus-position line. ${TAIL}`,
  }]
}

function passRushTag(matchup, team, slateSeason) {
  const td = matchup?.team_defense
  const slate = fin(slateSeason) ?? fin(matchup?.slate_season) ?? fin(matchup?.season)
  const g = fin(td?.per_game?.[team]?.g)
  const tdSeason = fin(td?.season) ?? fin(matchup?.season)
  const mk = (key, rank, n, dir, value, sample, statNote, season, games, current) => {
    const rule = TAG_RULES[key]
    const rankWord = dir === 'most' ? `the ${rank === 1 ? 'most' : `${ord(rank)} most`} of ${n}` : `the ${rank === 1 ? 'fewest' : `${ord(rank)} fewest`} of ${n}`
    return [{
      key, side: 'team', word: rule.word, team, season, games, current, value, rank, of: n, stat: statNote, dir,
      note: `${team} ${rule.word.toLowerCase()}: ${statNote === 'sacks a game' ? `${value} sacks a game` : `it got to the quarterback on ${value}% of dropbacks`}, ${rankWord} clubs (${sample}). The best and worst quarter of the clubs carry the tag (${quarter(n)} of ${n}; a tie across that line carries none). It feeds the defense-versus-position line. ${TAIL}`,
    }]
  }
  // 1. THIS SEASON: sacks a game, for the clubs that cleared the games floor
  if (td?.per_game && g != null && g >= MIN_GAMES && (slate == null || tdSeason == null || tdSeason >= slate)) {
    const vals = {}
    for (const [t, r] of Object.entries(td.per_game)) if ((fin(r?.g) || 0) >= MIN_GAMES && fin(r?.def_sacks) != null) vals[t] = fin(r.def_sacks)
    const n = Object.keys(vals).length
    if (n >= POOL_MIN && vals[team] != null) {
      const q = quarter(n)
      const most = rankIn(vals, team, 'most'), few = rankIn(vals, team, 'fewest')
      const sample = `${gamesWord(g)} this season (${tdSeason ?? slate})`
      if (inQuarter(vals, team, 'most', q)) return mk('strong_pass_rush', most, n, 'most', r1(vals[team]), sample, 'sacks a game', tdSeason ?? slate, g, true)
      if (inQuarter(vals, team, 'fewest', q)) return mk('weak_pass_rush', few, n, 'fewest', r1(vals[team]), sample, 'sacks a game', tdSeason ?? slate, g, true)
    }
    return []
  }
  // 2. UNDER THE FLOOR: last season's pressure rate, labelled (the bot's disruption_team is a chart-season table)
  const chart = fin(matchup?.chart_season)
  const dt = matchup?.disruption_team
  if (dt && chart != null && slate != null && chart < slate) {
    const vals = {}
    for (const [t, r] of Object.entries(dt)) if ((fin(r?.pressure?.created_plays) || 0) >= PRESSURE_MIN_PLAYS && fin(r?.pressure?.created_pct) != null) vals[t] = fin(r.pressure.created_pct)
    const n = Object.keys(vals).length
    if (n >= POOL_MIN && vals[team] != null) {
      const q = quarter(n)
      const most = rankIn(vals, team, 'most'), few = rankIn(vals, team, 'fewest')
      const sample = `last season (${chart}), ${fin(dt[team]?.pressure?.created_plays)} pressure plays`
      if (inQuarter(vals, team, 'most', q)) return mk('strong_pass_rush', most, n, 'most', r1(vals[team]), sample, 'pressure rate', chart, null, false)
      if (inQuarter(vals, team, 'fewest', q)) return mk('weak_pass_rush', few, n, 'fewest', r1(vals[team]), sample, 'pressure rate', chart, null, false)
    }
  }
  return []
}

/** Tags for one DEFENCE (0 to 3): corners, pass rush, run defence, each only when it clears its quarter and its floor. */
export function teamTags(matchup, team, slateSeason = null) {
  if (!matchup || !team) return []
  return [
    ...dvpTagPair(matchup, team, slateSeason, 'corners'),
    ...passRushTag(matchup, team, slateSeason),
    ...dvpTagPair(matchup, team, slateSeason, 'run'),
  ]
}

// ── THE BOOK: everything a surface needs, built once per (matchup, turnovers) ─
// matchup -> turnovers -> slate season -> book; a null matchup / turnovers uses a shared sentinel object
const BOOKS = new WeakMap()
const NONE = {}
const slot = (map, key) => { let v = map.get(key); if (!v) { v = new WeakMap(); map.set(key, v) } return v }
/**
 * tagBook({ matchup, turnovers, slateSeason }) -> {
 *   team(code) -> tags for that defence,
 *   player(espnId, position?) -> tags for that man,
 *   row(p) -> { own, opp, all } for a slate row ({ espn_id, position, team, opp }),
 *   league, ready: { team, player }
 * }
 * `turnovers` = the /api/nfl/defense payload ({ season, players: { [espnId]: line }, ... }) or null while it loads.
 */
export function tagBook({ matchup = null, turnovers = null, slateSeason = null } = {}) {
  const bySeason = slot(slot(BOOKS, matchup || NONE), turnovers || NONE)
  const seasons = bySeason.get(NONE) || (bySeason.set(NONE, new Map()), bySeason.get(NONE))
  const memoKey = String(slateSeason ?? '')
  if (seasons.has(memoKey)) return seasons.get(memoKey)
  const teamCache = new Map()
  const playerCache = new Map()
  // box-score tags are THIS season's: a payload from another season than the slate's is not read (no mixing, no "last season" guess)
  const slateYear = fin(slateSeason) ?? fin(matchup?.slate_season) ?? fin(matchup?.season)
  const sameSeason = turnovers && (fin(turnovers.season) == null || slateYear == null || fin(turnovers.season) === slateYear)
  const lines = sameSeason ? turnovers?.players || {} : {}
  const league = (sameSeason && turnovers?.league) || leagueRates(Object.values(lines))
  const season = fin(turnovers?.season) ?? slateYear
  const team = (code) => {
    if (!code) return []
    if (!teamCache.has(code)) teamCache.set(code, teamTags(matchup, code, slateSeason))
    return teamCache.get(code)
  }
  const player = (espnId, position = null) => {
    if (espnId == null) return []
    const k = `${espnId}|${position || ''}`
    if (!playerCache.has(k)) playerCache.set(k, playerTags(lines[espnId], { season, league, position }))
    return playerCache.get(k)
  }
  const row = (p) => {
    const own = player(p?.espn_id, p?.position)
    const opp = team(p?.opp)
    return { own, opp, all: [...own, ...opp] }
  }
  const book = { team, player, row, league, season, ready: { team: Boolean(matchup), player: Boolean(sameSeason) } }
  seasons.set(memoKey, book)
  return book
}

/** The Tags filter's options over a list of slate rows: [{ key, label, count }] in registry order, only tags that exist. */
export function tagOptions(book, rows = []) {
  const n = {}
  for (const p of rows) for (const t of new Set(book.row(p).all.map((x) => x.key))) n[t] = (n[t] || 0) + 1
  return TAG_ORDER.filter((k) => n[k]).map((key) => ({ key, label: TAG_WORD[key], count: n[key] }))
}
/** Does a row carry this tag (on himself or the defence he faces)? 'all' / '' matches everyone. */
export const hasTag = (book, p, key) => (!key || key === 'all' ? true : book.row(p).all.some((t) => t.key === key))

/** The words a chip prints. A defence tag on a player's row names the club ("ATL weak corners"). */
export function chipText(tag, { onPlayerRow = false } = {}) {
  if (tag.side === 'team' && onPlayerRow) return `${tag.team} ${tag.word.toLowerCase()}`
  return tag.word
}
