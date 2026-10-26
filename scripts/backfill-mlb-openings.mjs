// node --env-file=.env.local --import ./scripts/_esm-resolve.mjs scripts/backfill-mlb-openings.mjs [--season 2026] [--dry] [--out rows.jsonl]
// MOONSHOT'S OPENINGS BACKFILL (2026-10-22, plan claude/BATCH-FIRSTS-PLAN-2026-10-22.txt): every final regular-season and
// October game of a season (spring training too, stored apart as season_type 1) into opening_games and opening_players, the
// same rows the homers tick writes (lib/mlb/openings.js), marked source='backfill'. Needs
// supabase/migrations/202610221500_openings_mlb.sql run first. Idempotent (upsert) and resumable: a game already on file is
// skipped. Gentle on statsapi: four feeds at a time (~70 KB each, fields-trimmed). --dry counts without writing; --out writes the
// rows to a file as JSON lines (one { game, players } a line) instead of the database.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, appendFileSync } from 'node:fs'
import { mlbOpeningRows, writeMlbOpening, feedUrl } from '../lib/mlb/openings.js'
import { unfilledGames, writePreAtt } from '../lib/openings/preAtt.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const SEASON = Number(arg('--season', '2026')), DRY = process.argv.includes('--dry'), OUT = arg('--out', null)
const db = DRY || OUT ? null : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

if (db) {
  const probe = await db.from('opening_games').select('first_hr_pa').limit(1)
  if (probe.error) { console.error(`the MLB columns aren't there yet (${probe.error.message}) -- run supabase/migrations/202610221500_openings_mlb.sql first`); process.exit(1) }
}
// --fill-pre-att [--season 2026] [--limit N] [--dry]: games already on file with a first run but no plates-to-first-run count get
// that count (re-read once, only those two columns written; lib/openings/preAtt.js). Without --season, every season on file.
// Run once after supabase/migrations/202610261100.
if (process.argv.includes('--fill-pre-att')) {
  const fdb = db || createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const todo = (await unfilledGames(fdb, 'mlb', process.argv.includes('--season') ? SEASON : null)).slice(0, Number(arg('--limit', Infinity)))
  console.log(`${todo.length} MLB games to fill`)
  let ok = 0, none = 0, bad = 0
  const fill = async (r) => {
    for (let tryN = 0; tryN < 3; tryN++) {
      try {
        const res = await fetch(feedUrl(r.game_id))
        if (!res.ok) throw new Error(`feed ${res.status}`)
        const row = mlbOpeningRows(await res.json())?.game
        if (DRY) { console.log(`  ${r.game_date} ${r.away}@${r.home}: ${row?.pre_first_att_away} / ${row?.pre_first_att_home}`); ok++; return }
        const err = await writePreAtt(fdb, 'mlb', r.game_id, row)
        if (err === 'no first score') none++; else if (err) throw new Error(err); else ok++
        return
      } catch (e) {
        if (tryN === 2) { bad++; console.log(`  ${r.game_id}: ${e?.message} (left for a re-run)`) }
        await new Promise((res) => setTimeout(res, 1500))
      }
    }
  }
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(fill))
    if ((i / 4) % 50 === 0) console.log(`  ${Math.min(i + 4, todo.length)} / ${todo.length} · ${ok} filled${bad ? `, ${bad} failed` : ''}`)
  }
  console.log(`done: ${ok} filled${DRY ? ' (dry, nothing written)' : ''}, ${none} with no first run, ${bad} failed`)
  process.exit(0)
}
const sched = await (await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${SEASON}&gameType=S,R,F,D,L,W&fields=dates,games,gamePk,gameType,status,abstractGameState`)).json()
let pks = [...new Set((sched?.dates || []).flatMap((d) => d.games || []).filter((g) => g?.status?.abstractGameState === 'Final').map((g) => String(g.gamePk)))]
if (db) {
  const on = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('opening_games').select('game_id').eq('sport', 'mlb').eq('season', SEASON).order('game_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data || []) on.add(String(r.game_id))
    if (!data || data.length < 1000) break
  }
  pks = pks.filter((pk) => !on.has(pk))
}
console.log(`${SEASON}: ${pks.length} final games to read`)
if (OUT) writeFileSync(OUT, '')
let games = 0, players = 0, failed = 0, none = 0
const one = async (pk) => {
  for (let tryN = 0; tryN < 3; tryN++) {
    try {
      const r = await fetch(feedUrl(pk))
      if (!r.ok) throw new Error(`feed ${r.status}`)
      const rows = mlbOpeningRows(await r.json())
      if (!rows) { none++; return }   // an All-Star / exhibition game, or no plays
      if (OUT) appendFileSync(OUT, `${JSON.stringify(rows)}\n`)
      else if (db) await writeMlbOpening(db, rows, 'backfill')
      games++; players += rows.players.length
      return
    } catch (e) {
      if (tryN === 2) { failed++; console.log(`  ${pk}: ${e?.message} (left for a re-run)`) }
      await new Promise((res) => setTimeout(res, 1500))
    }
  }
}
for (let i = 0; i < pks.length; i += 4) {
  await Promise.all(pks.slice(i, i + 4).map(one))
  if ((i / 4) % 50 === 0) console.log(`  ${i + 4} / ${pks.length} · ${games} games, ${players} starter rows${failed ? `, ${failed} failed` : ''}`)
}
console.log(`done: ${games} games, ${players} starter rows${DRY ? ' (dry, nothing written)' : OUT ? ` (to ${OUT})` : ''}, ${none} not stored (exhibition / no plays), ${failed} failed`)
