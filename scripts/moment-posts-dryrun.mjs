// DRY RUN of the moment posts and the postseason big-night posts (lib/posts/momentPost.js, lib/posts/postseasonPost.js). PRINTS what WOULD post for the last
// 48 hours from the REAL stored events: counts per tier and per kind, the text of each, the channels it would reach, and the X posts it would use
// (simulated in order against the day's real counted X posts, the 12 STAR line and the write-up tier's cap). READ-ONLY: it sends nothing, writes nothing,
// claims nothing, renders nothing, and it ignores MOMENT_POSTS_ON (that switch only matters to the live ticks).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/moment-posts-dryrun.mjs [--env <file>] [--days 2] [--json <file>]
// Needs the database (service role or anon key from the env file, never printed) and the network (MLB StatsAPI for the postseason part).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const envFile = flag('--env') || '.env.local'
if (existsSync(envFile)) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)
    if (m && !(m[1] in process.env)) process.env[m[1]] = /^(".*"|'.*')$/.test(m[2]) ? m[2].slice(1, -1) : m[2]
  }
}
const days = Number(flag('--days')) || 2
const now = Date.now()

const { adminClient } = await import('../lib/supabase/admin.js')
const { historicalEvents, etDay } = await import('../lib/posts/momentFeed.js')
const P = await import('../lib/cards/momentPosting.js')
const { X_POLICY, capAllows } = await import('../lib/dash/xPolicy.js')
const { xPostsToday } = await import('../lib/dash/xBudget.js')
const { TIER_WORD, tierRank } = await import('../lib/cards/moments.js')
const { modelFromRow } = await import('../lib/cards/specialData.js')

const db = adminClient({ anon: true })
if (!db) { console.error('no database key in the env file (NEXT_PUBLIC_SUPABASE_URL + a key)'); process.exit(2) }

const { events, errors, since } = await historicalEvents(db, { days, now })
console.log(`MOMENT POSTS DRY RUN: the last ${days} day(s) (game days ${since} on), ${events.length} moment events found${errors.length ? `; SOURCES THAT FAILED: ${errors.join(' | ')}` : ''}\n`)

// the real X count of each ET day so far (the simulation starts from it)
const dayList = [...new Set(events.map((e) => etDay(e.at || Date.parse(`${e.day}T23:00:00Z`))))].sort()
const used = {}
for (const d of dayList) used[d] = await xPostsToday(db, d).catch(() => null)

const rows = []
for (const e of events.sort((a, b) => (a.at || Date.parse(`${a.day}T23:00:00Z`)) - (b.at || Date.parse(`${b.day}T23:00:00Z`)))) {
  const ek = P.eventKeyOf({ sport: e.sport, playerId: e.who.playerId, gameId: e.gameId, n: e.n })
  const at = e.at || Date.parse(`${e.day}T23:00:00Z`)
  const etD = etDay(at)
  let name = e.who.name
  try { name = (await modelFromRow(e.moment, e.row))?.name || name } catch { /* the stored name stands */ }
  const line = P.momentLine(e.moment, e.row, { ...e.who, name })
  const xText = P.xTextFor(line, e.status, [name, e.who.name, e.who.team, e.who.opp])
  const pol = P.postable(e.tier) ? P.policyFor(e.tier, { xUsed: used[etD], hasX: true, hasMembers: true }) : { x: false, discord: false, members: false, why: 'BASE is never posted' }
  let x = pol.x && Boolean(xText)
  let why = pol.why
  if (x && !capAllows(ek ? ek.kind : 'moment_nhl_x', used[etD] ?? 0)) { x = false; why = `daily cap (write-up tier stops at ${X_POLICY.dailyCap - 2}; ${used[etD]} out)` }
  if (x && used[etD] != null) used[etD] += 1
  rows.push({ moment: e.moment, sport: e.sport, tier: e.tier, kind: ek?.kind || '(no key)', family: ek?.family || '', etDay: etD, name, line, status: e.status || '', x, discord: pol.discord, members: pol.members, xLen: xText ? Array.from(xText).length : 0, why })
}

const count = (list, f) => list.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m }, {})
const posted = rows.filter((r) => r.discord || r.x || r.members)
console.log('--- EVENTS BY TIER (all found) ---')
for (const t of ['legend', 'elite', 'star', 'base']) console.log(`  ${TIER_WORD[t].padEnd(7)} ${rows.filter((r) => r.tier === t).length}`)
console.log('\n--- WOULD POST, by tier and moment ---')
for (const [k, n] of Object.entries(count(posted, (r) => `${TIER_WORD[r.tier]} ${r.moment}`)).sort()) console.log(`  ${k.padEnd(40)} ${n}`)
console.log('\n--- WOULD POST, by kind family ---')
for (const [k, n] of Object.entries(count(posted, (r) => r.family)).sort()) console.log(`  ${k.padEnd(20)} ${n}`)
console.log('\n--- CHANNELS ---')
console.log(`  Discord sport channel: ${posted.filter((r) => r.discord).length}   #members: ${posted.filter((r) => r.members).length}   X: ${posted.filter((r) => r.x).length}   (never posted, BASE: ${rows.length - posted.length})`)
console.log('\n--- X POSTS IT WOULD USE, per ET day (the cap is ' + X_POLICY.dailyCap + '; moment posts are the write-up tier and stop at ' + (X_POLICY.dailyCap - 2) + ') ---')
for (const d of dayList) console.log(`  ${d}: ${rows.filter((r) => r.etDay === d && r.x).length} moment X posts (the day's counted X total would end at ${used[d] ?? 'unknown'})`)
console.log('\n--- EACH POST ---')
for (const r of posted) console.log(`  [${TIER_WORD[r.tier]}] ${r.etDay} ${r.kind}\n     ${r.line}${r.status ? `  (stored label: ${r.status})` : ''}\n     ${[r.discord ? 'Discord' : null, r.members ? '#members' : null, r.x ? `X (${r.xLen}/280)` : r.why ? `no X: ${r.why}` : null].filter(Boolean).join(' + ')}`)

// ── the postseason part ────────────────────────────────────────────────────────
console.log('\n=== POSTSEASON BIG NIGHTS (the last ' + days + ' ET days, Final games) ===')
const { finalGames, bigNights } = await import('../lib/posts/postseasonPost.js')
const { buildPostseasonPost } = await import('../lib/posts/postseasonCard.js')
const { loadPostseasonPlayer } = await import('../lib/cards/postseasonData.js')
const j = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${etDay(now - days * 86400e3)}&endDate=${etDay(now)}&gameType=F,D,L,W`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const sched = j ? (j.dates || []).flatMap((d) => d.games || []) : null
const psOut = []
if (!sched) console.log('  (the MLB schedule did not answer)')
else {
  const finals = finalGames(sched, now + 365 * 864e5 * 0).concat([])   // fresh window applies in the live pass; the census below ignores it
  const all = sched.filter((g) => g?.status?.abstractGameState === 'Final').map((g) => ({ pk: String(g.gamePk), date: String(g.officialDate).slice(0, 10), season: String(g.season || g.officialDate.slice(0, 4)), startMs: Date.parse(g.gameDate) }))
  console.log(`  ${all.length} postseason game(s) are Final in the window (${finals.length} of them inside the live pass's ${P.POSTSEASON_FRESH_MS / 3600e3} h freshness window right now).`)
  const perNight = {}
  for (const g of all.sort((a, b) => a.startMs - b.startMs)) {
    const box = await fetch(`https://statsapi.mlb.com/api/v1/game/${g.pk}/boxscore`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const nights = bigNights(box)
    console.log(`  game ${g.pk} (${g.date}): ${nights.length} player(s) meet the rule`)
    for (const n of nights) {
      const have = perNight[g.date] || 0
      if (have >= P.POSTSEASON_MAX_PER_NIGHT) { console.log(`     ${n.name} (${n.group}, score ${n.score}) -- over the night's limit of ${P.POSTSEASON_MAX_PER_NIGHT}: NOT posted`); continue }
      perNight[g.date] = have + 1
      const lp = await loadPostseasonPlayer({ id: n.id, season: g.season, group: n.group, withPictures: false })
      const post = lp.ok && String(lp.model.last?.gamePk) === g.pk ? buildPostseasonPost(lp.model) : null
      psOut.push({ game: g.pk, date: g.date, name: n.name, group: n.group, text: post?.ok ? post.x.text : null })
      console.log(`     WOULD POST ${n.name} (${n.group}, score ${n.score}): ${post?.ok ? `X ${post.x.length}/280 + Discord\n        ${post.x.text.replace(/\n/g, '\n        ')}` : `(not buildable yet: ${lp.ok ? 'his game log has not caught up' : lp.why})`}`)
    }
  }
  console.log(`  postseason X posts it would use: ${psOut.filter((r) => r.text).length} (each also goes to the MLB channel)`)
}

const total = posted.filter((r) => r.x).length + psOut.filter((r) => r.text).length
console.log(`\nTOTAL X POSTS THESE ${days} DAYS WOULD USE: ${total} (moment ${posted.filter((r) => r.x).length} + postseason ${psOut.filter((r) => r.text).length}); the cap is ${X_POLICY.dailyCap} a day shared with every other counted post.`)
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify({ rows, postseason: psOut, errors }, null, 2))
