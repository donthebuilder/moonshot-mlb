#!/usr/bin/env node
// THE FIRST-SCORER AUDIT (2026-10-26, Donovan: "confirm on the ledger that these are the first of each game ... I feel like it's
// usually off"). Every game the Ledger's FIRST ... OF EACH GAME list names (lib/ledger/firstScorers.js, the same read the page
// and the player cards use) against an independent record of that game:
//   nhl / nba / mlb   opening_games (each league's own play-by-play, written at grade: lib/nhl|nba|mlb/openings.js)
//   nfl (--nfl)       ESPN's scoring plays for the game (slow: one read a game)
// Prints listed / right / wrong / missing per sport and the first few misses; exits 1 on any wrong or missing graded game.
// Run from the repo root with the service key in .env.local:  node scripts/check-first-scorers.mjs [--since YYYY-MM-DD] [--nfl]
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { readFirstScorers } = await import('../lib/ledger/firstScorers.js')

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const day = new Date().toISOString().slice(0, 10)
const SINCE = arg('--since')
const since = (sport) => SINCE || `${day.slice(0, 4)}-${sport === 'mlb' ? '03' : '09'}-01`
async function pageAll(q) { const out = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw new Error(error.message); out.push(...data); if (data.length < 1000) break } return out }

const TRUTH = { nhl: ['first_score_player', 'first_score_team'], nba: ['first_score_player', 'first_score_team'], mlb: ['first_hr_player', 'first_hr_team'] }
// the game types each list carries: LAMP's reads the regular season, BUCKETS' and MOONSHOT's the playoffs too
const TYPES = { nhl: [2], nba: [2, 3], mlb: [2, 3] }
// ESPN spells two clubs differently from the feed
const SAME = { LAR: 'LA', WSH: 'WAS' }
let bad = 0
for (const sport of ['nhl', 'nba', 'mlb', ...(process.argv.includes('--nfl') ? ['nfl'] : [])]) {
  const list = (await readFirstScorers(db, sport, { day, since: since(sport), seasonSince: since(sport) })).games
  let ok = 0
  const wrong = [], missing = []
  if (TRUTH[sport]) {
    const [pc, tc] = TRUTH[sport]
    const truth = (await pageAll(() => db.from('opening_games').select(`game_id, game_date, away, home, ${pc}, ${tc}`).eq('sport', sport).in('season_type', TYPES[sport])
      .gte('game_date', since(sport)).lte('game_date', day).order('game_id'))).filter((g) => g[pc])
    const by = new Map(list.map((x) => [String(x.gameId), x]))
    for (const g of truth) {
      const x = by.get(String(g.game_id))
      if (!x) missing.push(`${g.game_date} ${g.away} @ ${g.home}`)
      else if (String(x.playerId) === String(g[pc])) ok++
      else wrong.push(`${x.day} ${x.game}: listed ${x.name}, the game's was ${g[pc]} (${g[tc]})`)
    }
  } else {
    for (const x of list) {
      const j = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${x.gameId}`).then((r) => r.json()).catch(() => null)
      const sp = (j?.scoringPlays || []).find((p) => /touchdown/i.test(`${p.type?.text} ${p.text}`))
      const team = SAME[sp?.team?.abbreviation] || sp?.team?.abbreviation
      if (sp && team === x.team && String(sp.text || '').includes(String(x.name).split(' ').pop())) ok++
      else wrong.push(`${x.day} ${x.game}: listed ${x.name}, ESPN ${sp ? `${team} ${String(sp.text).slice(0, 50)}` : 'no TD'}`)
      await new Promise((r) => setTimeout(r, 150))
    }
  }
  bad += wrong.length + missing.length
  console.log(`${sport}: ${list.length} listed · ${ok} right · ${wrong.length} wrong · ${missing.length} graded games missing`)
  for (const w of [...wrong, ...missing.map((m) => `missing ${m}`)].slice(0, 5)) console.log(`   ${w}`)
}
console.log(bad ? `FAIL: ${bad} games off` : 'OK: every listed first scorer is the game’s first')
process.exit(bad ? 1 : 0)
