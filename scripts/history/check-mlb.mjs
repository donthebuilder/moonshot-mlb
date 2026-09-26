#!/usr/bin/env node
// KNOWN-FACT TESTS for hist_mlb + the claim engine (milestones plan, section
// 6). A claim type ships only after these pass. Run after build-mlb.mjs:
//   node scripts/history/check-mlb.mjs
import { createRequire } from 'node:module'
import './../_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { mlbClaims } = await import('../../lib/history/mlb.js')
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0; let fail = 0
const check = (label, ok, got) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -- got ${JSON.stringify(got)}`}`); ok ? pass++ : fail++ }

// C1: Braves catcher, 25 HR, before 2026 -> Javy Lopez 2003 (43). The fact is
// Donovan's own example (09-26: "first Braves catcher to reach 25 homers in
// a season since 2003"); Lopez's 43 is his 2003 line in Lahman Batting.
const c1 = await mlbClaims({ name: 'Drake Baldwin', franchise: 'ATL', teamName: 'Braves', position: 'C' }, { value: 25, season: 2026, what: '25 HR' })
const one = c1.find((c) => c.type === 'C1')
check('C1 Braves C 25 HR -> Javy Lopez 2003 (43)', one?.proof.lastSeason === 2003 && /Lopez/.test(one?.proof.lastPlayer) && one?.proof.lastValue === 43, one?.proof)
check('C1 wording', one?.text === 'first Braves catcher to 25 HR since Javy Lopez in 2003', one?.text)

// C4: every catcher season of 40+ HR before 2026, against the published list
// (Campanella 1953; Bench 1970, 1972; Hundley 1996; Piazza 1997, 1999;
// Lopez 2003; Perez 2021; Raleigh 2025). Checked by hand 09-26 against the
// widely published catcher single-season list; re-check if a row changes.
const { data: c40 } = await db.from('hist_mlb').select('season, name, team, hr').eq('position', 'C').gte('hr', 40).lt('season', 2026)
const seasons = [...new Set((c40 || []).filter((r) => r.team !== 'TOT' || true).map((r) => `${r.season} ${r.name.split(' ').pop()}`))].sort()
const want = ['1953 Campanella', '1970 Bench', '1972 Bench', '1996 Hundley', '1997 Piazza', '1999 Piazza', '2003 Lopez', '2021 Perez', '2025 Raleigh']
check('C4 catcher 40+ HR seasons match the published list', JSON.stringify(seasons) === JSON.stringify(want), seasons)

// Suppress: a franchise rung reached inside MIN_GAP seasons is not a claim
// (Nationals 30 HR: James Wood 2025).
const sup = await mlbClaims({ name: 'test', franchise: 'WSN', teamName: 'Nationals', position: 'OF' }, { value: 30, season: 2026, what: '30 HR' })
check('suppress: Nationals 30 HR (James Wood 2025) is not a story', !sup.some((c) => c.type === 'C2'), sup)

// Row count sanity.
const { count } = await db.from('hist_mlb').select('*', { count: 'exact', head: true })
check('hist_mlb loaded (>135,000 rows)', count > 135000, count)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
