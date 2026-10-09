// BUCKETS' NIGHT (BATCH-BUCKETS B3, 2026-10-02). Server only. One date ->
// every game, both active rosters (anyone ESPN lists OUT is never scored),
// the starters once the pre-tip box score lists them, each player's pooled
// legs (lib/nba/stats.js, this season + last), and all six markets scored on
// the shared core (lib/nba/model.js). What the admin page previews and what
// the tick locks are the same rows.
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox, rosterFor, injuriesNow, startersFor } from './api'
import { seasonStats } from './stats'
import { legsFor, scoreMarket, scoreShadow, NBA_MARKETS, NBA_SHADOWS } from './model'
import { ddtdLegs } from './ddtd'
import { ddtdSummaries } from './ddtdRead'

/** The season a game belongs to, from the schedule (rule 44): ESPN's year (2027 = 2026-27). */
const seasonsOf = (games) => {
  const cur = Math.max(...games.map((g) => g.seasonYear).filter(Number.isFinite))
  return { cur, prev: cur - 1 }
}

export async function buildNbaNight(date) {
  const games = reduceScoreboard(await scoreboardFor(date)).filter((g) => g.seasonType === 1 || g.seasonType === 2 || g.seasonType === 3)
  if (!games.length) return { date, games: [], markets: {}, note: 'no NBA games on this date' }
  const { cur, prev } = seasonsOf(games)
  const [S, P, inj] = await Promise.all([seasonStats(cur), seasonStats(prev), injuriesNow().catch(() => null)])
  // WHAT COULDN'T BE READ IS SAID, NOT SWALLOWED (2026-10-05 scan): a failed injury report or an empty
  // roster used to become 'nobody is out' / 'this club has no players' and still lock. The reads still
  // degrade for a preview, but the night carries the gaps and the tick will not lock a game that has one.
  const gaps = []
  const injuriesOk = Boolean(inj)
  // OUT is never scored (injury report); questionable / day-to-day are scored, flagged
  const status = new Map()
  for (const t of inj?.injuries || []) for (const x of t.injuries || []) status.set(String(x.athlete?.id || ''), String(x.status || x.type?.description || '').toLowerCase())
  // league 3P%: the fallback for a player under 30 attempts (said so on his row)
  let made = 0, att = 0
  for (const a of P.athletes.values()) { made += a.tpTot || 0; att += a.tpaTot || 0 }
  const leagueTpPct = att ? made / att : null
  const teamAllow = (abbrev) => S.teams.get(abbrev)?.oppPts != null ? S.teams.get(abbrev) : P.teams.get(abbrev) || null
  const teamFga = (abbrev) => S.teams.get(abbrev)?.ownFga ?? P.teams.get(abbrev)?.ownFga ?? null

  const candidates = []
  for (const g of games) {
    const pre = await summaryFor(g.id).then(reduceBox).catch(() => [])
    const starters = new Set(pre.filter((b) => b.starter).map((b) => String(b.id)))
    // the announced lineups (core roster `starter`), the box's only once it has them
    for (const side of ['away', 'home']) for (const id of await startersFor(g.id, g[side].id).catch(() => new Set())) starters.add(id)
    for (const [side, other] of [['away', 'home'], ['home', 'away']]) {
      const t = g[side], o = g[other]
      const roster = await rosterFor(t.id).then((j) => j?.athletes || []).catch(() => [])
      if (!roster.length) gaps.push({ gameId: g.id, why: `${t.abbrev} roster unread` })
      for (const a of roster) {
        const id = String(a.id), st = status.get(id) || ''
        const out = /\bout\b/.test(st)
        candidates.push({
          gameId: g.id, playerId: id, name: a.displayName, pos: a.position?.abbreviation || null,
          team: t.abbrev, opp: o.abbrev, home: side === 'home', start: g.start, starter: starters.has(id),
          injury: st || null,
          legs: out ? { ok: false, reason: `listed OUT (${st})` } : legsFor(S.athletes.get(id), P.athletes.get(id), teamAllow(o.abbrev), { leagueTpPct, teamFga: teamFga(t.abbrev) }),
        })
      }
    }
  }
  // DOUBLE-DOUBLE / TRIPLE-DOUBLE (2026-10-09): their legs are rates from each man's game log (lib/nba/ddtd.js), carried on
  // their own copy of the candidates so the other markets' locked rows keep exactly the legs they always had.
  // A log that could not be read puts its game in logGaps: the tick locks everything else and retries these two next run.
  let sums = new Map()
  try { sums = await ddtdSummaries(candidates, { cur, prev }) } catch (e) { console.error(`[buckets] dd/td logs: ${e?.message}`) }
  const logGaps = new Set()
  const ddCandidates = candidates.map((c) => {
    const r = sums.get(c.playerId)
    const legs = ddtdLegs(c.legs, r?.summary || null, { readFailed: Boolean(r?.failed) })
    if (legs.unread) logGaps.add(c.gameId)
    return { ...c, legs }
  })
  const markets = Object.fromEntries(Object.entries(NBA_MARKETS).map(([m, M]) => [m, scoreMarket(m, M.needsLog ? ddCandidates : candidates)]))
  // shadows ride the same candidates; a failure costs the shadow, never the board
  let shadows = {}
  try { shadows = Object.fromEntries(Object.keys(NBA_SHADOWS).map((k) => [k, scoreShadow(k, candidates)])) } catch (e) { console.error(`[buckets] shadow scoring: ${e?.message}`) }
  return { date, season: cur, prevSeason: prev, gaps, logGaps: [...logGaps], injuriesOk, games, lineupsKnown: games.filter((g) => candidates.some((c) => c.gameId === g.id && c.starter)).map((g) => g.id), leagueTpPct, markets, shadows }
}
