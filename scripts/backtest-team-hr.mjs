// HELD-OUT CHECK of MOONSHOT's team model (lib/teamHr.js) on REAL graded games.
//   node --import ./scripts/_esm-resolve.mjs scripts/backtest-team-hr.mjs [cacheDir] [cutDate]
// Reads the bot's published `data` branch (graded_results_<day>.json: the slate's rows and the
// night's full home-run capture by game and club) and the StatsAPI club table AS OF the day before
// each game. Final games only. Days before <cutDate> (default 2026-09-01) are the fit window the
// constants in lib/teamHr.js were chosen on; the days from it are scored. Prints Poisson deviance
// (lower is better), per-game MAE/RMSE of the game total, and bias, for: the league average, a
// plain club HR/game, and the team model. Network + a few hundred MB of cache; not part of CI.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clubTable, gameExpHr } from '../lib/teamHr.js'

const cache = process.argv[2] || path.join(os.tmpdir(), 'team-hr-backtest')
const CUT = process.argv[3] || '2026-09-01'
fs.mkdirSync(cache, { recursive: true })
const RAW = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const get = async (u, f) => {
  const p = path.join(cache, f)
  if (!fs.existsSync(p)) { const r = await fetch(u); if (!r.ok) return null; fs.writeFileSync(p, Buffer.from(await r.arrayBuffer())) }
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}
const tree = await (await fetch('https://api.github.com/repos/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/git/trees/data?recursive=1')).json()
const days = tree.tree.map((e) => e.path.match(/current\/graded_results_(\d{4}-\d\d-\d\d)\.json$/)?.[1]).filter(Boolean).sort()
const abbrs = Object.fromEntries(((await (await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1&fields=teams,id,abbreviation')).json()).teams || []).map((t) => [t.id, t.abbreviation]))

const recs = []
for (const d of days) {
  const g = await get(`${RAW}/graded_results_${d}.json`, `g_${d}.json`)
  const rep = g?.hr_capture_report
  const ents = rep?.all_homer_entries || []
  if (!ents.length || ents.reduce((a, e) => a + (e.hr || 0), 0) !== rep.total_hrs_on_slate || ents.some((e) => !e.game_pk || !e.team)) continue
  const prev = new Date(Date.parse(`${d}T12:00:00Z`) - 864e5).toISOString().slice(0, 10)
  const url = `https://statsapi.mlb.com/api/v1/teams/stats?season=2026&group=hitting&stats=byDateRange&startDate=2026-03-20&endDate=${prev}&sportIds=1&fields=stats,splits,team,id,stat,homeRuns,plateAppearances,gamesPlayed`
  const club = await get(url, `club_${d}.json`)
  const table = clubTable(club?.stats?.[0]?.splits || [], abbrs)
  if (!table) continue
  const st = g.game_status_by_pk || {}
  const by = new Map()
  for (const r of g.results || []) { if (r.game_pk && r.team) { if (!by.has(r.game_pk)) by.set(r.game_pk, []); by.get(r.game_pk).push(r) } }
  for (const [pk, rows] of by) {
    const s = st[pk]
    if (!s || s.abstract_state !== 'Final' || (s.inning || 0) < 9) continue
    const sides = [...new Set(rows.map((r) => r.team))]
    if (sides.length !== 2 || !sides.includes(s.home) || !sides.includes(s.away)) continue
    const m = gameExpHr(rows, table)
    for (const t of sides) {
      const c = table.clubs[t]
      recs.push({ d, pk, y: ents.filter((e) => e.game_pk === pk && e.team === t).reduce((a, e) => a + e.hr, 0), team: m.sides[t], league: table.lgRate * table.paG, club: c.hr / c.g })
    }
  }
}
const dev = (y, mu) => { mu = Math.max(mu, 1e-6); return 2 * ((y > 0 ? y * Math.log(y / mu) : 0) - (y - mu)) }
function score(set, key) {
  let d = 0; let b = 0; const g = new Map()
  for (const o of set) { d += dev(o.y, o[key]); b += o[key] - o.y; const e = g.get(o.d + o.pk) || { mu: 0, y: 0 }; e.mu += o[key]; e.y += o.y; g.set(o.d + o.pk, e) }
  let ae = 0; let se = 0; g.forEach((e) => { ae += Math.abs(e.mu - e.y); se += (e.mu - e.y) ** 2 })
  return { deviance: +(d / set.length).toFixed(4), bias: +(b / set.length).toFixed(3), gameMAE: +(ae / g.size).toFixed(3), gameRMSE: +Math.sqrt(se / g.size).toFixed(3) }
}
for (const [name, set] of [['FIT window (before ' + CUT + ')', recs.filter((o) => o.d < CUT)], ['HELD OUT (from ' + CUT + ')', recs.filter((o) => o.d >= CUT)]]) {
  console.log(`\n${name}: ${set.length} club-games, ${new Set(set.map((o) => o.d + o.pk)).size} games, ${new Set(set.map((o) => o.d)).size} days`)
  for (const [label, key] of [['league average', 'league'], ['plain club HR/game', 'club'], ['TEAM MODEL', 'team']]) console.log(' ', label.padEnd(20), JSON.stringify(score(set, key)))
}
