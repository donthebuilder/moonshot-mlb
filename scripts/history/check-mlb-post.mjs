// Postseason History Watch (lib/history/mlbPost.js).
//   node --import ./scripts/_esm-resolve.mjs scripts/history/check-mlb-post.mjs [--offline]
// 1. pure claim rules on TEST rows (made up, labelled TEST -- not real history)
// 2. live: hist_mlb_post (Lahman) and StatsAPI agree on a known career split
// 3. live dry run: the watch on the 2025 World Series rosters, treating 2025
//    as "this October" (history < 2025, live numbers = the whole 2025 run)
import { createRequire } from 'node:module'
import { postRecords, postClaims, mlbPostWatch, isPostseasonDay } from '../../lib/history/mlbPost.js'

const req = createRequire(import.meta.url)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }

// ── 1. pure (TEST rows) ─────────────────────────────────────────────────────
const TEST = [
  { season: 2019, source_id: 'testa01', name: 'TEST Alpha', hr: 2 },
  { season: 2019, source_id: 'testb01', name: 'TEST Bravo', hr: 1 },
  { season: 2015, source_id: 'testa01', name: 'TEST Alpha', hr: 4 },
  { season: 2011, source_id: 'testc01', name: 'TEST Charlie', hr: 3 },
  { season: 2011, source_id: 'testa01', name: 'TEST Alpha', hr: 1 },
]
const rec = postRecords(TEST)
check(rec.lastSeason === 2019 && rec.seasonRecord === 4 && rec.careerRecord === 7, 'records: last 2019, one-postseason 4 (Alpha 2015), career 7 (Alpha)')
const base = { name: 'TEST Hitter', teamName: 'Testers', clubHrThisOctober: 0, hrThisOctober: 0, careerForClub: 0 }
const d = postClaims(base, rec, 2026)
check(d.length === 1 && d[0].kind === 'DROUGHT' && /since TEST Alpha and TEST Bravo in 2019/.test(d[0].text), `drought: "${d[0]?.text}"`)
check(postClaims(base, rec, 2022).length === 0, 'drought inside MIN_GAP (2019 -> 2022) is not said')
check(postClaims({ ...base, clubHrThisOctober: 1 }, rec, 2026).length === 0, 'club already homered this October: no drought')
const s = postClaims({ ...base, clubHrThisOctober: 5, hrThisOctober: 3 }, rec, 2026)
check(s.some((c) => c.kind === 'SEASON' && /ties the Testers record for HR in one postseason \(4, TEST Alpha in 2015\)/.test(c.text)), 'one-postseason: 3 of 4 -> ties')
check(postClaims({ ...base, clubHrThisOctober: 5, hrThisOctober: 3, rivalNow: 4 }, rec, 2026).every((c) => c.kind !== 'SEASON'), 'a teammate already at 4 this October: the record claim is not said')
const c = postClaims({ ...base, clubHrThisOctober: 1, careerForClub: 7 }, rec, 2026)
check(c.some((x) => x.kind === 'CAREER' && /most postseason HR in Testers history, passing TEST Alpha \(7\)/.test(x.text)), 'career: 7 of 7 -> passing')
check(postClaims({ ...base, name: 'TEST Alpha', clubHrThisOctober: 1, careerForClub: 7 }, rec, 2026).every((x) => x.kind !== 'CAREER'), 'the record holder is never "one away" from himself')

if (!process.argv.includes('--offline')) {
  // ── 2. Lahman vs StatsAPI, Freddie Freeman's Braves postseason HR ─────────
  const { createClient } = req('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: fr } = await db.from('hist_mlb_post').select('hr').eq('source_id', 'freemfr01').eq('franchise', 'ATL')
  const lahman = (fr || []).reduce((a, r) => a + r.hr, 0)
  const j = await (await fetch('https://statsapi.mlb.com/api/v1/people?personIds=518692&hydrate=stats(group=[hitting],type=[yearByYear],gameType=[P])')).json()
  const api = (j.people[0].stats || []).flatMap((x) => x.splits || []).filter((x) => x.team?.id === 144).reduce((a, x) => a + Number(x.stat?.homeRuns || 0), 0)
  check(lahman === api && lahman > 0, `Freeman, Braves postseason HR: Lahman ${lahman} = StatsAPI ${api}`)
  check((await isPostseasonDay('2025-10-24')) === true && (await isPostseasonDay('2026-09-27')) === false, 'isPostseasonDay: 2025 WS game 1 yes, 2026-09-27 no')

  // ── 3. dry run: 2025 World Series rosters ─────────────────────────────────
  const teams = new Map()
  const t = await (await fetch('https://statsapi.mlb.com/api/v1/teams?sportId=1&season=2025')).json()
  // Abbrev -> franchise from the CURRENT season's rows (StatsAPI abbrevs: LAD),
  // as watch.js teams() does; 2025's rows are Lahman's codes (LAN).
  const { data: frs } = await db.from('hist_mlb').select('team, franchise').eq('season', 2026).neq('team', 'TOT').not('franchise', 'is', null).limit(5000)
  const frOf = new Map((frs || []).map((r) => [r.team, r.franchise]))
  for (const x of t.teams || []) teams.set(x.abbreviation, { franchise: frOf.get(x.abbreviation) || null, teamName: x.teamName, id: x.id })
  const rows = []
  for (const id of [119, 141]) {
    const r = await (await fetch(`https://statsapi.mlb.com/api/v1/teams/${id}/roster?season=2025&rosterType=active`)).json()
    for (const p of r.roster || []) if (p.position?.type !== 'Pitcher') rows.push({ player_id: p.person.id })
  }
  const items = await mlbPostWatch(rows, 2025, teams)
  console.log(`   dry run, ${rows.length} hitters (LAD + TOR, full 2025 postseason as "this October"):`)
  for (const i of items) console.log(`   ${i.kind.padEnd(7)} ${i.name} (${i.team}) ${i.hr} ${i.unit} -> ${i.claim}`)
  check(items.length > 0 && items.every((i) => i.claim && i.proof?.allSince?.length), 'dry run finds claims, each with its proof rows')
  check(items.some((i) => i.kind === 'SEASON' && i.name === 'Shohei Ohtani' && /sets the Dodgers record .*\(8, Corey Seager in 2020\)/.test(i.claim)), 'Ohtani at 8 = the Dodgers one-postseason record (Seager 2020) -> "sets"')
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
