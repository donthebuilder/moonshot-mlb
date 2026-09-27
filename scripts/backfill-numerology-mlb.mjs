#!/usr/bin/env node
// HOT NUMBERS BACKFILL, MOONSHOT (2026-09-27, HOT-NUMBERS-FIX item 3).
//   node --import ./scripts/_esm-resolve.mjs scripts/backfill-numerology-mlb.mjs            dry run
//   node --import ./scripts/_esm-resolve.mjs scripts/backfill-numerology-mlb.mjs --write    writes
// Needs supabase/migrations/202609280600_numerology_numbers_rebuilt.sql run first.
//
// For each night the bot kept a slate for (slate_<date>_slim.json, the last
// ~14): pool = the hitters on that slate, events = who homered (homer_feed,
// the slate's own day), numbers = MLB people (jersey, birth date). Written to
// numerology_numbers with rebuilt = true -- they count in TRENDING, labelled,
// and never touch the graded lane record (numerology_log). A night already in
// the table is skipped (first write wins). Reads .env.local for the service
// key; never prints it.
import { createRequire } from 'node:module'
import { peopleInfo } from '../lib/numerology/mlbWriter.js'
import { fromMlb } from '../lib/numerology/adapters.js'
import { numbersNight } from '../lib/numerology/hotNumbers.js'
import { writeNumbersNight } from '../lib/numerology/record.js'

const WRITE = process.argv.includes('--write')
const req = createRequire(import.meta.url)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'

const listing = await (await fetch('https://api.github.com/repos/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/contents/public/data/current?ref=data')).json()
// Never today: its games may not be final. Re-run tomorrow to add it.
const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const dates = (Array.isArray(listing) ? listing : []).map((f) => /^slate_(\d{4}-\d{2}-\d{2})_slim\.json$/.exec(f.name)?.[1]).filter((d) => d && d < todayET).sort()
console.log(`${WRITE ? 'WRITE' : 'DRY RUN'} · slate archive nights: ${dates.join(' ')}`)

for (const day of dates) {
  const { count } = await db.from('numerology_numbers').select('value', { count: 'exact', head: true }).eq('sport', 'mlb').eq('day', day)
  if (count) { console.log(`${day}  already recorded (${count} rows) -- skipped`); continue }
  const slate = await (await fetch(`${BASE}/slate_${day}_slim.json`)).json().catch(() => null)
  const rows = Array.isArray(slate) ? slate : (slate?.players || [])
  const byId = new Map(rows.filter((r) => /^\d+$/.test(String(r?.player_id ?? ''))).map((r) => [String(r.player_id), r]))
  const { data: homers, error } = await db.from('homer_feed').select('player_id').eq('day', day)
  if (error) { console.log(`${day}  homer_feed read failed: ${error.message}`); continue }
  const hits = new Set((homers || []).map((r) => String(r.player_id)))
  const info = await peopleInfo([...byId.keys()])
  const players = [...byId].map(([id, r]) => ({ player_id: id, ...fromMlb(r, info.get(id) || null) }))
  const { rows: nightRows, events } = numbersNight(players, hits, day)
  const offSlate = [...hits].filter((id) => !byId.has(id)).length
  const line = `${day}  pool ${players.length} (people ${info.size}) · homer hitters ${hits.size} (${events} on the slate, ${offSlate} off it) · ${nightRows.length} rows`
  if (!WRITE) { console.log(line); continue }
  const res = await writeNumbersNight(db, 'mlb', day, players, hits, { rebuilt: true })
  console.log(`${line} -> ${res}`)
}
