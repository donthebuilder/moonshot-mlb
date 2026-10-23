#!/usr/bin/env node
// 💨 WHICH PREGAME LINE ENDS IN A BLOWOUT? (2026-10-22, Donovan: "21 is a blowout, 4 or more is a blowout for hockey" -- the FINAL
// margins, lib/blowout.js BLOWOUT_FINAL. Measured here before any pregame watch number is picked for NFL / NHL.)
// Every final regular-season game of the seasons asked, its CLOSING line from ESPN's odds feed (the provider it lists first, never
// an in-game line), grouped: NFL by the favourite's spread; NHL by the favourite's moneyline (the puck line is always 1.5, so the
// moneyline is the only pregame read of a lopsided game). For each group: games, favourite won, favourite won by the blowout margin,
// and either side by it. Nothing is written; real games and real lines only.
//   node scripts/measure-blowout-lines.mjs nfl 2024 2025      node scripts/measure-blowout-lines.mjs nhl 2025 2026
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const SPORT = process.argv[2]
const SEASONS = process.argv.slice(3).filter((x) => /^\d{4}$/.test(x)).map(Number)
const ci = process.argv.indexOf('--cache'); const CACHE = ci > 0 ? process.argv[ci + 1] : null
const PATH = { nfl: 'football/nfl', nhl: 'hockey/nhl' }[SPORT]
if (!PATH || !SEASONS.length) { console.error('usage: measure-blowout-lines.mjs nfl|nhl <season> [season ...] [--cache file]'); process.exit(1) }
const BLOW = { nfl: 21, nhl: 4 }[SPORT]
const UA = { Accept: 'application/json', 'User-Agent': 'DASHNetwork/1.0' }
const get = async (u) => { for (let i = 0; i < 4; i++) { const r = await fetch(u, { headers: UA }).catch(() => null); if (r?.ok) return r.json(); if (r?.status === 404) return null; await new Promise((s) => setTimeout(s, 500 * (i + 1))) } throw new Error(`fetch failed ${u}`) }
const pool = async (items, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k) } })) }
const am = (v) => { const s = String(v ?? '').trim().toUpperCase(); if (s === 'EVEN' || s === 'EV') return 100; const n = Number(s.replace(/^\+/, '')); return Number.isFinite(n) && s !== '' ? n : null }

function readClose(j) {
  const it = (j?.items || []).filter((x) => !/live/i.test(x.provider?.name || '')).slice().sort((a, b) => (a.provider?.priority ?? 99) - (b.provider?.priority ?? 99))[0]
  if (!it) return null
  const H = it.homeTeamOdds, A = it.awayTeamOdds
  const hs = am(H?.close?.pointSpread?.american) ?? (am(A?.close?.pointSpread?.american) != null ? -am(A.close.pointSpread.american) : (Number.isFinite(it.spread) ? it.spread : null))
  return { provider: it.provider?.name || null, spreadHome: hs, mlHome: am(H?.close?.moneyLine?.american) ?? am(H?.moneyLine), mlAway: am(A?.close?.moneyLine?.american) ?? am(A?.moneyLine) }
}

let games = CACHE && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null
if (!games) {
  const teams = (await get(`https://site.api.espn.com/apis/site/v2/sports/${PATH}/teams`)).sports[0].leagues[0].teams.map((t) => t.team)
  const byId = new Map()
  for (const season of SEASONS) {
    await pool(teams, 6, async (t) => {
      const j = await get(`https://site.api.espn.com/apis/site/v2/sports/${PATH}/teams/${t.id}/schedule?season=${season}&seasontype=2`)
      for (const e of j?.events || []) {
        const c = e.competitions?.[0]; if (!c || c.status?.type?.completed !== true) continue
        const away = c.competitors.find((x) => x.homeAway === 'away'), home = c.competitors.find((x) => x.homeAway === 'home')
        const as = Number(away?.score?.value ?? away?.score?.displayValue), hs = Number(home?.score?.value ?? home?.score?.displayValue)
        if (!Number.isFinite(as) || !Number.isFinite(hs)) continue
        byId.set(String(e.id), { id: String(e.id), season, date: String(e.date).slice(0, 10), away: away.team.abbreviation, home: home.team.abbreviation, as, hs })
      }
    })
  }
  games = [...byId.values()]
  let done = 0
  await pool(games, 8, async (g) => {
    g.line = readClose(await get(`https://sports.core.api.espn.com/v2/sports/${PATH.replace('/', '/leagues/')}/events/${g.id}/competitions/${g.id}/odds`).catch(() => null))
    if (++done % 200 === 0) process.stderr.write(`  lines ${done}/${games.length}\n`)
  })
  if (CACHE) writeFileSync(CACHE, JSON.stringify(games))
}

// the favourite: NFL by spread (negative = home favoured), NHL by moneyline (the shorter price)
const fav = (g) => {
  const L = g.line; if (!L) return null
  if (SPORT === 'nfl') { if (L.spreadHome == null || L.spreadHome === 0) return null; return { home: L.spreadHome < 0, size: Math.abs(L.spreadHome) } }
  if (L.mlHome == null || L.mlAway == null || L.mlHome === L.mlAway) return null
  const home = L.mlHome < L.mlAway, ml = home ? L.mlHome : L.mlAway
  return { home, size: ml < 0 ? -ml : 100 - (ml - 100) }   // -250 -> 250; a plus-money "favourite" (both plus) -> under 100
}
const BANDS = SPORT === 'nfl'
  ? [[0.5, 2.5, 'by 1-2.5'], [3, 6.5, 'by 3-6.5'], [7, 9.5, 'by 7-9.5'], [10, 13.5, 'by 10-13.5'], [14, 99, 'by 14+']]
  : [[0, 149, '-100 to -149'], [150, 199, '-150 to -199'], [200, 249, '-200 to -249'], [250, 299, '-250 to -299'], [300, 9999, '-300 or shorter']]
const withLine = games.filter((g) => fav(g))
const allBlow = games.filter((g) => Math.abs(g.hs - g.as) >= BLOW).length
console.log(`${SPORT.toUpperCase()} ${SEASONS.join(', ')}: ${games.length} finals, ${withLine.length} with a closing line (${[...new Set(withLine.map((g) => g.line.provider))].join('/')}); ${allBlow} ended ${BLOW}+ (${Math.round((100 * allBlow) / games.length)}%)`)
for (const [lo, hi, label] of BANDS) {
  const xs = withLine.filter((g) => { const f = fav(g); return f.size >= lo && f.size <= hi })
  if (!xs.length) { console.log(`  favourite ${label.padEnd(16)}    0 games`); continue }
  let won = 0, favBlow = 0, anyBlow = 0
  for (const g of xs) { const f = fav(g); const m = f.home ? g.hs - g.as : g.as - g.hs; if (m > 0) won++; if (m >= BLOW) favBlow++; if (Math.abs(m) >= BLOW) anyBlow++ }
  const p = (x) => `${Math.round((100 * x) / xs.length)}%`
  console.log(`  favourite ${label.padEnd(16)} ${String(xs.length).padStart(4)} games · fav won ${won} (${p(won)}) · fav by ${BLOW}+ ${favBlow} (${p(favBlow)}) · either side ${BLOW}+ ${anyBlow} (${p(anyBlow)})`)
}
