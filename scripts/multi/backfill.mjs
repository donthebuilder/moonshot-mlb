#!/usr/bin/env node
// THE 2+ CLUB BACKFILL (2026-09-27). Idempotent: re-running upserts the same
// keys, so the row count must not change.
//   node scripts/multi/backfill.mjs mlb|nfl|nhl|all [--dry]
// MLB: 2026 regular season to yesterday. NFL: 2026 REG so far. NHL: 2025-26
// (LAST SEASON, labelled 'pre') and 2026-27 (empty until the 09-29 opener).
import { createRequire } from 'node:module'
import './../_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const { buildMlb, buildNfl, buildNhl, storeMulti } = await import('../../lib/multi/build.js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const which = process.argv[2] || 'all'
const dry = process.argv.includes('--dry')
const log = (m) => console.log(m)
const yesterday = new Date(Date.now() - 7 * 3600e3 - 864e5).toISOString().slice(0, 10)   // Phoenix, like the slate

const jobs = {
  mlb: () => buildMlb(db, { from: '2026-03-25', to: yesterday, log }),
  nfl: () => buildNfl(db, { season: 2026, log }),
  nhl: async () => {
    const a = await buildNhl(db, { seasonId: 20252026, log })
    const b = await buildNhl(db, { seasonId: 20262027, log })
    return { rows: [...a.rows, ...b.rows], gp: [...a.gp, ...b.gp] }
  },
}
for (const s of which === 'all' ? Object.keys(jobs) : [which]) {
  const t0 = Date.now()
  const built = await jobs[s]()
  const by = {}
  for (const r of built.rows) { const k = `${r.kind}:${r.status}`; by[k] = (by[k] || 0) + 1 }
  console.log(`${s}: ${built.rows.length} rows ${JSON.stringify(by)}, gp ${built.gp.length} players, ${Math.round((Date.now() - t0) / 1000)}s`)
  if (!dry) console.log(`${s}: stored`, await storeMulti(db, built))
}
