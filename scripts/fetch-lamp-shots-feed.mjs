#!/usr/bin/env node
// LAMP's SHOT HISTORY, STRAIGHT FROM THE LEAGUE FEED, NO DATABASE (2026-10-22, PREPLAY N1). The same rows the tick and
// scripts/backfill-lamp-shots.mjs write to lamp_shots (lib/nhl/shots.js shotsFromPlayByPlay), written to local files
// instead, so the simulator can be measured anywhere (a cloud session has no database keys):
//
//   node scripts/fetch-lamp-shots-feed.mjs <out dir> [20252026 20262027 ...]
//
//   <out>/shots.jsonl   one lamp_shots row a line (the format scripts/_lampxg.mjs loadShots reads)
//   <out>/games.jsonl   one line a game: { id, date, season, type, away, home, as, hs, last (REG/OT/SO), players }
//                       players: { [id]: [name, number, club, position] } from the game's roster
//
// Every final regular-season game of each season, from the 32 club schedules. Polite to the free feed: two reads a
// second at most (four workers). Resumable: games already in games.jsonl are skipped, so a stopped run just starts again.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import './_esm-resolve.mjs'

const { shotsFromPlayByPlay } = await import('../lib/nhl/shots.js')
const { NHL_TEAMS } = await import('../lib/nhl/teams.js')

const out = process.argv[2]
const seasons = process.argv.slice(3).map(Number).filter(Boolean)
if (!out) { console.error('usage: fetch-lamp-shots-feed.mjs <out dir> [season ...]'); process.exit(2) }
if (!seasons.length) seasons.push(20252026)
mkdirSync(out, { recursive: true })
const GAP_MS = 500
const API = 'https://api-web.nhle.com/v1'
const UA = { 'User-Agent': 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)', Accept: 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(path) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(`${API}${path}`, { headers: UA, redirect: 'follow' })
      if (r.ok) return r.json()
      if (attempt === 4) throw new Error(`${r.status} ${path}`)
    } catch (e) { if (attempt === 4) throw e }
    await sleep(2000 * attempt)
  }
}

const gamesFile = join(out, 'games.jsonl'), shotsFile = join(out, 'shots.jsonl')
const have = new Set(existsSync(gamesFile) ? readFileSync(gamesFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : [])
const ids = new Set()
for (const season of seasons) {
  for (const [abbrev] of NHL_TEAMS) {
    const s = await get(`/club-schedule-season/${abbrev}/${season}`)
    for (const g of s.games || []) if (g.gameType === 2 && ['OFF', 'FINAL'].includes(g.gameState)) ids.add(Number(g.id))
    await sleep(GAP_MS)
  }
}
const todo = [...ids].filter((id) => !have.has(id)).sort()
console.log(`[feed] seasons ${seasons.join(', ')}: ${ids.size} final games, ${have.size} already here, ${todo.length} to go`)
let done = 0, rows = 0
const failed = []
// four workers, each waiting GAP_MS x 4 between its reads: the feed answers in a few seconds through a proxy, so this
// stays under two reads a second in all while not waiting on one slow answer at a time
const WORKERS = 4
let next = 0
const one = async (id) => {
  try {
    const pbp = await get(`/gamecenter/${id}/play-by-play`)
    const shots = shotsFromPlayByPlay(pbp)
    if (shots.length) appendFileSync(shotsFile, shots.map((r) => JSON.stringify(r)).join('\n') + '\n')
    rows += shots.length
    const players = {}
    const club = (tid) => (Number(tid) === Number(pbp.homeTeam?.id) ? pbp.homeTeam?.abbrev : pbp.awayTeam?.abbrev)
    for (const r of pbp.rosterSpots || []) players[r.playerId] = [[r.firstName?.default, r.lastName?.default].filter(Boolean).join(' '), r.sweaterNumber ?? null, club(r.teamId), r.positionCode || null]
    appendFileSync(gamesFile, JSON.stringify({
      id: Number(pbp.id), date: pbp.gameDate, season: Number(pbp.season), type: Number(pbp.gameType),
      away: pbp.awayTeam?.abbrev, home: pbp.homeTeam?.abbrev, as: pbp.awayTeam?.score ?? null, hs: pbp.homeTeam?.score ?? null,
      last: pbp.gameOutcome?.lastPeriodType || null, players,
    }) + '\n')
  } catch (e) { failed.push(id); console.error(`[feed] ${id}: ${e?.message}`) }
  done += 1
  if (done % 100 === 0 || done === todo.length) console.log(`[feed] ${done}/${todo.length} games, ${rows} shots, ${failed.length} failed`)
}
await Promise.all(Array.from({ length: WORKERS }, async () => { while (next < todo.length) { const id = todo[next++]; await one(id); await sleep(GAP_MS * WORKERS) } }))
console.log(`[feed] finished: ${rows} shots from ${done - failed.length} games; failed ${failed.length}${failed.length ? ` (${failed.join(', ')}) -- run again to retry` : ''}`)
