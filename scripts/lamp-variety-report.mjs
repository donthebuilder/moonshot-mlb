// LAMP VARIETY REPORT (2026-10-18, Donovan: "the same players every night"). READ-ONLY; prints a report, writes nothing.
//
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/lamp-variety-report.mjs [--nights 14] [--preseason] [--json]
//
// It measures the complaint instead of arguing it:
//   LIVE BOARD (lamp_goal_log, status 'called'): over the last N game dates, per club -- how many CALLED, how many DISTINCT players, and the
//     REPEAT RATE = 1 - distinct / calls (0 = a new man every night, 0.8 = the same man 5 nights in 5); the league total; the top 10 most-called.
//   COMPOSITE (lamp_prop_log market GOAL, model_version lamp-goal-comp-v1, status 'called' = the top composite on each team in a game): the same
//     numbers, plus its hit rate (1+ goal, graded picks only) next to the live board's on the SAME games, and OVERLAP = the share of composite
//     picks that were also the live board's CALLED man in that game (the lower, the more the composite says something the board does not).
// Reads Supabase with the service role when NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present (or the anon key for the public
// log); with no env it prints a note and exits 0. Env VALUES are never printed. Nothing is written.
// Reading it: a REPEAT RATE near the live board's with the same names in the top 10 means the composite is the same star in a different coat.
// This report is variety only: whether the composite is MORE ACCURATE is the model harness's job (same games, paired test), not this script's.
const fs = await import('node:fs')
const path = await import('node:path')
const { createRequire } = await import('node:module')

const COMP_VERSION = 'lamp-goal-comp-v1'

const pct1 = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)

/** Pure. live rows [{ game_date, game_id, team, player_id, name }] (called only) -> per-club and league variety. */
export function liveVariety(rows) {
  const clubs = new Map()
  for (const r of rows) {
    const c = clubs.get(r.team) || { team: r.team, nights: new Set(), players: new Map() }
    c.nights.add(r.game_date)
    const p = c.players.get(r.player_id) || { name: r.name, calls: 0 }
    p.calls += 1
    c.players.set(r.player_id, p)
    clubs.set(r.team, c)
  }
  const per = [...clubs.values()].map((c) => {
    const calls = [...c.players.values()].reduce((t, p) => t + p.calls, 0)
    const top = [...c.players.values()].sort((a, b) => b.calls - a.calls)[0]
    return { team: c.team, nights: c.nights.size, calls, distinct: c.players.size, repeatRate: calls ? Math.round(1000 * (1 - c.players.size / calls)) / 1000 : null, topName: top?.name, topCalls: top?.calls || 0 }
  }).sort((a, b) => (b.repeatRate ?? 0) - (a.repeatRate ?? 0) || a.team.localeCompare(b.team))
  const calls = per.reduce((t, c) => t + c.calls, 0), repeats = per.reduce((t, c) => t + (c.calls - c.distinct), 0)
  const byPlayer = new Map()
  for (const r of rows) { const p = byPlayer.get(r.player_id) || { name: r.name, team: r.team, calls: 0 }; p.calls += 1; byPlayer.set(r.player_id, p) }
  const clubNights = new Map(per.map((c) => [c.team, c.nights]))
  const top10 = [...byPlayer.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)).slice(0, 10)
    .map((p) => ({ name: p.name, team: p.team, calls: p.calls, shareOfClubNights: pct1(p.calls, clubNights.get(p.team) || 0) }))
  return { clubs: per, calls, repeatRate: calls ? Math.round(1000 * repeats / calls) / 1000 : null, top10 }
}

/** Pure. composite picks [{ game_id, player_id, name, team, game_date, hit }] + the live CALLED set (Set of "game|player") -> variety + hit rate + overlap. */
export function compositeVariety(rows, liveCalled) {
  const v = liveVariety(rows)
  const graded = rows.filter((r) => r.hit === true || r.hit === false)
  return { ...v, picks: rows.length, graded: graded.length, hits: graded.filter((r) => r.hit).length, hitPct: pct1(graded.filter((r) => r.hit).length, graded.length),
    overlapWithLiveCalled: pct1(rows.filter((r) => liveCalled.has(`${r.game_id}|${r.player_id}`)).length, rows.length) }
}

async function main() {
  const args = process.argv.slice(2)
  const nights = Number(args.includes('--nights') ? args[args.indexOf('--nights') + 1] : 14) || 14
  const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
  const envRoot = fs.existsSync(path.join(repoRoot, '.env.local')) ? repoRoot : repoRoot.split(`${path.sep}.claude${path.sep}worktrees${path.sep}`)[0]
  try { const { loadEnvConfig } = createRequire(path.join(envRoot, 'package.json'))('@next/env'); loadEnvConfig(envRoot) } catch { /* no env loader: process.env as it is */ }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) { console.log('lamp-variety-report: no Supabase env (NEXT_PUBLIC_SUPABASE_URL + a key) in this shell; nothing to read. Exit 0.'); return }
  const { createClient } = createRequire(path.join(envRoot, 'package.json'))('@supabase/supabase-js')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const paged = async (build) => { const all = []; for (let from = 0; ; from += 1000) { const { data, error } = await build().range(from, from + 999); if (error) throw new Error(error.message); all.push(...data); if (data.length < 1000) break } return all }

  const typeOk = (q) => (args.includes('--preseason') ? q : q.neq('game_type', 1))
  const dates = [...new Set((await typeOk(db.from('lamp_goal_log').select('game_date').eq('status', 'called').order('game_date', { ascending: false }).limit(1500)).then((r) => { if (r.error) throw new Error(r.error.message); return r.data })).map((r) => r.game_date))].slice(0, nights)
  if (!dates.length) { console.log('lamp-variety-report: no called rows in lamp_goal_log yet. Exit 0.'); return }
  const since = dates[dates.length - 1]
  const live = await paged(() => typeOk(db.from('lamp_goal_log').select('game_date, game_id, team, player_id, name, hit').eq('status', 'called').gte('game_date', since).order('game_id', { ascending: true }).order('player_id', { ascending: true })))
  const L = liveVariety(live)
  const rep = { dates: dates.length, since, live: { calls: L.calls, repeatRate: L.repeatRate, top10: L.top10, mostRepeatedClubs: L.clubs.slice(0, 8) } }

  let comp = null
  try {
    const rows = await paged(() => db.from('lamp_prop_log').select('game_date, game_id, player_id, name, team, hit').eq('market', 'GOAL').eq('model_version', COMP_VERSION).eq('status', 'called').gte('game_date', since).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
    comp = compositeVariety(rows, new Set(live.map((r) => `${r.game_id}|${r.player_id}`)))
  } catch (e) { comp = { note: `composite rows not readable yet (${e.message})` } }
  rep.composite = comp
  if (comp && !comp.note) {
    const games = new Set((await paged(() => db.from('lamp_prop_log').select('game_id, player_id').eq('market', 'GOAL').eq('model_version', COMP_VERSION).eq('status', 'called').gte('game_date', since).order('game_id', { ascending: true }).order('player_id', { ascending: true }))).map((r) => r.game_id))
    const lv = live.filter((r) => games.has(r.game_id)), graded = lv.filter((r) => r.hit === true || r.hit === false)
    rep.liveSameGames = { calls: lv.length, graded: graded.length, hitPct: pct1(graded.filter((r) => r.hit).length, graded.length) }
  }

  if (args.includes('--json')) { console.log(JSON.stringify(rep, null, 2)); return }
  console.log(`LAMP VARIETY · ${dates.length} game dates since ${since}${args.includes('--preseason') ? ' (preseason included)' : ''}`)
  console.log(`\nLIVE BOARD · ${L.calls} CALLED, league repeat rate ${L.repeatRate} (0 = a new man every night)`)
  console.log('  clubs that repeat most (nights called / distinct men / repeat rate / most-called):')
  for (const c of L.clubs.slice(0, 8)) console.log(`   ${c.team.padEnd(4)} ${String(c.calls).padStart(3)} / ${String(c.distinct).padStart(2)} / ${String(c.repeatRate).padEnd(5)} ${c.topName} x${c.topCalls}`)
  console.log('  top 10 most-called:')
  for (const p of L.top10) console.log(`   ${p.name} (${p.team}) x${p.calls} = ${p.shareOfClubNights}% of ${p.team}'s nights`)
  console.log('\nCOMPOSITE (lamp-goal-comp-v1, the top composite on each team in a game)')
  if (comp.note) console.log(`  ${comp.note}`)
  else {
    console.log(`  ${comp.calls} picks · league repeat rate ${comp.repeatRate} · graded ${comp.graded} hit ${comp.hitPct ?? '–'}% (live board on the same games: ${rep.liveSameGames?.hitPct ?? '–'}% of ${rep.liveSameGames?.graded ?? 0}) · same man as the live CALLED ${comp.overlapWithLiveCalled ?? '–'}%`)
    console.log('  top 10 most-picked:')
    for (const p of comp.top10) console.log(`   ${p.name} (${p.team}) x${p.calls} = ${p.shareOfClubNights}% of ${p.team}'s nights`)
    console.log('  clubs that repeat most:')
    for (const c of comp.clubs.slice(0, 8)) console.log(`   ${c.team.padEnd(4)} ${String(c.calls).padStart(3)} / ${String(c.distinct).padStart(2)} / ${String(c.repeatRate).padEnd(5)} ${c.topName} x${c.topCalls}`)
    console.log('  (a hit rate here is a small sample until the harness has 150+ games: the harness, not this line, decides)')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) await main().catch((e) => { console.error(`lamp-variety-report: ${e.message}`); process.exit(1) })
