// 🏆 LAMP'S STANLEY CUP ODDS (2026-10-20, Donovan: futures for every sport, "models being ran" like MLB's October odds). Server only.
// BUCKETS' title odds (lib/nba/titleSim.js) for hockey, in the same file contract (lib/championship.js), so the shared panel
// (ChampionshipFold -> PennantRace) draws it with no sport branch:
//   1. every club's projected goals against every other club are LAMP's team model (lib/nhl/teamProj.js, lamp-team-v1: shots x
//      xG a shot x the opposing defence x the opposing goalie + empty-net goals, on each club's last 82 club-game rows) -- the
//      same number behind the Slate's projected totals
//   2. THE MISS, MEASURED on last season: every game the model could rate (both clubs 20+ games in their window, the window
//      strictly before the game's own date) -> the regulation margin (an overtime or shootout game is 0 after 60 minutes) minus
//      the model's margin. Its mean is home ice (the team model has none); its spread is how far real games land from the model.
//      The share of games that went past regulation and the home club's share of those are measured the same way.
//   3. every remaining regular-season game on the league's schedule: regulation margin = model margin + home ice + a normal miss;
//      inside the band that matches last season's overtime share it goes to overtime (the loser keeps a point), the winner drawn
//      at last season's home share. 2 points a win, 1 for an overtime or shootout loss.
//   4. the league's format: the top three in each division and two wild cards a conference; the division winner with more points
//      meets the second wild card; four best-of-seven rounds, home ice to the club with more points (2-2-1-1-1).
// 10,000 seasons. Shares 0-1. It knows shots, shot quality and goaltending; it does NOT know trades, injuries, who starts in net
// tonight or back-to-backs, and the method line says so.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../supabase/admin'
import { nhlGet } from './api'
import { reduceClubSchedule } from './reduce'
import { NHL_TEAMS, NHL_DIVISIONS } from './teams'
import MODEL from './teamProjV1'
import { projectGame, projectTeam, windowOf } from './teamProj'
import { bestOfSeven, invPhi, meanSd, phi, pool, rng, shareOf } from '../titleSimCore'

export const TITLE_MODEL_VERSION = 'nhl-title-v1'
export const TITLE_SIMS = 10000
const MIN_WINDOW = 20   // games a club needs in its window before its game counts toward the measured miss

/** { [abbrev]: reduced games } every regular-season game of one season (20262027), finished or not. */
async function seasonPack(seasonId) {
  const per = await pool(NHL_TEAMS, 6, async ([abbrev]) => {
    const j = await nhlGet(`/club-schedule-season/${abbrev}/${seasonId}`, 3600).catch(() => null)
    return [abbrev, j ? reduceClubSchedule(j, abbrev).games.filter((g) => g.gameType === 2) : null]
  })
  if (per.filter(([, r]) => r == null).length > 3) throw new Error(`club schedules ${seasonId}: too many clubs unread`)
  return Object.fromEntries(per.map(([a, r]) => [a, r || []]))
}

/** Each game once (it sits on both clubs' schedules), from the home club's side: { id, date, state, scheduleState, outcome, h, a, hs, as }. */
function eachGame(pack) {
  const seen = new Set(); const out = []
  for (const games of Object.values(pack)) for (const g of games) {
    const H = g.home ? g.us : g.opponent, A = g.home ? g.opponent : g.us   // reduceClubSchedule: `home` is "this club is at home"
    if (seen.has(g.id) || !H?.abbrev || !A?.abbrev) continue
    seen.add(g.id)
    out.push({ id: g.id, date: g.date, state: g.state, scheduleState: g.scheduleState, outcome: g.outcome, h: H.abbrev, a: A.abbrev, hs: H.score, as: A.score })
  }
  return out
}

/** Every club's regular-season club-game rows (lamp_team_game_xg) since `from`, oldest first. */
async function readClubRows(from) {
  const db = adminClient()
  if (!db) throw new Error('no database')
  const out = {}
  await Promise.all(NHL_TEAMS.map(async ([c]) => {
    const { data, error } = await db.from('lamp_team_game_xg').select('game_id,team,game_date,game_type,gf,ga,sog,xg,sog_a,xg_a,goalies')
      .eq('team', c).eq('game_type', 2).gte('game_date', from).order('game_date', { ascending: true }).limit(400)
    if (error) throw new Error(error.message)
    out[c] = data || []
  }))
  return out
}

/** The empty file (readChampionship reads it as "no odds"): no regular-season games left to simulate. */
const idleFile = (seasonId, now) => ({ schema: 1, season: seasonId % 10000, as_of: now.toISOString(), sims: 0, model_version: TITLE_MODEL_VERSION, method: '', note: 'No regular-season games left to simulate.', teams: [] })

const isFinal = (g) => g.state === 'final' && g.hs != null && g.as != null

/** Build the Cup-odds file for one season (seasonId 20262027; `season` in the file is its end year, 2027). */
export async function buildTitleOdds(seasonId, now = new Date()) {
  const prevId = seasonId - 10001
  const startYear = Math.floor(prevId / 10000)
  const [cur, prev, rows] = await Promise.all([seasonPack(seasonId), seasonPack(prevId), readClubRows(`${startYear}-07-01`)])
  const clubs = NHL_TEAMS.map((t) => t[0])
  // nothing left to play (the playoffs, the summer, a schedule not out yet): the sim does not know the playoff results, so the
  // file is empty and the panel is not drawn -- never a bracket replayed over the real one, never coin flips over 0-0 records
  if (!eachGame(cur).some((g) => g.state !== 'final' && g.scheduleState !== 'CNCL')) return idleFile(seasonId, now)

  // THE MISS, MEASURED on last season's finals, each against the model as it stood the day before
  const misses = []; let ot = 0, otHome = 0
  for (const g of eachGame(prev).filter(isFinal)) {
    const { h, a } = g
    if (!rows[h] || !rows[a] || windowOf(rows[h], g.date).length < MIN_WINDOW || windowOf(rows[a], g.date).length < MIN_WINDOW) continue
    const p = projectGame({ home: h, away: a }, rows, g.date)
    const past = g.outcome === 'OT' || g.outcome === 'SO'
    if (past) { ot++; if (g.hs > g.as) otHome++ }
    misses.push((past ? 0 : g.hs - g.as) - (p.home.goals - p.away.goals))
  }
  if (misses.length < 500) throw new Error(`too few games to measure the miss (${misses.length})`)
  const { mu, sd } = meanSd(misses)
  const otRate = ot / misses.length, otHomeShare = ot ? otHome / ot : 0.5
  const band = sd * invPhi((1 + otRate) / 2)   // a regulation margin inside +-band is a tie after 60 minutes

  // today's ratings: each club's window as of tomorrow (every finished game in), every pairing once
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
  const win = Object.fromEntries(clubs.map((c) => [c, windowOf(rows[c], tomorrow)]))
  if (clubs.filter((c) => win[c].length < MIN_WINDOW).length > 2) throw new Error('too many clubs without a window')
  const G = {}
  for (const h of clubs) { G[h] = {}; for (const a of clubs) if (a !== h) G[h][a] = projectTeam(win[h], win[a]).goals }
  // a game at h: regulation margin ~ N(m, sd), m = model margin + home ice
  const P = new Map()
  const probs = (h, a) => {
    const k = `${h}|${a}`
    if (!P.has(k)) {
      const m = G[h][a] - G[a][h] + mu
      const reg = 1 - phi((band - m) / sd), tie = phi((band - m) / sd) - phi((-band - m) / sd)
      P.set(k, { reg, tie, win: reg + tie * otHomeShare })
    }
    return P.get(k)
  }

  // the record so far and every game left
  const W0 = {}, L0 = {}, O0 = {}
  for (const c of clubs) {
    const f = (cur[c] || []).filter((g) => g.state === 'final' && g.result)
    W0[c] = f.filter((g) => g.result === 'W').length; L0[c] = f.filter((g) => g.result === 'L').length; O0[c] = f.length - W0[c] - L0[c]
  }
  const left = eachGame(cur).filter((g) => g.state !== 'final' && g.scheduleState !== 'CNCL' && G[g.h] && G[g.a])
    .map((g) => [g.h, g.a, probs(g.h, g.a)])

  const conf = Object.fromEntries(NHL_TEAMS.map((t) => [t[0], t[4]]))
  const div = Object.fromEntries(NHL_TEAMS.map((t) => [t[0], t[5]]))
  const z = () => Object.fromEntries(clubs.map((c) => [c, 0]))
  const tally = { make_playoffs: z(), top_seed: z(), win_division: z(), win_round1: z(), win_round2: z(), win_round3: z(), win_champion: z(), wins: z(), points: z() }
  const seedCount = Object.fromEntries(clubs.map((c) => [c, {}]))
  const R = rng(20261020)
  const game = (h, a) => (R() < probs(h, a).win ? h : a)
  for (let s = 0; s < TITLE_SIMS; s++) {
    const W = { ...W0 }, O = { ...O0 }
    for (const [h, a, p] of left) {
      const u = R()
      if (u < p.reg) W[h]++
      else if (u < p.reg + p.tie) { if (R() < otHomeShare) { W[h]++; O[a]++ } else { W[a]++; O[h]++ } }
      else W[a]++
    }
    const pts = Object.fromEntries(clubs.map((c) => [c, 2 * W[c] + O[c] + R() * 0.5]))   // a tie on points: a coin flip
    const byPts = (list) => list.slice().sort((x, y) => pts[y] - pts[x])
    const better = (x, y) => (pts[x] >= pts[y] ? [x, y] : [y, x])
    const champsOf = {}
    for (const cf of ['E', 'W']) {
      const o = byPts(clubs.filter((c) => conf[c] === cf))
      o.forEach((c, i) => { seedCount[c][i + 1] = (seedCount[c][i + 1] || 0) + 1 })
      tally.top_seed[o[0]]++
      const tops = NHL_DIVISIONS[cf].map((d) => o.filter((c) => div[c] === d).slice(0, 3))
      const wc = o.filter((c) => !tops.flat().includes(c)).slice(0, 2)
      for (const c of [...tops.flat(), ...wc]) tally.make_playoffs[c]++
      for (const t of tops) tally.win_division[t[0]]++
      // the division winner with more points meets the second wild card
      const firstIsBest = pts[tops[0][0]] >= pts[tops[1][0]]
      const brackets = tops.map((t, i) => [[t[0], (i === 0) === firstIsBest ? wc[1] : wc[0]], [t[1], t[2]]])
      const finalists = brackets.map((b) => {
        const r1 = b.map(([x, y]) => bestOfSeven(...better(x, y), game))
        r1.forEach((c) => tally.win_round1[c]++)
        const r2 = bestOfSeven(...better(r1[0], r1[1]), game)
        tally.win_round2[r2]++
        return r2
      })
      champsOf[cf] = bestOfSeven(...better(finalists[0], finalists[1]), game)
      tally.win_round3[champsOf[cf]]++
    }
    tally.win_champion[bestOfSeven(...better(champsOf.E, champsOf.W), game)]++
    for (const c of clubs) { tally.wins[c] += W[c]; tally.points[c] += 2 * W[c] + O[c] }
  }
  const sh = (n) => shareOf(n, TITLE_SIMS)
  const r1 = (v) => Math.round(v * 10) / 10
  const teams = NHL_TEAMS.map(([abbrev, id, place, nick, cf, dv]) => ({
    team_id: id, abbr: abbrev, name: `${place} ${nick}`, conference: cf === 'E' ? 'East' : 'West', division: dv,
    wins: W0[abbrev], losses: L0[abbrev], otl: O0[abbrev],
    // goal margin a game against an average club (the team model, both ways, home ice left out)
    strength: Math.round((clubs.filter((o) => o !== abbrev).reduce((t, o) => t + G[abbrev][o] - G[o][abbrev], 0) / (clubs.length - 1)) * 100) / 100,
    proj_wins: r1(tally.wins[abbrev] / TITLE_SIMS), proj_points: r1(tally.points[abbrev] / TITLE_SIMS),
    make_playoffs: sh(tally.make_playoffs[abbrev]), win_division: sh(tally.win_division[abbrev]), top_seed: sh(tally.top_seed[abbrev]),
    seeds: Object.fromEntries(Object.entries(seedCount[abbrev]).map(([k, v]) => [k, sh(v)])),
    win_round1: sh(tally.win_round1[abbrev]), win_round2: sh(tally.win_round2[abbrev]), win_round3: sh(tally.win_round3[abbrev]),
    win_round4: sh(tally.win_champion[abbrev]), win_champion: sh(tally.win_champion[abbrev]),
  })).sort((a, b) => b.win_champion - a.win_champion || b.proj_points - a.proj_points)
  const played = eachGame(cur).filter(isFinal).length
  return {
    schema: 1, season: seasonId % 10000, as_of: now.toISOString(), sims: TITLE_SIMS, model_version: TITLE_MODEL_VERSION,
    method: `Every remaining regular-season game played ${TITLE_SIMS.toLocaleString('en-US')} times from LAMP's team model (shots, shot quality and goaltending over each club's last 82 games), each result missing the model's margin by as much as real games did last season (${sd.toFixed(2)} goals, home ice ${mu >= 0 ? '+' : ''}${mu.toFixed(2)}, ${Math.round(otRate * 100)}% to overtime, measured on ${misses.length.toLocaleString('en-US')} games); then three division spots and two wild cards a conference and four best-of-seven rounds.`,
    note: played < 200 ? `${played} games played: most of each club's window is last season. Trades, injuries and who starts in net are not in it.` : 'Trades, injuries and who starts in net move a club only once its own games do.',
    model: MODEL.version, miss_mean: Math.round(mu * 100) / 100, miss_sd: Math.round(sd * 100) / 100, ot_rate: Math.round(otRate * 1000) / 1000,
    ot_home_share: Math.round(otHomeShare * 1000) / 1000, games_measured: misses.length, games_left: left.length,
    teams,
  }
}

/** The season id that should be current on an ET day: from August on, the season that starts that fall. */
export function seasonIdFor(day) {
  const [y, m] = day.split('-').map(Number)
  const start = m >= 8 ? y : y - 1
  return start * 10000 + start + 1
}

/** Cached six hours per season and day: the table moves with results, a few times a day at most. */
export function readTitleOdds(seasonId, day) {
  return unstable_cache(() => buildTitleOdds(seasonId), ['nhl-title-odds-v1', String(seasonId), String(day)], { revalidate: 21600 })()
}
