#!/usr/bin/env node
// WHY HIM AND NOT THE OTHER GUY (2026-10-31, lib/card/lockAudit.js). Reads what the lock saved and says, per slot, who was picked and what happened to
// everyone ranked above and around him. Read-only. Needs the service key in .env.local (from the repo root).
//   node scripts/card-why.mjs --sport nfl --date 2026-10-26            every slot of that window
//   node scripts/card-why.mjs --sport nfl --date 2026-10-26 --name pierce   one man: where he ranked and the verdict
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null }
const sport = arg('sport'); const date = arg('date'); const name = (arg('name') || '').toLowerCase()
if (!sport || !date) { console.log('usage: node scripts/card-why.mjs --sport nfl --date YYYY-MM-DD [--name surname]'); process.exit(2) }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const WORDS = { picked: 'PICKED', price: 'under the price floor', line: 'under the line floor', no_price: 'no stored price at lock', no_line_or_price: 'no stored line and price', game_used: 'his game already had a straight', lower_than_pick: 'ranked below the pick' }
const { data, error } = await db.from('card_lock_audit').select('*').eq('sport', sport).eq('card_date', date)
if (error) { console.log(`read failed: ${error.message}`); process.exit(1) }
if (!data?.length) { console.log(`No lock audit for ${sport} ${date}. It is written at each lock from 2026-10-31 on; older locks only have card_calls and card_tracked.`); process.exit(0) }
for (const w of data) {
  console.log(`\n${sport.toUpperCase()} ${date} · ${w.window_games} game(s) · ${w.plays?.straights} straight(s) + ${w.plays?.twoMan} Two-Man · ${w.model_version}${w.note ? ` · ${w.note}` : ''}`)
  for (const s of w.audit || []) {
    console.log(`\n  slot ${s.slot} · ${s.market} · ${s.eligible} eligible (top ${s.shown} shown)`)
    for (const r of s.ranked) {
      if (name && !String(r.name || '').toLowerCase().includes(name)) continue
      console.log(`   #${String(r.rank).padStart(2)} ${String(r.name || r.player_id).padEnd(26)} score ${r.score ?? '—'}${r.line != null ? ` · line ${r.line}` : ''}${r.price != null ? ` · ${r.price > 0 ? '+' : ''}${r.price}` : ''}  →  ${WORDS[r.verdict] || r.verdict}`)
    }
  }
  for (const k of w.skipped || []) console.log(`\n  slot ${k.slot} SKIPPED (${k.market}): ${k.reason}`)
  console.log(`\n  picked: ${(w.plays?.picked || []).map((p) => `${p.product}${p.slot ? ` ${p.slot}` : ''} ${p.name || p.player_id}`).join(' · ') || 'nothing'}`)
}
