// THE NAME TWINS LIST (2026-10-21, BY THE NUMBERS). Reads every club roster in all four leagues (the same ESPN roster pages BUCKETS reads) and
// writes lib/data/nameTwins.js: every full name worn by two or more players (a second league, or a second club in the same league), with each
// man's league, club, number and position. The post (lib/posts/byNumbers.js) names a twin only when one of them is on tonight's board.
// No cron and no table: run it when rosters move (the trade deadline, opening day, a new season), commit the file.
//   node scripts/refresh-name-twins.mjs            (writes the file)
//   node scripts/refresh-name-twins.mjs --dry      (prints the count only)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'lib/data/nameTwins.js')
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/'
const LEAGUES = { mlb: 'baseball/mlb', nfl: 'football/nfl', nhl: 'hockey/nhl', nba: 'basketball/nba' }
const SUFFIX = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V'])
// the same letters-only key lib/numerology/gematria.js nameWords makes ("Byron Murphy II" = "Byron Murphy Jr." = BYRON MURPHY)
export const nameKey = (name) => {
  const w = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/).map((x) => x.replace(/[^A-Z]/g, '')).filter(Boolean)
  while (w.length > 1 && SUFFIX.has(w.at(-1))) w.pop()
  return w.join(' ')
}

async function get(url, tries = 3) {
  let err
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); err = new Error(`${r.status} ${url}`) } catch (e) { err = e }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)))
  }
  throw err
}
const items = (d) => { const a = d?.athletes || []; return a.length && a[0]?.items ? a.flatMap((g) => g.items) : a }

async function main() {
  const players = []
  const failed = []
  for (const [sport, p] of Object.entries(LEAGUES)) {
    const teams = (await get(`${BASE}${p}/teams?limit=50`)).sports[0].leagues[0].teams.map((t) => t.team)
    for (let i = 0; i < teams.length; i += 8) {
      await Promise.all(teams.slice(i, i + 8).map(async (t) => {
        try {
          for (const a of items(await get(`${BASE}${p}/teams/${t.id}/roster`))) {
            const j = Number(a.jersey)
            players.push({ sport, team: t.abbreviation, club: String(t.displayName || '').replace(t.location || '', '').trim() || t.abbreviation, id: String(a.id), name: a.displayName, number: Number.isInteger(j) && j >= 0 && j <= 99 && String(a.jersey).trim() !== '' ? j : null, pos: a.position?.abbreviation || null })
          }
        } catch (e) { failed.push(`${sport} ${t.abbreviation}: ${e?.message || e}`) }
      }))
    }
  }
  if (failed.length) { console.error('roster reads failed (the file is NOT written):\n' + failed.join('\n')); process.exit(1) }
  const by = new Map()
  for (const p of players) { const k = nameKey(p.name); if (!k.includes(' ')) continue; if (!by.has(k)) by.set(k, []); by.get(k).push(p) }
  const twins = [...by.entries()].filter(([, l]) => l.length >= 2 && new Set(l.map((x) => `${x.sport}:${x.team}`)).size >= 2)
    .map(([key, list]) => ({ key, list })).sort((a, b) => a.key.localeCompare(b.key))
  const body = { asOf: new Date().toISOString().slice(0, 10), players: players.length, twins }
  console.log(`${players.length} players, ${twins.length} names worn twice (${twins.filter((t) => new Set(t.list.map((x) => x.sport)).size >= 2).length} across leagues)`)
  if (!process.argv.includes('--dry')) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, `// WRITTEN BY scripts/refresh-name-twins.mjs (do not edit by hand): every full name worn by two players, all four leagues.\nexport const NAME_TWINS = ${JSON.stringify(body, null, 1)}\n`); console.log(`wrote ${path.relative(ROOT, OUT)}`) }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1) })
