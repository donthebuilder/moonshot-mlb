#!/usr/bin/env node
// WHAT WOULD THE FACT ENGINE POST TODAY? (fix23-facts-1009, 2026-10-09). A dry run off REAL stored data and the
// real feeds: it finds, writes and checks the day's facts per sport and PRINTS them. It posts nothing, writes
// no row, calls no X or Discord endpoint (postToX is never reached), and reads Supabase read-only (fact_posts,
// dash_flags). Secrets are read from .env.local by @next/env and never printed.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/facts-dry-run.mjs [--sports nfl,mlb] [--window] [--json]
//   --window  respect the posting windows (default: show what would post whatever the hour, with the window noted)
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const req = createRequire(path.join(root, 'package.json'))
// env: this tree's own .env*, else the main checkout's (the worktree has none)
const envDir = [root, path.resolve(root, '../../..')].find((d) => fs.existsSync(path.join(d, '.env.local'))) || root
req('@next/env').loadEnvConfig(envDir, false, { info() {}, error() {} })
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null }
const flag = (k) => process.argv.includes(k)
const sports = arg('--sports') ? arg('--sports').split(',') : null

// NOTHING can post from here: X is cut off before the engine loads
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']) delete process.env[k]
const { createClient } = req('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { runFacts } = await import('../lib/facts/engine.js')
const out = await runFacts(db, { dry: true, ignoreWindow: !flag('--window'), force: false, sports })
if (flag('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }
console.log(`FACT ENGINE DRY RUN -- ${out.today} -- autopost: ${out.autopost?.on ? 'on' : 'off'} (${out.autopost?.why})`)
let total = 0
for (const [sport, r] of Object.entries(out.sports)) {
  const mine = out.tried.filter((t) => t.sport === sport && t.text)
  total += mine.length
  console.log(`\n== ${sport.toUpperCase()}  active:${r.active}${r.why ? ` (${r.why})` : ''}  game day:${r.gameDay || '-'}`)
  console.log(`   window: ${r.window || '-'}   posted today: ${r.postedToday}/${r.cap}   found: ${r.found}  below min score: ${r.belowMinScore}  already stored: ${r.seen}  repeat-blocked: ${r.repeats.length}${r.pendingNames ? `  names not confirmed: ${r.pendingNames}` : ''}`)
  if (r.held) console.log(`   held: ${r.held}`)
  for (const e of r.errors) console.log(`   ERROR: ${e}`)
}
console.log(`\nWould post (best first, the engine posts one per run; up to ${out.tried.length} drafted this run):`)
for (const t of out.tried) {
  console.log(`\n-- ${t.sport} ${t.family} score ${t.score} (${t.id}) writer:${t.writer}${t.text ? '' : '  REJECTED ' + JSON.stringify(t.rejected)}`)
  if (t.text) console.log(t.text.split('\n').map((l) => `   | ${l}`).join('\n'))
}
console.log(`\nSummary: ${out.found ?? 0} candidate fact(s) after repeat/seen/score filters; ${total} drafted and passed every check this run. ${out.skipped ? 'Engine: ' + out.skipped : ''}`)
