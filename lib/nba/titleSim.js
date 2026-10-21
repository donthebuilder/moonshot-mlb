// 🏆 BUCKETS' TITLE ODDS (2026-10-20, Donovan: "for all of the sports we need the futures bets ... who's gonna win the championship"). Server only.
// MOONSHOT's October odds (bots/playoff_odds.py) for basketball, written to the same file contract (lib/championship.js) so the shared
// Title odds panel (ChampionshipFold -> PennantRace) draws it with no sport branch:
//   1. every club's rating is BUCKETS' team model (lib/nba/teamModel.js clubLine): this season's points for / against shrunk toward
//      30% of last season's gap from the league mean -- the same line the Slate's expected points use
//   2. every remaining regular-season game on the league's schedule is played: the home club's margin is the model's projected
//      margin (projectGame, home edge included), the result is that margin plus a normal miss whose spread is MEASURED -- the
//      standard deviation of (real margin - projected margin) over last season's games
//   3. seeds by record per conference (ties: a coin flip), the play-in (7 v 8, 9 v 10, then the 7/8 loser v the 9/10 winner), four
//      best-of-seven rounds, home court to the better record (2-2-1-1-1), each game drawn the same way
// 10,000 seasons. Shares 0-1, counts of simulated seasons. It knows each club's points scored and allowed; it does NOT know trades,
// signings, injuries or minutes -- on opening night that is most of what changed since last season, and the method line says so.
import { unstable_cache } from 'next/cache'
import { clubResultsFor, reduceTeamSchedule } from './api'
import { NBA_TEAMS } from './teams'
import { averageOf, clubLine, leagueMean, projectGame } from './teamModel'

export const TITLE_MODEL_VERSION = 'nba-title-v2'   // v2 (2026-10-20 audit): the two NBA Cup-set games a club has no schedule line for yet are played
export const NBA_SEASON_GAMES = 82
export const TITLE_SIMS = 10000

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}

/** { [abbrev]: [{ id, date, home, opp, state, us, them }] } every regular-season game of one season, finished or not. */
async function seasonPack(season) {
  const per = await pool(NBA_TEAMS, 6, async ([abbrev, id]) => {
    const j = await clubResultsFor(id, season).catch(() => null)
    if (!j) return [abbrev, null]
    return [abbrev, reduceTeamSchedule(j, abbrev).filter((g) => g.seasonType !== 3).map((g) => ({ ...g, date: String(g.start || '').slice(0, 10) }))]
  })
  if (per.filter(([, r]) => r == null).length > 3) throw new Error(`club schedules ${season}: too many clubs unread`)
  return Object.fromEntries(per.map(([a, r]) => [a, r || []]))
}

// a fast seeded generator (mulberry32) and a normal draw: the same seed gives the same table
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)) }
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2))

const finals = (rows) => (rows || []).filter((g) => g.state === 'final' && g.us != null && g.them != null)

/** Build the title-odds file for one season (the season's end year: 2027 for 2026-27). */
export async function buildTitleOdds(season, now = new Date()) {
  const [cur, prev] = await Promise.all([seasonPack(season), seasonPack(season - 1)])
  const prevAll = Object.values(prev).flatMap(finals)
  const prevMean = prevAll.length >= 300 ? prevAll.reduce((t, g) => t + g.us, 0) / prevAll.length : null
  const curAll = Object.values(cur).flatMap(finals)
  const L = leagueMean(curAll.length, curAll.reduce((t, g) => t + g.us, 0), prevMean)
  if (L == null) throw new Error('no league mean')
  const lines = {}
  for (const [abbrev] of NBA_TEAMS) lines[abbrev] = clubLine(finals(cur[abbrev]), finals(prev[abbrev]).length >= 20 ? averageOf(finals(prev[abbrev])) : null, L)
  if (Object.values(lines).some((l) => !l)) throw new Error('a club has no line')

  // THE MISS, MEASURED: last season's home games against the model's margin from each club's full last-season line
  const prevLines = {}
  for (const [abbrev] of NBA_TEAMS) { const a = averageOf(finals(prev[abbrev])); prevLines[abbrev] = a ? { ...a, basis: 'this season' } : null }
  const misses = []
  for (const [abbrev] of NBA_TEAMS) for (const g of finals(prev[abbrev])) {
    if (!g.home || !prevLines[abbrev] || !prevLines[g.opp]) continue
    const p = projectGame({ home: prevLines[abbrev], away: prevLines[g.opp], L: prevMean })
    if (p) misses.push((g.us - g.them) - (p.home - p.away))
  }
  if (misses.length < 500) throw new Error('too few games to measure the miss')
  const mu = misses.reduce((t, x) => t + x, 0) / misses.length
  const sd = Math.sqrt(misses.reduce((t, x) => t + (x - mu) ** 2, 0) / (misses.length - 1))
  const pHome = (home, away) => { const p = projectGame({ home: lines[home], away: lines[away], L }); return phi((p.home - p.away) / sd) }

  // the record so far and every game left, once (each game sits on both clubs' schedules)
  const conf = Object.fromEntries(NBA_TEAMS.map((t) => [t[0], t[4]]))
  const wins0 = {}, losses0 = {}
  for (const [abbrev] of NBA_TEAMS) { const f = finals(cur[abbrev]); wins0[abbrev] = f.filter((g) => g.us > g.them).length; losses0[abbrev] = f.length - wins0[abbrev] }
  const seen = new Set(); const left = []
  for (const [abbrev] of NBA_TEAMS) for (const g of cur[abbrev] || []) {
    if (g.state === 'final' || g.state === 'postponed' || g.state === 'canceled' || !g.home || !lines[g.opp] || seen.has(g.id)) continue
    seen.add(g.id); left.push([abbrev, g.opp, pHome(abbrev, g.opp)])
  }
  // THE GAMES NOT ON THE SCHEDULE YET (audit 2026-10-20). The league posts 80 of every club's 82 at the start; the last two are set
  // by the NBA Cup group stage in December (one home, one away), so the schedule had 1,200 of 1,230 games and every club played 80.
  // Until a club's two are posted, each is played against an AVERAGE club of its own conference (the mean of the model's chance
  // against each of them, at home or away). It moves only that club's wins. Once the league posts them they are ordinary games above.
  const fill = []
  for (const [abbrev] of NBA_TEAMS) {
    const sched = (cur[abbrev] || []).filter((g) => g.state !== 'canceled')
    const missing = NBA_SEASON_GAMES - sched.length
    if (missing <= 0) continue
    const opps = NBA_TEAMS.map((t) => t[0]).filter((o) => o !== abbrev && conf[o] === conf[abbrev] && lines[o])
    const pAtHome = opps.reduce((t, o) => t + pHome(abbrev, o), 0) / opps.length
    const pAway = opps.reduce((t, o) => t + (1 - pHome(o, abbrev)), 0) / opps.length
    const homeMissing = Math.max(0, Math.min(missing, NBA_SEASON_GAMES / 2 - sched.filter((g) => g.home).length))
    for (let i = 0; i < missing; i++) fill.push([abbrev, i < homeMissing ? pAtHome : pAway])
  }

  const clubs = NBA_TEAMS.map((t) => t[0])
  const z = () => Object.fromEntries(clubs.map((c) => [c, 0]))
  const tally = { make_playoffs: z(), top_seed: z(), win_division: z(), win_round1: z(), win_round2: z(), win_round3: z(), win_champion: z(), playin: z(), wins: z() }
  const seedCount = Object.fromEntries(clubs.map((c) => [c, {}]))
  const div = Object.fromEntries(NBA_TEAMS.map((t) => [t[0], t[5]]))
  const R = rng(20261020)
  // a game between hi (home) and lo: hi wins with pHome(hi, lo)
  const P = new Map()
  const pOf = (h, a) => { const k = `${h}|${a}`; if (!P.has(k)) P.set(k, pHome(h, a)); return P.get(k) }
  const game = (h, a) => (R() < pOf(h, a) ? h : a)
  const series = (hi, lo) => {   // hi has home court: games 1, 2, 5, 7 at home
    let w = 0, l = 0, n = 0
    while (w < 4 && l < 4) { const home = [0, 1, 4, 6].includes(n) ? hi : lo; const away = home === hi ? lo : hi; if (game(home, away) === hi) w++; else l++; n++ }
    return w === 4 ? hi : lo
  }
  for (let s = 0; s < TITLE_SIMS; s++) {
    const W = { ...wins0 }
    for (const [h, a, p] of left) { if (R() < p) W[h]++; else W[a]++ }
    for (const [c, p] of fill) if (R() < p) W[c]++
    const order = (cf) => clubs.filter((c) => conf[c] === cf).map((c) => [c, W[c] + R() * 0.5]).sort((x, y) => y[1] - x[1]).map(([c]) => c)
    const champsOf = {}
    for (const cf of ['E', 'W']) {
      const o = order(cf)
      o.forEach((c, i) => { seedCount[c][i + 1] = (seedCount[c][i + 1] || 0) + 1 })
      tally.top_seed[o[0]]++
      for (const d of new Set(o.map((c) => div[c]))) tally.win_division[o.find((c) => div[c] === d)]++
      for (const c of o.slice(6, 10)) tally.playin[c]++
      const w78 = game(o[6], o[7]); const l78 = w78 === o[6] ? o[7] : o[6]
      const w910 = game(o[8], o[9])
      const s8 = game(l78, w910)
      const seeds = [o[0], o[1], o[2], o[3], o[4], o[5], w78, s8]
      for (const c of seeds) tally.make_playoffs[c]++
      const better = (x, y) => (W[x] > W[y] || (W[x] === W[y] && seeds.indexOf(x) < seeds.indexOf(y)) ? [x, y] : [y, x])
      const r1 = [[0, 7], [3, 4], [2, 5], [1, 6]].map(([i, j]) => series(...better(seeds[i], seeds[j])))
      r1.forEach((c) => tally.win_round1[c]++)
      const r2 = [series(...better(r1[0], r1[1])), series(...better(r1[2], r1[3]))]
      r2.forEach((c) => tally.win_round2[c]++)
      const cfChamp = series(...better(r2[0], r2[1]))
      tally.win_round3[cfChamp]++
      champsOf[cf] = cfChamp
    }
    const [hi, lo] = W[champsOf.E] >= W[champsOf.W] ? [champsOf.E, champsOf.W] : [champsOf.W, champsOf.E]
    tally.win_champion[series(hi, lo)]++
    for (const c of clubs) tally.wins[c] += W[c]
  }
  const sh = (n) => Math.round((n / TITLE_SIMS) * 10000) / 10000
  const teams = NBA_TEAMS.map(([abbrev, id, place, nick, cf, dv]) => ({
    team_id: id, abbr: abbrev, name: `${place} ${nick}`, conference: cf === 'E' ? 'East' : 'West', division: dv,
    wins: wins0[abbrev], losses: losses0[abbrev],
    strength: Math.round((lines[abbrev].pf - lines[abbrev].pa) * 10) / 10,
    proj_wins: Math.round((tally.wins[abbrev] / TITLE_SIMS) * 10) / 10,
    make_playoffs: sh(tally.make_playoffs[abbrev]), win_division: sh(tally.win_division[abbrev]), top_seed: sh(tally.top_seed[abbrev]),
    seeds: Object.fromEntries(Object.entries(seedCount[abbrev]).map(([k, v]) => [k, sh(v)])),
    play_in: sh(tally.playin[abbrev]),
    win_round1: sh(tally.win_round1[abbrev]), win_round2: sh(tally.win_round2[abbrev]), win_round3: sh(tally.win_round3[abbrev]),
    win_round4: sh(tally.win_champion[abbrev]), win_champion: sh(tally.win_champion[abbrev]),
  })).sort((a, b) => b.win_champion - a.win_champion || b.proj_wins - a.proj_wins)
  const played = curAll.length / 2
  return {
    schema: 1, season, as_of: now.toISOString(), sims: TITLE_SIMS, model_version: TITLE_MODEL_VERSION,
    method: `Every remaining regular-season game played ${TITLE_SIMS.toLocaleString('en-US')} times from BUCKETS' team model (points scored and allowed, this season leaning on last season's until the games pile up), each result missing the projected margin by as much as real games did last season (${sd.toFixed(1)} points, measured on ${misses.length.toLocaleString('en-US')} games)${fill.length ? `; each club's ${fill.length === 2 * NBA_TEAMS.length ? 'two games' : 'games'} the NBA Cup sets later are played against an average club of its conference` : ''}; then the play-in and four best-of-seven rounds.`,
    note: played < 100 ? `${Math.round(played)} games played: the ratings are mostly last season's numbers. Trades, signings and injuries since then are not in them.` : 'Trades, signings and injuries move a club only once its own results do.',
    league_mean: Math.round(L * 10) / 10, miss_sd: Math.round(sd * 10) / 10, games_left: left.length + Math.round(fill.length / 2), games_unscheduled: Math.round(fill.length / 2),
    teams,
  }
}

/** Cached six hours per season and day: the table moves with results, a few times a day at most. */
export function readTitleOdds(season, day) {
  return unstable_cache(() => buildTitleOdds(season), ['nba-title-odds-v2', String(season), String(day)], { revalidate: 21600 })()
}
