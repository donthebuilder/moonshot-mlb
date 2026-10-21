#!/usr/bin/env node
// TEAM STORIES, GRADED BACKWARDS (2026-10-20). Before lib/stories/grade.js learned the team bars
// (soft D, back-to-back, power play), a frozen team story was closed with no outcome. This finds
// those rows (BUCKETS + LAMP, graded_at set, outcome null), reads each game's final from the
// league (the same readers the tick uses, lib/stories/record.js STORY_IO) and writes the grade.
// Only the grading columns are written, and only on rows that still have no outcome.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/backfill-team-stories.mjs [--env <file>] [--apply]
import { readFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const APPLY = args.includes('--apply')
const envFile = flag('--env') || '.env.local'
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
    if (m && !(m[1] in process.env)) process.env[m[1]] = /^(".*"|'.*')$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
  }
}
const { adminClient } = await import('../lib/supabase/admin.js')
const { STORY_IO, teamLineKey } = await import('../lib/stories/record.js')
const { gradeStory } = await import('../lib/stories/grade.js')
const { scoreboardFor, reduceScoreboard } = await import('../lib/nba/api.js')
const { scoreFor } = await import('../lib/nhl/api.js')
const { reduceScoreDay } = await import('../lib/nhl/reduce.js')
const db = adminClient()
if (!db) { console.error('NOT CONFIGURED: no service client (--env <file> with the Supabase URL and service key)'); process.exit(2) }

// a day's finals in the shape STORY_IO[sport].lines reads
const GAMES = {
  nba: async (day) => reduceScoreboard(await scoreboardFor(day)).filter((g) => g.state === 'final').map((g) => ({ game_id: String(g.id), day, state: 'final', away: g.away, home: g.home })),
  nhl: async (day) => (reduceScoreDay(await scoreFor(day)).games || []).filter((g) => g.state === 'final').map((g) => ({ game_id: String(g.id), day, state: 'final' })),
}

console.log(APPLY ? 'APPLY' : 'DRY RUN (nothing is written)')
let total = 0, written = 0
for (const sport of ['nba', 'nhl']) {
  const { data: rows, error } = await db.from('storyline_log').select('sport,day,game_id,player_id,type,numbers')
    .eq('sport', sport).like('player_id', 'team:%').not('graded_at', 'is', null).is('outcome', null).limit(5000)
  if (error) { console.error(`${sport}: ${error.message}`); process.exit(1) }
  const days = [...new Set(rows.map((r) => r.day))].sort()
  const tally = {}
  for (const day of days) {
    const want = new Set(rows.filter((r) => r.day === day).map((r) => String(r.game_id)))
    const games = (await GAMES[sport](day)).filter((g) => want.has(g.game_id))
    const lines = await STORY_IO[sport].lines(games)
    for (const r of rows.filter((x) => x.day === day)) {
      if (lines.failed?.has(String(r.game_id))) continue
      const res = gradeStory(r, lines.get(teamLineKey(String(r.player_id), String(r.game_id))) || null)
      if (!res) continue
      total += 1
      const k = `${r.type} ${res.outcome}`; tally[k] = (tally[k] || 0) + 1
      if (!APPLY) continue
      const { error: e } = await db.from('storyline_log').update({ bar: res.bar, outcome: res.outcome, outcome_strong: res.outcome_strong })
        .match({ sport, game_id: r.game_id, player_id: r.player_id, type: r.type }).is('outcome', null)
      if (e) console.error(`${sport} ${r.game_id}/${r.player_id}/${r.type}: ${e.message}`); else written += 1
    }
  }
  console.log(`${sport}: ${rows.length} closed team rows over ${days.length} days`, tally)
}
console.log(`${total} gradable${APPLY ? `, ${written} written` : ''}`)
