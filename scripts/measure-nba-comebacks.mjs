#!/usr/bin/env node
// 🔁 COMEBACKS BY THE PREGAME LINE (2026-10-22, Donovan: "the Pistons ... opening line +100 ... down 20 ... I took them at
// +500 ... they won. Look at the starting odds and where they're at inside the game when they're down ... a good point to buy
// them ... comeback margins"). MEASURED, not modelled: every 2025-26 regular-season final, the book's CLOSING spread (ESPN's
// odds feed, as scripts/backtest-nba-gamelines.mjs reads it) and each club's deepest hole from ESPN play-by-play. For a club
// by its pregame role (spread band) and its deepest deficit, how many games, and how many it still won.
//   node scripts/measure-nba-comebacks.mjs <lines cache from backtest-nba-gamelines --cache> [--pbp <cache file>]
// Prints the table lib/nba/comebacks.js carries. Nothing is written to the database.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const LINES = process.argv[2]
const pi = process.argv.indexOf('--pbp'); const PBP = pi > 0 ? process.argv[pi + 1] : null
if (!LINES) { console.error('usage: measure-nba-comebacks.mjs <lines cache> [--pbp <cache>]'); process.exit(1) }
const { cur } = JSON.parse(readFileSync(LINES, 'utf8'))
const UA = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0' }
const get = async (u) => { for (let i = 0; i < 4; i++) { const r = await fetch(u, { headers: UA }).catch(() => null); if (r?.ok) return r.json(); if (r?.status === 404) return null; await new Promise((s) => setTimeout(s, 500 * (i + 1))) } throw new Error(`fetch failed ${u}`) }
const pool = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } })) }

// game id -> { home, away: deepest deficit (points, >= 0), q: [[home, away] score at the end of each period] }
const holes = PBP && existsSync(PBP) ? JSON.parse(readFileSync(PBP, 'utf8')) : {}
const todo = cur.filter((g) => !holes[g.id]?.q)
await pool(todo, 6, async (g, k) => {
  const j = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${g.id}`)
  let h = 0, a = 0
  const q = []
  for (const p of j?.plays || []) {
    const d = Number(p.homeScore) - Number(p.awayScore)
    if (!Number.isFinite(d)) continue
    if (-d > h) h = -d
    if (d > a) a = d
    const per = Number(p.period?.number)
    if (per >= 1) q[per - 1] = [Number(p.homeScore), Number(p.awayScore)]
  }
  if (j?.plays?.length) holes[g.id] = { home: h, away: a, q }
  if (k % 200 === 0) { console.error(`  pbp ${k}/${todo.length}`); if (PBP) writeFileSync(PBP, JSON.stringify(holes)) }
})
if (PBP) writeFileSync(PBP, JSON.stringify(holes))

// a club's pregame role by its own closing spread (negative = favoured)
const ROLES = [
  { key: 'fav10', label: 'Favoured by 10+', test: (s) => s <= -10 },
  { key: 'fav5', label: 'Favoured by 5 to 9.5', test: (s) => s <= -5 && s > -10 },
  { key: 'pick', label: 'Within 4.5 either way', test: (s) => s > -5 && s < 5 },
  { key: 'dog5', label: 'Underdog by 5 to 9.5', test: (s) => s >= 5 && s < 10 },
  { key: 'dog10', label: 'Underdog by 10+', test: (s) => s >= 10 },
]
const DOWN = [10, 15, 20, 25]
const table = ROLES.map((r) => ({ key: r.key, label: r.label, games: 0, rows: DOWN.map((d) => ({ down: d, n: 0, won: 0 })) }))
let used = 0
for (const g of cur) {
  const s = g.line?.close?.spreadHome, hole = holes[g.id]
  if (s == null || !hole || g.hs === g.as) continue
  used++
  for (const side of ['home', 'away']) {
    const mine = side === 'home' ? s : -s
    const won = side === 'home' ? g.hs > g.as : g.as > g.hs
    const row = table.find((t) => ROLES.find((r) => r.key === t.key).test(mine))
    row.games++
    for (const x of row.rows) if (hole[side] >= x.down) { x.n++; if (won) x.won++ }
  }
}
console.log(`2025-26 regular season: ${used} finals with a closing spread and play-by-play (of ${cur.length})`)
for (const t of table) console.log(`${t.label.padEnd(24)} ${String(t.games).padStart(4)} games | ` + t.rows.map((x) => `down ${x.down}+: won ${x.won} of ${x.n}`).join(' | '))
console.log('\nJSON for lib/nba/comebacks.js:')
console.log(JSON.stringify(table.map((t) => ({ key: t.key, label: t.label, games: t.games, rows: t.rows }))))

// AT THE BREAKS: a club down by D at the end of Q1 / the half / Q3 -- how often it still won, and by its pregame role.
const BREAKS = [{ key: 'q1', label: 'After Q1', at: 0 }, { key: 'half', label: 'At the half', at: 1 }, { key: 'q3', label: 'After Q3', at: 2 }]
const BDOWN = [5, 10, 15, 20]
const breaks = BREAKS.map((b) => ({ ...b, rows: BDOWN.map((d) => ({ down: d, n: 0, won: 0, fav: { n: 0, won: 0 }, dog: { n: 0, won: 0 } })) }))
// BY CLUB: games it trailed by 10+ / 15+ at any point and still won; and wins from down 10+ at the half or after Q3.
const clubs = new Map()
const club = (t) => { if (!clubs.has(t)) clubs.set(t, { team: t, games: 0, down10: 0, won10: 0, down15: 0, won15: 0, half10: 0, halfWon10: 0, q3_10: 0, q3Won10: 0, blewLead15: 0 }); return clubs.get(t) }
for (const g of cur) {
  const hole = holes[g.id], s = g.line?.close?.spreadHome
  if (!hole?.q || g.hs === g.as) continue
  for (const side of ['home', 'away']) {
    const won = side === 'home' ? g.hs > g.as : g.as > g.hs
    const mine = s == null ? null : side === 'home' ? s : -s
    for (const b of breaks) {
      const sc = hole.q[b.at]
      if (!sc) continue
      const behind = side === 'home' ? sc[1] - sc[0] : sc[0] - sc[1]
      for (const x of b.rows) if (behind >= x.down) {
        x.n++; if (won) x.won++
        if (mine != null && mine < 0) { x.fav.n++; if (won) x.fav.won++ }
        if (mine != null && mine > 0) { x.dog.n++; if (won) x.dog.won++ }
      }
    }
    const c = club(side === 'home' ? g.home : g.away)
    c.games++
    const deep = hole[side], other = hole[side === 'home' ? 'away' : 'home']
    if (deep >= 10) { c.down10++; if (won) c.won10++ }
    if (deep >= 15) { c.down15++; if (won) c.won15++ }
    if (other >= 15 && !won) c.blewLead15++
    const atHalf = hole.q[1], atQ3 = hole.q[2]
    const behindAt = (sc) => (sc ? (side === 'home' ? sc[1] - sc[0] : sc[0] - sc[1]) : -99)
    if (behindAt(atHalf) >= 10) { c.half10++; if (won) c.halfWon10++ }
    if (behindAt(atQ3) >= 10) { c.q3_10++; if (won) c.q3Won10++ }
  }
}
console.log('\nAT THE BREAKS (won / trailed by D; fav = favoured pregame, dog = underdog pregame):')
for (const b of breaks) console.log(`${b.label.padEnd(12)} ` + b.rows.map((x) => `down ${x.down}+: ${x.won}/${x.n} (fav ${x.fav.won}/${x.fav.n}, dog ${x.dog.won}/${x.dog.n})`).join(' | '))
const byClub = [...clubs.values()].sort((a, b) => b.won10 - a.won10 || b.won15 - a.won15)
console.log('\nBY CLUB (most wins after trailing by 10+ at any point):')
for (const c of byClub) console.log(`${c.team.padEnd(4)} won from 10+ down ${c.won10}/${c.down10} | from 15+ ${c.won15}/${c.down15} | down 10+ at half ${c.halfWon10}/${c.half10} | after Q3 ${c.q3Won10}/${c.q3_10} | blew a 15+ lead ${c.blewLead15}`)
console.log('\nJSON breaks:'); console.log(JSON.stringify(breaks.map((b) => ({ key: b.key, label: b.label, rows: b.rows }))))
console.log('\nJSON clubs:'); console.log(JSON.stringify(byClub))
