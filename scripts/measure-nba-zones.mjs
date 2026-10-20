// MEASURE BUCKETS' ZONE BASELINES (2026-10-20). Run by hand, once a season (or when a season has enough shots):
//   set -a; . ./.env.local; set +a; node scripts/measure-nba-zones.mjs 2026 > lib/nba/zoneBaselines.json
// Reads every regular-season field-goal attempt of one season from buckets_shots (game_id, team_id, x, y, made, three;
// one read, ~5 MB of CSV for a full season) and writes, by the twelve zones of lib/nba/zones.js:
//   league: makes / attempts in every zone, all 30 clubs;
//   def[CLUB]: what that club's OPPONENTS made / took in each zone (the shot's defense is the other club in its game).
// Nothing is guessed: a game with other than two clubs in its shots is skipped and counted in `skipped`.
import { zoneOfShot, ZONE_KEYS } from '../lib/nba/zones.js'
import { NBA_TEAMS } from '../lib/nba/teams.js'

const season = Number(process.argv[2] || 2026)
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'text/csv' }
const ABBR = Object.fromEntries(NBA_TEAMS.map((t) => [t[1], t[0]]))
const PAGE = 1000
const base = `${URL}/rest/v1/buckets_shots?select=game_id,team_id,x,y,made,three&game_date=gte.${season - 1}-10-15&game_date=lt.${season}-04-20&order=game_id,event_id`

// preseason games out (same rule as /api/buckets/shots): ids from buckets_games season_type 1
const pre = await fetch(`${URL}/rest/v1/buckets_games?select=game_id&season_type=eq.1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then((r) => r.json())
const skipGames = new Set((pre || []).map((r) => String(r.game_id)))

async function page(from) {
  for (let tries = 0; tries < 4; tries++) {
    const r = await fetch(base, { headers: { ...H, Range: `${from}-${from + PAGE - 1}` } })
    if (r.ok || r.status === 206) return (await r.text()).trim().split('\n').slice(1).filter(Boolean)
    await new Promise((res) => setTimeout(res, 1000 * (tries + 1)))
  }
  throw new Error(`page ${from} failed`)
}
const rows = []
for (let from = 0; ; from += PAGE * 6) {
  const batch = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => page(from + i * PAGE)))
  for (const b of batch) rows.push(...b)
  if (batch.some((b) => b.length < PAGE)) break
}
const byGame = new Map()
for (const line of rows) {
  const [game, team, x, y, made, three] = line.split(',')
  if (skipGames.has(game)) continue
  const g = byGame.get(game) || []
  g.push({ team, x: Number(x), y: Number(y), made: made === 't' || made === 'true', three: three === 't' || three === 'true' })
  byGame.set(game, g)
}
const empty = () => Object.fromEntries(ZONE_KEYS.map((k) => [k, [0, 0]]))
const league = empty(), def = Object.fromEntries(NBA_TEAMS.map((t) => [t[0], empty()]))
let skipped = 0, shots = 0, games = 0
for (const g of byGame.values()) {
  const clubs = [...new Set(g.map((s) => s.team))]
  if (clubs.length !== 2 || !ABBR[clubs[0]] || !ABBR[clubs[1]]) { skipped += 1; continue }
  games += 1
  for (const s of g) {
    const k = zoneOfShot(s)
    if (!k) continue
    const against = ABBR[clubs[0] === s.team ? clubs[1] : clubs[0]]
    league[k][1] += 1; def[against][k][1] += 1
    if (s.made) { league[k][0] += 1; def[against][k][0] += 1 }
    shots += 1
  }
}
console.log(JSON.stringify({ season: `${season - 1}-${String(season).slice(2)}`, measured: new Date().toISOString().slice(0, 10), games, shots, skipped, league, def }))
