// 🏅 MOONSHOT'S AWARD RACES, LIVE (2026-10-20). Server only. The model is lib/mlb/awardModel.js (fitted on 2012-2025 BBWAA
// voting); this file feeds it the MLB Stats API's season lines and writes the shared award-race file (lib/awards.js) that
// Leaders draws. Six races: MVP, Cy Young and ROY, each AL and NL (the BBWAA votes each league apart).
//
// WHICH SEASON (Donovan 10-20: "2026 vote, then 2027"). Ballots are cast when the regular season ends and announced in
// November, so season S's races stand on its final lines through November; from 1 December the page reads S+1 (a page rule,
// not a fitted number). S+1's races wait until the checkpoint where the held-out read first beat an even split (MVP and Cy
// Young ~25 games a club, ROY ~80; last season's lines alone never did); then this season's pace, leaning on last season's
// early (blendLine), spread by the temperature fitted at that point of the season.
//   lines   stats?stats=season (hitting + pitching, every player, and MLB's own rookie list), this season and last
//   clubs   standings (win share: this season shrunk toward last) and teams (abbreviation + league)
// Each race lists its top 10 with their lines and shares, plus the rest of the pool as one line, so the shares sum to 1.
import { unstable_cache } from 'next/cache'
import { AWARDS_MODEL_VERSION, AWARD_DEFS, AWARD_FITS, SEASON_GAMES, LEAGUE, blendClubs, leagueConsts, parseLines, racePeople, rawFeatures, shareRace, temperatureFor } from './awardModel'

const API = 'https://statsapi.mlb.com/api/v1'
const SHOWN = 10

const get = (path) => fetch(`${API}${path}`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json() })
const lines = (season, pool = 'ALL') => Promise.all(['hitting', 'pitching'].map((g) => get(`/stats?stats=season&group=${g}&season=${season}&sportId=1&playerPool=${pool}&limit=4000`)))
  .then(([h, p]) => parseLines(h, p))
const clubsOf = (season) => get(`/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`).then((j) => {
  const m = new Map()
  for (const rec of j.records || []) for (const t of rec.teamRecords || []) m.set(t.team.id, { games: (t.wins || 0) + (t.losses || 0), winPct: Number(t.winningPercentage) })
  return m
})
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000)
const r4 = (x) => Math.round(x * 10000) / 10000
// innings as the box score writes them: 85.2 = 85 and two outs
const ipNote = (x) => { const outs = Math.round(x * 3); return Math.floor(outs / 3) + (outs % 3) / 10 }
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0 }

/** The season the page reads on an Eastern day: this year's through November, next year's from 1 December. */
export function awardSeason(day) {
  const [y, m] = String(day).split('-').map(Number)
  return m === 12 ? y + 1 : y
}

/** One finished race: shares over the pool, the top SHOWN with their lines, the rest as one number. */
function race(key, lg, scored, extra) {
  const def = AWARD_DEFS[key]
  const order = scored.sort((a, b) => b.share - a.share)
  const top = order.slice(0, SHOWN)
  return {
    key: `${key}-${lg.toLowerCase()}`, label: `${lg} ${def.label}`, title: `${lg} ${def.title}`, status: 'ok',
    pool: order.length,
    rows: top.map((r) => ({
      id: r.id, name: r.name, team: r.team, rookie: r.rookie || undefined,
      // the line he is judged on: a hitter's PA / HR / SB / OPS, a pitcher's IP / K / W / SV / ERA (a two-way man shows both)
      pa: r.pa ? Math.round(r.pa) : null, hr: r.pa ? Math.round(r.hr) : null, sb: r.pa ? Math.round(r.sb) : null, ops: r.pa ? r3(r.ops) : null,
      ip: r.ip ? ipNote(r.ip) : null, so: r.ip ? Math.round(r.so) : null, w: r.ip ? Math.round(r.w) : null, sv: r.ip ? Math.round(r.sv) : null, era: r.ip ? Math.round((900 * r.er) / r.ip) / 100 : null,
      share: r4(r.share),
    })),
    rest: r4(order.slice(SHOWN).reduce((t, r) => t + r.share, 0)),
    ...extra,
  }
}

export async function buildAwardRaces(season) {
  const [cur, prev, rookies, clubsCur, clubsPrev, teams] = await Promise.all([
    lines(season), lines(season - 1), lines(season, 'ROOKIES').then((m) => new Set(m.keys())),
    clubsOf(season), clubsOf(season - 1),
    get(`/teams?sportId=1&season=${season}`).then((j) => new Map((j.teams || []).map((t) => [t.id, { abbr: t.abbreviation, league: LEAGUE[t.league?.id] || null }]))),
  ])
  const medGames = median([...clubsCur.values()].map((c) => c.games))
  const frac = Math.min(1, medGames / SEASON_GAMES)
  // clubs: win share this season shrunk toward last season's; abbreviation and league from this season's teams
  const withTeam = (m) => new Map([...m].map(([id, c]) => [id, { ...c, ...teams.get(id) }]))
  const clubs = blendClubs(withTeam(clubsCur), withTeam(clubsPrev), frac)
  for (const [id, t] of teams) if (!clubs.has(id)) clubs.set(id, { ...t, games: 0, winPct: null })
  // his club = the one he plays (or finished) for this season; nobody is read before games (every race waits), so a winter
  // move needs no roster read
  const people = racePeople({ cur, prev, rookies, clubs, frac, teamOf: (id, c) => c?.teamId ?? null })

  const lg = leagueConsts(cur.size ? cur : prev)
  const over = frac >= 1
  const races = []
  for (const key of ['mvp', 'cy', 'roy']) {
    const def = AWARD_DEFS[key], fit = AWARD_FITS[key]
    const measured = over ? fit.measured.end : fit.measured.mid
    for (const L of ['AL', 'NL']) {
      const waiting = (why) => races.push({ key: `${key}-${L.toLowerCase()}`, label: `${L} ${def.label}`, title: `${L} ${def.title}`, status: 'waiting', why, rows: [], measured })
      if (medGames < fit.openAt) {
        waiting(`Opens after ${fit.openAt} games a club${medGames ? ` (${Math.round(medGames)} so far)` : ''}. Earlier, the model is no better than an even split.`)
        continue
      }
      // pool thresholds on a full-season pace (the lines are paced), so May is judged like September
      const pool = people.filter((x) => x.league === L && (!def.rookies || x.rookie) && def.pool(x, 1))
      if (pool.length < 10) { waiting('Too few players qualify yet.'); continue }
      const T = temperatureFor(key, frac)
      const scored = shareRace(pool.map((x) => ({ ...x, f: rawFeatures(x, lg, x.club) })), key, T)
      races.push(race(key, L, scored, { T: Math.round(T * 100) / 100, measured }))
    }
  }

  return {
    schema: 1, sport: 'mlb', season, seasonLabel: String(season), as_of: new Date().toISOString(), model_version: AWARDS_MODEL_VERSION,
    median_club_games: medGames,
    method: `Fitted on how BBWAA voters split each award, AL and NL 2012-25 (Baseball-Reference): his line against that season's league, and his club's win share. Box score only: no WAR, no fielding.`,
    note: over
      ? `Final ${season} lines: ballots are in, winners announced in November. ${season + 1} from 1 December.`
      : medGames === 0
        ? `No ${season} games yet.`
        : `${Math.round(medGames)} games a club: lines on a 162-game pace, leaning on last season's early.`,
    races,
  }
}

/** Cached six hours per season and day (the lines move once a night at most). */
export function readAwardRaces(season, day) {
  return unstable_cache(() => buildAwardRaces(season), ['mlb-award-races-v1', String(season), String(day)], { revalidate: 21600 })()
}
