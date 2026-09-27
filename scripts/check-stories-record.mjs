// lib/stories/record.js: the freeze window, the frozen row, and a round trip
// on production's storyline_log with TEST game ids (TEST-RECORD-*), deleted
// at the end. Nothing real is written.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-stories-record.mjs
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { createClient } = req('@supabase/supabase-js')
const { freezeDue, frozenRow, gradeRows, readRecord, FREEZE_MS } = await import('../lib/stories/record.js')

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const now = Date.parse('2026-09-27T20:00:00Z')
const at = (min) => new Date(now + min * 60000).toISOString()
const games = [
  { game_id: 'A', start: at(10), state: 'pre' }, { game_id: 'B', start: at(20), state: 'pre' },
  { game_id: 'C', start: at(-1), state: 'live' }, { game_id: 'D', start: at(5), state: 'pre' }, { game_id: 'E', start: at(14), state: 'live' },
]
const due = freezeDue(games, new Set(['D']), now).map((g) => g.game_id)
check(due.join() === 'A', `freeze window ${FREEZE_MS / 60000} min: A (10 min out) yes; B (20) not yet; C started; D already frozen; E not 'pre' -> ${due.join()}`)

const TEST = (id, type, extra = {}) => ({ sport: 'mlb', day: '1999-01-01', game_id: 'TEST-RECORD-1', player_id: id, name: `TEST ${id}`, team: 'TST', opp: 'TSX', type, icon: '🔁', parts: [{ t: 'name', v: `TEST ${id}` }, { t: 'text', v: ' test line' }], text: `TEST ${id} test line`, numbers: {}, rarity: 0.5, source: 'TEST', board: { status: 'called', score: 50 }, ...extra })
const rows = [TEST('1', 'b2b'), TEST('2', 'birthday'), TEST('3', 'b2b'), TEST('_game', 'rivalry', { board: null })].map(frozenRow)
check(rows[0].board_status === 'called' && rows[0].numbers._parts.length === 2 && rows[3].board_status === null, 'frozen row keeps the board chip and the row\'s own drawing')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const clean = () => db.from('storyline_log').delete().eq('game_id', 'TEST-RECORD-1')
await clean()
try {
  const w = await db.from('storyline_log').upsert(rows, { onConflict: 'sport,game_id,player_id,type', ignoreDuplicates: true })
  check(!w.error, `TEST rows frozen (${w.error?.message || 4})`)
  const again = await db.from('storyline_log').upsert(rows.map((r) => ({ ...r, text: 'CHANGED' })), { onConflict: 'sport,game_id,player_id,type', ignoreDuplicates: true })
  const { data: t1 } = await db.from('storyline_log').select('text').eq('game_id', 'TEST-RECORD-1').eq('player_id', '1')
  check(!again.error && t1?.[0]?.text === 'TEST 1 test line', 'a second freeze changes nothing (first write wins)')
  const { data: open } = await db.from('storyline_log').select('sport,day,game_id,player_id,type,numbers').eq('game_id', 'TEST-RECORD-1').is('graded_at', null)
  const lines = new Map([['1', { ab: 4, h: 1, hr: 1, tb: 4, r: 1, rbi: 1 }], ['2', { ab: 3, h: 2, hr: 0, tb: 2, r: 0, rbi: 0 }]])
  const g = await gradeRows(db, 'mlb', open, lines)
  const back = await readRecord(db, 'mlb', ['TEST-RECORD-1'])
  const o = Object.fromEntries(back.map((s) => [`${s.player_id}:${s.type}`, s.outcome ? `${s.outcome.bar}:${s.outcome.base}/${s.outcome.strong}` : 'none']))
  check(g.graded === 4, `graded ${g.graded} rows`)
  check(o['1:b2b'] === 'hr:hit/miss', `b2b, homered once -> ${o['1:b2b']}`)
  check(o['2:birthday'] === 'productive:hit/hit', `birthday, 2 hits -> productive + strong (${o['2:birthday']})`)
  check(o['3:b2b'] === 'hr:void/null', `no line -> void (${o['3:b2b']})`)
  check(o['_game:rivalry'] === 'none', 'game-level story: closed, no outcome')
  check(back.every((s) => s.frozen && s.parts?.length && s.board !== undefined), 'read back in the story shape, with its parts and chip')
} finally {
  const d = await clean()
  const { count } = await db.from('storyline_log').select('game_id', { count: 'exact', head: true }).eq('game_id', 'TEST-RECORD-1')
  check(!d.error && count === 0, 'TEST rows deleted')
}
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
