// TEAM FACTS FOR THE DAILY SPORTS (BATCH-FACT-ENGINE, 2026-10-02): MLB, NHL,
// NBA. Each league's own free standings + that day's schedule; only teams that
// play that day, regular season only. Streaks and unbeaten starts as the
// standings state them -- no history, so nothing here proves a "first".
// BUCKETS adds NBA's player facts when it ships.
const j = (u) => fetch(u, { next: { revalidate: 900 } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${u}`))))
const etTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
const ymd = (d) => d.replace(/-/g, '')

export const TEAM_READERS = {
  async mlb(date) {
    const [st, sc] = await Promise.all([
      j(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${date.slice(0, 4)}&hydrate=team`),
      j(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameType=R`),
    ])
    const teams = {}
    for (const rec of st.records || []) for (const r of rec.teamRecords || []) {
      teams[r.team.abbreviation] = { code: r.team.abbreviation, name: r.team.teamName, w: r.wins, l: r.losses, otl: 0, gp: r.wins + r.losses, streak: { type: r.streak?.streakType === 'wins' ? 'W' : 'L', n: r.streak?.streakNumber || 0 } }
    }
    const byId = Object.fromEntries((st.records || []).flatMap((x) => x.teamRecords || []).map((r) => [r.team.id, r.team.abbreviation]))
    const games = (sc.dates?.[0]?.games || []).map((g) => ({ away: byId[g.teams.away.team.id], home: byId[g.teams.home.team.id], start: g.gameDate }))
    return { teams, games }
  },
  async nhl(date) {
    const [st, sc] = await Promise.all([j('https://api-web.nhle.com/v1/standings/now'), j(`https://api-web.nhle.com/v1/schedule/${date}`)])
    const teams = {}
    for (const s of st.standings || []) {
      const code = s.teamAbbrev?.default
      teams[code] = { code, name: s.teamCommonName?.default, w: s.wins, l: s.losses, otl: s.otLosses, gp: s.gamesPlayed, streak: { type: s.streakCode, n: s.streakCount || 0 } }
    }
    const day = (sc.gameWeek || []).find((w) => w.date === date)
    const games = (day?.games || []).filter((g) => g.gameType === 2).map((g) => ({ away: g.awayTeam.abbrev, home: g.homeTeam.abbrev, start: g.startTimeUTC }))
    return { teams, games }
  },
  async nba(date) {
    const [st, sc] = await Promise.all([
      j('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'),
      j(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd(date)}`),
    ])
    const teams = {}
    for (const c of st.children || []) for (const e of c.standings?.entries || []) {
      const v = Object.fromEntries((e.stats || []).map((s) => [s.name, s]))
      const sv = String(v.streak?.displayValue || '')
      teams[e.team.abbreviation] = { code: e.team.abbreviation, name: e.team.shortDisplayName, w: Number(v.wins?.value) || 0, l: Number(v.losses?.value) || 0, otl: 0, gp: (Number(v.wins?.value) || 0) + (Number(v.losses?.value) || 0), streak: { type: sv[0] || '', n: Number(sv.slice(1)) || 0 } }
    }
    const games = (sc.events || []).filter((e) => e?.season?.type === 2).map((e) => {
      const cs = e.competitions?.[0]?.competitors || []
      return { away: cs.find((c) => c.homeAway === 'away')?.team?.abbreviation, home: cs.find((c) => c.homeAway === 'home')?.team?.abbreviation, start: e.date }
    })
    return { teams, games }
  },
}
const SOURCE = { mlb: 'MLB Stats API standings + schedule', nhl: 'NHL api-web standings + schedule', nba: 'ESPN NBA standings + scoreboard' }
const STREAK_MIN = { mlb: 6, nhl: 5, nba: 6 }
// how each league writes a record (NHL carries the overtime losses)
const RECORD = { mlb: (t) => `${t.w}-${t.l}`, nba: (t) => `${t.w}-${t.l}`, nhl: (t) => `${t.w}-${t.l}-${t.otl}` }
const rec = (sport, t) => RECORD[sport](t)

/** That day's team facts for one sport. */
export function teamFacts(sport, { teams, games }, date) {
  const out = []
  for (const g of games) {
    for (const [code, oppCode, at] of [[g.away, g.home, 'at'], [g.home, g.away, 'vs']]) {
      const t = teams[code], o = teams[oppCode]
      if (!t || !o) continue
      const base = { sport, date, teams: [{ code, name: t.name, record: rec(sport, t) }], opp: `${at} ${o.name}`, when: etTime(g.start), source: SOURCE[sport], since: null, proves: [] }
      if (t.gp >= 3 && t.l === 0 && t.otl === 0) {
        out.push({ ...base, family: 'unbeaten_start', id: `${sport}:${date}:start:${code}:${t.w}`, why: `${rec(sport, t)} to start the season`, score: 40 + t.w * 3 })
      } else if (t.streak.type === 'W' && t.streak.n >= STREAK_MIN[sport]) {
        out.push({ ...base, family: 'win_streak', streak: t.streak.n, id: `${sport}:${date}:streak:${code}:${t.streak.n}`, why: `${t.streak.n} straight wins`, score: 30 + t.streak.n * 2 })
      }
    }
  }
  return out.sort((a, b) => b.score - a.score)
}
