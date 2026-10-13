// THE SITUATION STAMPS' DATA (server only; read-only; never throws). Builds the `ctx` lib/cards/situations.js reads, from REAL STORED / PUBLISHED data:
//   MLB  MLB StatsAPI /people/{id}?hydrate=stats(gameLog) (the season's regular-season game log + his birth date); when the game's day is not in that log, the
//        postseason log + career postseason line (/people/{id}/stats?stats=gameLog,career&gameType=P). Season totals are SUMMED FROM THE LOG, never read from
//        the homer feed (its season_hr is stale on some rows).
//   NHL  api-web.nhle.com /player/{id}/game-log/{season}/2 (and /3 when the day is a playoff game) + /player/{id}/landing (birth date); the playoff round's own name from the
//        night's /score (seriesStatus), when the league prints one.
//   NFL  the published game logs (nfl_logs.json: every game of the season) and the slate's birth_date (nfl_week.json).
// What is NOT stored anywhere today, so it is never stamped: a player's previous clubs (FORMER CLUB) and the games a returning player missed (RETURN FROM INJURY): the
// injury listing (lib/injuries) holds tonight's status only, with no history. Both rules exist in lib/cards/situations.js and print the day the data does.
// A stamp that cannot be proven comes back as no stamp: every failure, timeout or missing field gives an empty list.
import { stampsFor } from './situations'

const TTL = 10 * 60e3
const TIMEOUT = 3500
const _memo = new Map()
const ISO = /^\d{4}-\d{2}-\d{2}$/
const nn = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

async function jget(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

/** The NHL season id a game day belongs to: 20252026 for Sept 2025 to Aug 2026. */
export const nhlSeasonOf = (day) => { const y = Number(day.slice(0, 4)); const m = Number(day.slice(5, 7)); const a = m >= 9 ? y : y - 1; return Number(`${a}${a + 1}`) }

/** A season total from a log (newest first): the games BEFORE `day` (the total going into it), or through it with `through` (the total as of the card). null if a game lacks the stat. Pure. */
export function totalBefore(log, key, day, through = false) {
  let sum = 0
  for (const g of log) { if (through ? g.day <= day : g.day < day) { const v = nn(g[key]); if (v == null) return null; sum += v } }
  return sum
}

// ── MLB ──────────────────────────────────────────────────────────────────────
const MLB = 'https://statsapi.mlb.com/api/v1'
const mlbLogOf = (splits) => (splits || []).map((s) => ({ day: s.date, hr: nn(s.stat?.homeRuns), type: s.gameType || null })).filter((g) => ISO.test(String(g.day))).sort((a, b) => b.day.localeCompare(a.day))
export async function mlbCtx({ playerId, day, phase }) {
  const year = Number(day.slice(0, 4))
  const p = await jget(`${MLB}/people/${encodeURIComponent(playerId)}?hydrate=${encodeURIComponent(`stats(group=[hitting],type=[gameLog],season=${year})`)}`)
  const who = p?.people?.[0]
  if (!who) return null
  const ctx = { sport: 'mlb', day, phase, birth: who.birthDate || null }
  const reg = mlbLogOf(who.stats?.find((s) => s.type?.displayName === 'gameLog')?.splits)
  const inReg = reg.some((g) => g.day === day)
  if (inReg || phase === 'pre') {
    // a pregame card for a regular-season day, or a game already in the log
    ctx.log = reg.filter((g) => (phase === 'pre' ? g.day < day : g.day <= day))
    const before = totalBefore(reg, 'hr', day)
    const asOfCard = totalBefore(reg, 'hr', day, phase === 'post')   // a card about a game counts the game; a pregame card counts only what came before
    if (asOfCard != null && reg.length) ctx.totals = { stat: 'hr', before: asOfCard, asOf: day }
    if (phase === 'post' && inReg) {
      const thisGame = reg.find((g) => g.day === day)?.hr
      if (before != null && thisGame != null) ctx.firstOfSeason = { stat: 'hr', thisGame, before }
    }
  }
  if (!inReg) {
    // not a regular-season game of his log: ask for the postseason (the round, and his career postseason before the game)
    try {
      const post = await jget(`${MLB}/people/${encodeURIComponent(playerId)}/stats?stats=gameLog,career&group=hitting&gameType=P&season=${year}`)
      const logS = post?.stats?.find((s) => s.type?.displayName === 'gameLog')?.splits || []
      const game = logS.find((s) => s.date === day)
      if (game) {
        ctx.postseason = { type: game.gameType || 'P', roundName: '' }
        const careerHr = nn(post?.stats?.find((s) => s.type?.displayName === 'career')?.splits?.[0]?.stat?.homeRuns)
        const thisSeasonFrom = logS.filter((s) => s.date >= day).reduce((a, s) => a + (nn(s.stat?.homeRuns) || 0), 0)
        const thisGame = nn(game.stat?.homeRuns)
        // careerBefore = his career postseason HR minus every homer of this postseason from this game on (the career line is read now, so later games are inside it)
        if (careerHr != null && thisGame != null && phase === 'post') ctx.firstPostseason = { stat: 'hr', thisGame, careerBefore: Math.max(0, careerHr - thisSeasonFrom) }
      }
    } catch { /* no postseason read: no postseason stamps */ }
  }
  return ctx
}

// ── NHL ──────────────────────────────────────────────────────────────────────
const NHL = 'https://api-web.nhle.com/v1'
const nhlLogOf = (rows) => (rows || []).map((g) => ({ day: g.gameDate, goals: nn(g.goals), shots: nn(g.shots) })).filter((g) => ISO.test(String(g.day))).sort((a, b) => b.day.localeCompare(a.day))
export async function nhlCtx({ playerId, day, phase }) {
  const season = nhlSeasonOf(day)
  const [land, reg] = await Promise.all([
    jget(`${NHL}/player/${encodeURIComponent(playerId)}/landing`).catch(() => null),
    jget(`${NHL}/player/${encodeURIComponent(playerId)}/game-log/${season}/2`).catch(() => null),
  ])
  const ctx = { sport: 'nhl', day, phase, birth: land?.birthDate || null }
  const log = nhlLogOf(reg?.gameLog)
  const inReg = log.some((g) => g.day === day)
  if (inReg || phase === 'pre') {
    ctx.log = log.filter((g) => (phase === 'pre' ? g.day < day : g.day <= day))
    const before = totalBefore(log, 'goals', day)
    const asOfCard = totalBefore(log, 'goals', day, phase === 'post')
    if (asOfCard != null && log.length) ctx.totals = { stat: 'goals', before: asOfCard, asOf: day }
    if (phase === 'post' && inReg) {
      const thisGame = log.find((g) => g.day === day)?.goals
      if (before != null && thisGame != null) ctx.firstOfSeason = { stat: 'goals', thisGame, before }
    }
  }
  if (!inReg) {
    // a playoff game? The round's own name comes from the night's scoreboard (seriesStatus); no name, no stamp
    try {
      const po = await jget(`${NHL}/player/${encodeURIComponent(playerId)}/game-log/${season}/3`)
      if (nhlLogOf(po?.gameLog).some((g) => g.day === day)) {
        const score = await jget(`${NHL}/score/${day}`)
        const g = (score?.games || []).find((x) => x.seriesStatus && (x.homeTeam?.abbrev || x.awayTeam?.abbrev))
        const name = g?.seriesStatus?.seriesTitle || ''
        if (name) ctx.postseason = { type: 'P', roundName: name }
      }
    } catch { /* regular season, or the league did not answer: no postseason stamp */ }
  }
  return ctx
}

// ── NFL ──────────────────────────────────────────────────────────────────────
let _nfl = { at: 0, logs: null, born: null }
async function nflFiles() {
  if (_nfl.logs && Date.now() - _nfl.at < TTL) return _nfl
  const { fetchNfl, nflLogPaths, nflSlatePaths, nflSlateLooksReal } = await import('../nfl/dataSource')
  const [logs, week] = await Promise.all([fetchNfl(nflLogPaths()).catch(() => null), fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null)])
  _nfl = { at: Date.now(), logs, born: new Map((week?.players || []).map((p) => [String(p.player_id), p.birth_date || null])) }
  return _nfl
}
export async function nflCtx({ playerId, day, phase }) {
  const { logs, born } = await nflFiles()
  const v = logs?.logs?.[String(playerId)]
  const ctx = { sport: 'nfl', day, phase, birth: born?.get(String(playerId)) || null }
  const season = Number(day.slice(0, 4)) - (Number(day.slice(5, 7)) <= 2 ? 1 : 0)
  const log = (v?.log || []).filter((g) => nn(g.s) === season && ISO.test(String(g.d))).map((g) => ({ day: g.d, td: nn(g.g_td), rec_yds: nn(g.g_recyd), rush_yds: nn(g.g_ruyd) })).sort((a, b) => b.day.localeCompare(a.day))
  const inLog = log.some((g) => g.day === day)
  if (log.length && (inLog || phase === 'pre')) {
    ctx.log = log.filter((g) => (phase === 'pre' ? g.day < day : g.day <= day))
    const before = totalBefore(log, 'td', day)
    const asOfCard = totalBefore(log, 'td', day, phase === 'post')
    if (asOfCard != null) ctx.totals = { stat: 'td', before: asOfCard, asOf: day }
    if (phase === 'post' && inLog) {
      const thisGame = log.find((g) => g.day === day)?.td
      if (before != null && thisGame != null) ctx.firstOfSeason = { stat: 'td', thisGame, before }
    }
  }
  return ctx
}

const LOADERS = { mlb: mlbCtx, nhl: nhlCtx, nfl: nflCtx }

/**
 * The stamps of one card: [{ key, label, text, explain }] (at most 2), or [] when nothing is provable. `phase` 'pre' for the pregame player front, 'post' (default)
 * for a card about a game that was played. Kept ten minutes per player and day. Never throws.
 */
export async function stampsForCard({ sport, playerId, day, opp = '', phase = 'post' }) {
  try {
    const load = LOADERS[sport]
    if (!load || !playerId || !ISO.test(String(day || ''))) return []
    const k = `${sport}:${playerId}:${day}:${phase}`
    const hit = _memo.get(k)
    if (hit && Date.now() - hit.at < TTL) return hit.v
    const ctx = await load({ playerId: String(playerId), day, phase })
    const v = ctx ? stampsFor({ ...ctx, opp }) : []
    if (_memo.size > 400) _memo.clear()
    _memo.set(k, { at: Date.now(), v })
    return v
  } catch (e) {
    console.error(`[stamps] ${sport}/${playerId}/${day}: ${e?.message || e}`)
    return []
  }
}
