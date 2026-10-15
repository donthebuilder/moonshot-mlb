#!/usr/bin/env node
// BACKFILL ISSUE NUMBERS FOR OLDER CARDS. DRY RUN BY DEFAULT: it reads, prints what it WOULD issue per moment, and writes nothing. --apply writes (Donovan decides; nobody else runs it).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/backfill-card-issues.mjs [--env <file>] [--since YYYY-MM-DD] [--min-tier base|star|elite|legend] [--json] [--apply]
// What it does: reads every stored feed (lamp_goal_feed, homer_feed, nfl_td_feed, the published NFL game logs, the stored lock prices), keeps the cards the CURRENT rules (lib/cards/rulesV2.js)
// prove, drops the ones already numbered, orders the rest by game day then the moment's id, and (with --apply) calls the SAME issue_card() the live tick calls with the SAME deterministic ids
// (lib/cards/issue.js issueArgs), so re-running it, or running it after the tick, issues nothing twice. It writes through the service role only. BUCKETS (nba) is never touched.
// The env file is read into process.env and never printed.
import { readFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const APPLY = args.includes('--apply')
const JSON_OUT = args.includes('--json')
const envFile = flag('--env') || '.env.local'
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
    if (m && !(m[1] in process.env)) process.env[m[1]] = /^(".*"|'.*')$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
  }
}
const { adminClient } = await import('../lib/supabase/admin.js')
const { historyItems, readExisting, plan, applyPlan } = await import('../lib/cards/backfill.js')
const db = adminClient()
if (!db) { console.error('NOT CONFIGURED: no service client (--env <file> with the Supabase URL and service key)'); process.exit(2) }
const minTier = flag('--min-tier') || 'base'
const since = flag('--since') || '2000-01-01'
const log = (...a) => { if (!JSON_OUT) console.log(...a) }

log(`${APPLY ? 'APPLY' : 'DRY RUN (nothing is written)'}  since ${since}  min tier ${minTier}`)
const existing = await readExisting(db)
log(existing.missing ? 'card_issues: NOT THERE YET (the SQL has not been run): planning from an empty table' : `card_issues: ${existing.rows.length} cards already numbered`)
const items = await historyItems(db, { since, onStep: (s) => log(`  reading ${s}`) })
const p = plan(items, existing.rows, { minTier })

const MOMENTS = Object.keys(p.byMoment).sort()
if (JSON_OUT) {
  console.log(JSON.stringify({ apply: APPLY, tableMissing: existing.missing, alreadyNumbered: existing.rows.length, wouldIssue: p.issue.length, outOfOrder: p.outOfOrder, byMoment: p.byMoment }, null, 2))
} else {
  console.log('\nmoment                      proven  already  would issue   numbers        game days                tiers')
  for (const m of MOMENTS) {
    const s = p.byMoment[m]
    console.log(`${m.padEnd(26)}  ${String(s.proven).padStart(6)}  ${String(s.already).padStart(7)}  ${String(s.issue).padStart(11)}   ${(s.issue ? `${s.first}..${s.last}` : '-').padEnd(13)}  ${(s.issue ? `${s.firstDay}..${s.lastDay}` : '-').padEnd(23)}  ${Object.entries(s.tiers).map(([t, n]) => `${t} ${n}`).join(', ')}`)
  }
  console.log(`\nTOTAL would issue: ${p.issue.length}   (read ${items.length} stored events; ${p.skipped} earned no public card at min tier ${minTier})`)
  if (p.outOfOrder.length) console.log(`NOTE: ${p.outOfOrder.join(', ')} already hold newer numbers from the live tick, so the older cards get the numbers AFTER them (history order cannot be kept there).`)
}

if (!APPLY) { log('\nDry run only. Nothing was written. Re-run with --apply to issue these.'); process.exit(0) }
if (existing.missing) { console.error('REFUSED: card_issues does not exist. Run supabase/migrations/202610141500_card_issues.sql first.'); process.exit(3) }
const r = await applyPlan(db, p, { onProgress: (i, n) => log(`  ${i}/${n}`) })
console.log(`\nissued ${r.issued}, already there ${r.existing}, number drift ${r.drift}, errors ${r.errors.length}`)
for (const e of r.errors) console.log(`  ERROR ${e}`)
process.exit(r.errors.length ? 1 : 0)
