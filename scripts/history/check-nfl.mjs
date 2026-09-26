#!/usr/bin/env node
// KNOWN-FACT TESTS for hist_nfl + the NFL claims (milestones plan, section 6).
// Facts are cut at `before: 2025` on purpose: they were checked by hand
// against seasons up to 2024. Run after build-nfl.mjs:
//   node scripts/history/check-nfl.mjs
import { createRequire } from 'node:module'
import './../_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { lastTime, wordClaim } = await import('../../lib/history/lastTime.js')
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0; let fail = 0
const check = (label, ok, got) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -- got ${JSON.stringify(got)}`}`); ok ? pass++ : fail++ }
const rows = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return (data || []).map((r) => ({ ...r, source_id: r.player_id })) }

// Rams (LA, incl. St. Louis): last 1,500-receiving-yard season before 2025 -> Cooper Kupp 2021, 1,947.
const rams = await rows(db.from('hist_nfl').select('season, player_id, name, team, franchise, rec_yds').eq('franchise', 'LA').neq('team', 'TOT').gte('rec_yds', 1500))
const a = lastTime(rams, { stat: 'rec_yds', value: 1500, franchise: 'LA', before: 2025 })
check('Rams 1,500 rec yds before 2025 -> Cooper Kupp 2021 (1,947)', a.lastSeason === 2021 && /Kupp/.test(a.lastPlayer) && a.lastValue === 1947, a)

// 49ers: a 20-scrimmage-TD season before 2025 -> Christian McCaffrey 2023, 21 (14 rush + 7 rec).
const sf = await rows(db.from('hist_nfl').select('season, player_id, name, team, franchise, total_td').eq('franchise', 'SF').neq('team', 'TOT').gte('total_td', 20))
const b = lastTime(sf, { stat: 'total_td', value: 20, franchise: 'SF', before: 2025 })
check('49ers 20 scrimmage TDs before 2025 -> Christian McCaffrey 2023 (21)', b.lastSeason === 2023 && /McCaffrey/.test(b.lastPlayer) && b.lastValue === 21, b)

// A traded season: McCaffrey 2022 (CAR then SF) -- team rows sum to TOT.
const cmc = await rows(db.from('hist_nfl').select('team, total_td, rush_yds, rec_yds, g').eq('season', 2022).eq('name', 'Christian McCaffrey'))
const tot = cmc.find((r) => r.team === 'TOT'); const parts = cmc.filter((r) => r.team !== 'TOT')
check('McCaffrey 2022: CAR + SF rows sum to TOT', parts.length === 2 && tot && ['total_td', 'rush_yds', 'rec_yds', 'g'].every((k) => parts.reduce((s, r) => s + r[k], 0) === tot[k]), cmc)

// Coverage wording: nothing found inside the data says "since at least 1999", never "ever".
const w = wordClaim({ lastSeason: null, coverageFrom: 1999 }, { who: 'Jets tight end', what: '15 touchdowns', season: 2026 })
check('never-done NFL claim reads "since at least 1999"', w === 'first Jets tight end to 15 touchdowns since at least 1999', w)

const { count } = await db.from('hist_nfl').select('*', { count: 'exact', head: true })
check('hist_nfl loaded (>45,000 rows)', count > 45000, count)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
