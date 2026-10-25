// MOCK (2026-10-25): the CALLED card for one game per sport, from TODAY's live CALLED lists (dashnetwork.vercel.app + the bot's
// data branch). Real men, real lanes; writes PNGs only.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/proto-cards/called-mock.mjs <outDir>
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { calledModels, renderCalled } from '../../lib/cards/calledCard.js'
import { adapterFor } from '../../lib/cards/registry.js'
import { legModel } from '../../lib/cards/dayData.js'
import { brandOf, prettyDay } from '../../lib/cards/model.js'
import { groupCalled } from '../../lib/calledList.js'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const OUT = process.argv[2] || '.'
const SITE = 'https://dashnetwork.vercel.app'
const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)

async function nba() {
  const out = []
  for (const [m, lane] of Object.entries({ pts: 'PTS 25+', reb: 'REB 10+', ast: 'AST 8+', '3pm': '3PM 4+', pra: 'PRA 35+', dd: 'DD', td: 'TD', first: 'FIRST BASKET' })) {
    const b = await j(`${SITE}/api/buckets/board${m === 'pts' ? '' : `?market=${m}`}`)
    for (const r of b?.rows || []) if (r.status === 'called') {
      const g = (b.games || []).find((x) => x.id === r.gameId)
      out.push({ gameKey: r.gameId, title: `${g?.away?.abbrev} @ ${g?.home?.abbrev}`, start: g?.start, name: r.name, team: r.team, lane, id: r.playerId, opp: r.opp, date: b.date })
    }
  }
  return out
}
async function nhl() {
  const out = []
  for (const [m, lane] of Object.entries({ GOAL: 'GOAL', G2: '2+ GOALS', SOG: 'SHOTS' })) {
    const b = await j(`${SITE}/api/lamp/board${m === 'GOAL' ? '' : `?market=${m}`}`)
    for (const g of b?.games || []) for (const r of g.rows || []) if (r.status === 'called') {
      const gm = g.game || {}
      out.push({ gameKey: String(gm.id), title: `${gm.away?.abbrev} @ ${gm.home?.abbrev}`, start: gm.startUtc, name: r.name, team: r.team, lane: r.line ? `${lane} ${r.line}` : lane, id: r.playerId, opp: r.opp, date: b.date })
    }
  }
  return out
}
async function nfl() {
  // the GB @ DET game from the pick card + game calls, labelled as the site's Copy called labels them
  const p = await j(`${DATA}/nfl_picks.json`), wk = await j(`${DATA}/nfl_week.json`), gc = await j(`${DATA}/nfl_game_calls.json`)
  const g = (wk?.games || []).find((x) => x.home === 'DET' && x.away === 'GB')
  const out = []
  const add = (r, lane) => out.push({ gameKey: g.game_id, title: `${g.away} @ ${g.home}`, start: g.kickoff, name: r.name, team: r.team, lane, id: r.player_id, opp: r.opp, date: String(g.kickoff).slice(0, 10) })
  for (const [k, c] of Object.entries(p?.card || {})) for (const r of c.rungs || []) if ([g.home, g.away].includes(r.team)) add(r, k === 'TD' ? 'Anytime TD' : c.label || k)
  const calls = (gc?.games || []).find((x) => String(x.game_id) === String(g.game_id))?.calls || []
  for (const c of calls) { const pl = (wk.players || []).find((x) => x.player_id === c.player_id); if (pl && !out.some((o) => o.id === c.player_id && o.lane === 'Anytime TD')) add(pl, `${c.role === 'TOP' ? 'TOP' : 'TD'} game call`) }
  return out
}

const WANT = { nba: ['LAL @ UTAH', 'DET @ PHI'], nhl: ['FLA @ CHI'], nfl: ['GB @ DET'] }
fs.mkdirSync(OUT, { recursive: true })
for (const [sport, get] of Object.entries({ nba, nhl, nfl })) {
  const entries = await get()
  const adapter = await adapterFor(sport)
  for (const g of groupCalled(entries)) {
    if (!WANT[sport].includes(g.title)) continue
    const first = entries.find((e) => e.title === g.title)
    const men = await Promise.all(g.men.map(async (x) => {
      const e = entries.find((y) => y.name === x.name && y.team === x.team)
      return { m: await legModel(sport, { player_id: e.id, name: e.name, team: e.team, opp: e.opp, game_date: e.date }, adapter), lanes: x.lanes }
    }))
    const models = calledModels({ sport, brandName: brandOf(sport).name, dayWord: prettyDay(first.date), title: g.title, start: g.start, weekday: sport === 'nfl', men })
    for (const [i, d] of models.entries()) {
      const file = path.join(OUT, `called-${sport}-${g.title.replace(/\W+/g, '-').toLowerCase()}${models.length > 1 ? `-${i + 1}` : ''}.png`)
      fs.writeFileSync(file, Buffer.from(await renderCalled(d, { width: 1080 })))
      console.log('wrote', file, `${men.length} men`)
    }
  }
}
