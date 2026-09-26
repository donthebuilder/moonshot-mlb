#!/usr/bin/env node
// KNOWN-FACT TESTS for hist_nhl + the NHL claims (milestones plan, section 6).
// Run after build-nhl.mjs:  node scripts/history/check-nhl.mjs
import { createRequire } from 'node:module'
import './../_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { lastTime } = await import('../../lib/history/lastTime.js')
const { nhlClaims } = await import('../../lib/history/nhl.js')
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let pass = 0; let fail = 0
const check = (label, ok, got) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -- got ${JSON.stringify(got)}`}`); ok ? pass++ : fail++ }
const rowsFor = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return (data || []).map((r) => ({ ...r, source_id: r.player_id })) }

// The plan's own verification: Gretzky 92 goals in 1981-82.
const g82 = await rowsFor(db.from('hist_nhl').select('name, g').eq('season', 19811982).eq('name', 'Wayne Gretzky'))
check('Gretzky 1981-82: 92 goals', g82.some((r) => r.g === 92), g82)

// Oilers (franchise 25): last 50-goal season before 2025-26 -> Leon Draisaitl, 2024-25, 52.
const oil = await rowsFor(db.from('hist_nhl').select('season, player_id, name, team, franchise, g').eq('franchise', '25').gte('g', 50).lt('season', 20252026))
const a = lastTime(oil, { stat: 'g', value: 50, franchise: '25', before: 20252026 })
check('Oilers last 50-goal season -> Draisaitl 2024-25 (52)', a.lastSeason === 20242025 && /Draisaitl/.test(a.lastPlayer) && a.lastValue === 52, a)

// Blackhawks (franchise 11) rookie goals record -> Steve Larmer, 43, 1982-83.
const hawks = await rowsFor(db.from('hist_nhl').select('season, player_id, name, team, g, rookie').eq('franchise', '11').eq('rookie', true).order('g', { ascending: false }).limit(3))
check('Blackhawks rookie goals record -> Steve Larmer 43 (1982-83)', /Larmer/.test(hawks[0]?.name) && hawks[0]?.g === 43 && hawks[0]?.season === 19821983, hawks)

// A traded season: Rantanen 2024-25 franchise rows sum to his TOT (32 G, 82 GP).
const ran = await rowsFor(db.from('hist_nhl').select('team, g, gp').eq('season', 20242025).eq('name', 'Mikko Rantanen'))
const tot = ran.find((r) => r.team === 'TOT'); const parts = ran.filter((r) => r.team !== 'TOT')
check('Rantanen 2024-25: franchise rows sum to TOT (32 G / 82 GP)', tot?.g === 32 && parts.reduce((s, r) => s + r.g, 0) === 32 && parts.reduce((s, r) => s + r.gp, 0) === 82, ran)

// Suppress: an Oiler reaching 50 in 2025-26 is inside MIN_GAP of Draisaitl 2024-25.
const sup = await nhlClaims({ franchise: '25', position: 'C', rookie: false, age: 28 }, { stat: 'g', value: 50, season: 20252026 })
check('suppress: Oilers 50 goals (Draisaitl 2024-25) is not a story', !sup.some((c) => c.type === 'C2'), sup)

const { count } = await db.from('hist_nhl').select('*', { count: 'exact', head: true })
check('hist_nhl loaded (>50,000 rows)', count > 50000, count)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
