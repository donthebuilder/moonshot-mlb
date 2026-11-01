#!/usr/bin/env node
// EVERY POST KIND THE CODE CLAIMS IS IN THE DATABASE'S KIND CHECK (batch 3, X system bug search, 2026-10-26).
// A kind that is claimed in homer_feed_posts but missing from homer_feed_posts_kind_check FAILS QUIETLY: the claim insert is refused, the post is
// skipped, and nothing says so (Film Room, The Five, Sunday Sheet, By The Numbers and the partner kinds were all caught this way). This check reads
// the live constraint's SNAPSHOT (supabase/homer_feed_posts_kind_check.snapshot.txt) and holds every kind the routing table and the schedule know
// to it, except the kinds that are NOT stored in homer_feed_posts (live alerts, replies, other tables), each named below with its reason.
// REFRESH THE SNAPSHOT after any kind migration, from the live database:  select pg_get_constraintdef(oid) from pg_constraint
//   where conname = 'homer_feed_posts_kind_check';   and paste the result into the snapshot file (the migration's PROBE says the same).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-post-kinds.mjs
import fs from 'node:fs'
let n = 0, bad = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.error(`FAIL ${m}`) } else console.log(`ok   ${m}`) }

const def = fs.readFileSync(new URL('../supabase/homer_feed_posts_kind_check.snapshot.txt', import.meta.url), 'utf8')
const exact = new Set(); const rx = []
for (const m of def.matchAll(/ARRAY\[([^\]]*)\]/g)) for (const k of m[1].matchAll(/'([^']+)'::text/g)) exact.add(k[1])
for (const m of def.matchAll(/kind = '([^']+)'::text/g)) exact.add(m[1])
for (const m of def.matchAll(/kind ~ '([^']+)'::text/g)) rx.push(new RegExp(m[1]))
const accepted = (k) => exact.has(k) || rx.some((r) => r.test(k))

// NOT STORED IN homer_feed_posts: the kind names an X post log / push / reply / another table's row, never a (day, kind) claim here.
const NOT_STORED = Object.freeze({
  admin_test: 'the admin page test post', facts: 'fact_posts table', homer: 'homer_feed table', td: 'nfl_td_feed table', nhlgoal: 'lamp_goal_feed table',
  nba30: 'buckets_feed table (BUCKETS moments)', moment_nba: 'BUCKETS moments live in buckets_feed, not here',
  alert_gameoff: 'live-room alert (Discord only, discord_sends)', alert_nflboardred: 'live-room alert', alert_nflkick: 'live-room alert', alert_scratched: 'live-room alert', alert_slate: 'live-room alert',
  homer_board_reply: 'a reply (X log only)', miss_reply: 'a reply (X log only)', mlbhr_reply: 'a reply (X log only)', nfl_callsheet_reply: 'a reply (X log only)', story_t3: 'a reply (X log only)',
  call: 'the call_<game_pk> family (checked as an instance below)', writeup: 'the writeup_<sport>_<id> family (instances below)', writeup_mlb: 'family', writeup_nba: 'family', writeup_nfl: 'family', writeup_nhl: 'family',
  nhl_board: 'a quote-kind name in lib/dash/quoteFor.js, never claimed', receipt_nocash: 'a routing label only; the no-cash night is the receipt row itself',
})

const { ROUTES, PREFIX_ROUTES } = await import('../lib/dash/routing.js')
const { KIND_TAGS } = await import('../lib/dash/xSchedule.js')
const kinds = [...new Set([...Object.keys(ROUTES), ...Object.keys(KIND_TAGS)])].sort()
const missing = kinds.filter((k) => !accepted(k) && !NOT_STORED[k])
ok(missing.length === 0, `every claimed kind is in the DB check, or named as not stored (${missing.join(', ') || 'none missing'} of ${kinds.length})`)
const stale = Object.keys(NOT_STORED).filter((k) => accepted(k))
ok(stale.length === 0, `no 'not stored' exemption hides a kind the DB already accepts (${stale.join(', ') || 'none'})`)
const gone = Object.keys(NOT_STORED).filter((k) => !kinds.includes(k))
ok(gone.length === 0, `every exemption still names a kind the code knows (${gone.join(', ') || 'none'})`)

// the families that carry an id suffix: one real-looking instance each must pass
const INSTANCES = ['call_823903', 'writeup_nfl_401873008', 'writeup_nhl_2025020001', 'writeup_nba_0022500001', 'moment_nhl_8478402_2025020001_ht1', 'moment_nfl_top3_20261025', 'postseason_mlb_top3_20261024',
  'card_members_win_nfl_straight_1', 'card_members_leg_nhl_two_man_1_2', 'card_members_list_nfl', 'card_don_nfl_two_man', 'card_don_nba_n_man_1', 'nba_poll_board', 'nfl_poll_pick', 'plays_nba', 'members_roundup_nba']
ok(INSTANCES.every(accepted), `each id-suffixed family accepts a real-looking kind (${INSTANCES.filter((k) => !accepted(k)).join(', ') || 'all'})`)
// the prefix routes of the routing table must each have a family the DB accepts, except the ones that are not stored
const FAMILY_NOT_STORED = new Set(['moment_nba_', 'moment_nba_top3_'])   // BUCKETS moments / digests are not claimed here
const famBad = PREFIX_ROUTES.map(([p]) => p).filter((p) => !FAMILY_NOT_STORED.has(p)).filter((p) => !accepted(`${p}x1`) && !accepted(`${p}1`) && !accepted(`${p.replace(/_$/, '')}`) && !accepted(`${p}mlb_1_1`) && !accepted(`${p}nfl_straight_1`) && !accepted(`${p}nhl_two_man_1_2`) && !accepted(`${p}20261025`))
ok(famBad.length === 0, `every prefix route family is accepted (${famBad.join(', ') || 'all'})`)
console.log(bad ? `${bad}/${n} FAILED` : `check-post-kinds: ${n} checks passed`)
process.exit(bad ? 1 : 0)
