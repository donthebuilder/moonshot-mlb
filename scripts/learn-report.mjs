// THE ACCURACY LOOP, RUN BY HAND (2026-10-12). READ-ONLY: reads graded rows, writes one private report.
//
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/learn-report.mjs <mlb|nfl|nhl> [week] [--out DIR] [--publish] [--cache DIR] [--markets GOAL,SOG] [--reps 300]
//
//   week      nhl/mlb: any YYYY-MM-DD (the analysis runs through that date); nfl: a week number. Default: everything graded so far.
//   --out     where the private report goes (default <repo>/.claude-notes/learn, gitignored; never docs/)
//   --publish also write lib/learn/published.json (the claim-gated subset the Record page shows; commit it like lib/nfl/angleBacktest.json)
//   --cache   a folder for downloaded data files (default: the OS temp folder)
//
// WHICH TICK: none. There is no new cron, no new polling and nothing stored in the site's database. This script is
// the weekly run: Donovan or an agent runs it, reads .claude-notes/learn/<sport>-<week>.md, and (with --publish) commits
// the small published.json. Reads: Supabase (nhl: lamp_goal_log, lamp_prop_log; nfl: nfl_week_games) with the repo's
// service-role pattern, and the bot's data branch files (mlb, nfl) the site already reads. Env values are never printed.
await import('./_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const os = await import('node:os')
const { createRequire } = await import('node:module')

const args = process.argv.slice(2)
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const has = (k) => args.includes(k)
const [sport, weekArg] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'))
if (!['mlb', 'nfl', 'nhl'].includes(sport)) { console.error('usage: learn-report.mjs <mlb|nfl|nhl> [week] [--out DIR] [--publish] [--cache DIR] [--markets A,B] [--reps N]'); process.exit(2) }

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
// a worktree has no .env.local: the main checkout (the folder above .claude/worktrees) has
const envRoot = fs.existsSync(path.join(repoRoot, '.env.local')) ? repoRoot : repoRoot.split(`${path.sep}.claude${path.sep}worktrees${path.sep}`)[0]
const notesRoot = process.env.LEARN_NOTES_ROOT || envRoot
const OUT = flag('--out') || path.join(notesRoot, '.claude-notes', 'learn')
const CACHE = flag('--cache') || path.join(os.tmpdir(), 'learn-cache')
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CACHE, { recursive: true })
const reps = Number(flag('--reps')) || 300

const { LEARN_SPORTS } = await import('../lib/learn/sports.js')
const { buildReport, renderMarkdown, publicEntry } = await import('../lib/learn/report.js')
const S = LEARN_SPORTS[sport]
const wantMarkets = (flag('--markets') || '').split(',').filter(Boolean)
const markets = S.markets.filter((m) => !wantMarkets.length || wantMarkets.includes(m.key))

// ── reads ───────────────────────────────────────────────────────────────────
const req = createRequire(path.join(envRoot, 'package.json'))
const { loadEnvConfig } = req('@next/env'); loadEnvConfig(envRoot)
const RAW = 'https://raw.' + 'githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
async function fetchCached(url, key, { final = true } = {}) {
  const f = path.join(CACHE, key.replace(/[^A-Za-z0-9._-]/g, '_'))
  if (final && fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
  for (let t = 0; t < 3; t += 1) {
    const r = await fetch(url).catch(() => null)
    if (r?.ok) { const s = await r.text(); fs.writeFileSync(f, s); return s }
    if (r?.status === 404) return null
    await new Promise((res) => setTimeout(res, 800 * (t + 1)))
  }
  return null
}
const jsonl = (s) => String(s || '').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
const db = () => { const { createClient } = req('@supabase/supabase-js'); return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) }
async function paged(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await build().range(from, from + 999)
    if (r.error) throw new Error(r.error.message)
    out.push(...r.data)
    if (r.data.length < 1000) return out
  }
}
const upTo = (rows) => (sport !== 'nfl' && weekArg && /^\d{4}-\d{2}-\d{2}$/.test(weekArg) ? rows.filter((r) => r.date <= weekArg) : rows)

// ── per sport ───────────────────────────────────────────────────────────────
const byMarket = {}
const notes = []
if (sport === 'nhl') {
  const { nhlRows } = await import('../lib/learn/rows/nhl.js')
  const { ALL_VERSIONS, MODEL_VERSION } = await import('../lib/nhl/goalModel.js')
  const sb = db()
  const goalSel = 'game_id,player_id,model_version,game_date,game_type,start_utc,team,opp,home,name,pos,legs,pct,context,score,rank_in_game,status,locked_at,dressed,goals,hit,graded_at'
  const goal = await paged(() => sb.from('lamp_goal_log').select(goalSel).in('model_version', ALL_VERSIONS).not('graded_at', 'is', null).eq('game_type', 2).order('game_date').order('game_id').order('player_id'))
  byMarket.GOAL = upTo(nhlRows(goal, 'GOAL'))
  // cross-check against the ladder every surface prints (same rows, same rule): the counts must match
  const { toRecord } = await import('../lib/record/nhl.js')
  const { ladderFromRecords } = await import('../lib/record/ladder.js')
  const lad = ladderFromRecords(goal.filter((r) => !weekArg || r.game_date <= weekArg).map(toRecord), { season: 'regular' })
  const mine = {}
  for (const r of byMarket.GOAL) if (r.produced !== null) { mine[r.status] ||= [0, 0]; mine[r.status][1] += 1; if (r.produced) mine[r.status][0] += 1 }
  const same = lad && ['called', 'board', 'off'].every((k) => lad.rungs[k].n === (mine[k]?.[1] || 0) && lad.rungs[k].hits === (mine[k]?.[0] || 0))
  notes.push(`ladder cross-check (lib/record/ladder.js on the same rows): ${same ? 'MATCH' : 'MISMATCH'} ${JSON.stringify({ ladder: lad && Object.fromEntries(Object.entries(lad.rungs).map(([k, v]) => [k, `${v.hits}/${v.n}`])), loop: Object.fromEntries(Object.entries(mine).map(([k, v]) => [k, `${v[0]}/${v[1]}`])) })}`)
  S.liveVersion = MODEL_VERSION
  for (const m of markets.filter((x) => x.key !== 'GOAL')) {
    const rows = await paged(() => sb.from('lamp_prop_log').select(goalSel.replace('goals,', 'value,')).eq('market', m.key).not('graded_at', 'is', null).eq('game_type', 2).order('game_date').order('game_id').order('player_id'))
    byMarket[m.key] = upTo(nhlRows(rows, m.key))
  }
}

if (sport === 'mlb') {
  const { mlbRows } = await import('../lib/learn/rows/mlb.js')
  const { LOCKED_SINCE, parseJsonl, finalOutcomes } = await import('../lib/record/mlbLocked.js')
  const through = weekArg && /^\d{4}-\d{2}-\d{2}$/.test(weekArg) ? weekArg : new Date().toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const sched = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${LOCKED_SINCE}&endDate=${through}&gameType=R,F,D,L,W&fields=dates,games,gamePk,gameDate,officialDate,gameType`).then((r) => r.json())
  const games = new Map()
  for (const d of sched.dates || []) for (const g of d.games || []) games.set(String(g.gamePk), { start: Date.parse(g.gameDate), type: g.gameType, date: g.officialDate || d.date })
  const days = []
  for (let t = Date.parse(`${LOCKED_SINCE}T12:00:00Z`); t <= Date.parse(`${through}T12:00:00Z`); t += 864e5) days.push(new Date(t).toISOString().slice(0, 10))
  for (const m of markets) byMarket[m.key] = []
  let nights = 0
  for (const d of days) {
    const fresh = d >= new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10) || d >= today   // recent nights may still be settling
    const p = await fetchCached(`${RAW}/por_rows_${d}.jsonl`, `por_${d}.jsonl`, { final: !fresh })
    if (!p) continue
    const o = await fetchCached(`${RAW}/outcome_log_${d}.jsonl`, `out_${d}.jsonl`, { final: !fresh })
    const por = parseJsonl(p), outcomes = finalOutcomes(parseJsonl(o))
    nights += 1
    for (const m of markets) byMarket[m.key].push(...mlbRows({ date: d, por, outcomes, games, lane: m.key, season: 'R' }))
  }
  notes.push(`${nights} nights of por_rows/outcome_log read (regular season only; the postseason is a separate, thinner block and is not in this report)`)
}

if (sport === 'nfl') {
  const { nflRows } = await import('../lib/learn/rows/nfl.js')
  const sb = db()
  const tree = await fetch('https://api.' + 'github.com/repos/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/git/trees/data?recursive=1', { headers: { 'User-Agent': 'learn-report' } }).then((r) => r.json())
  const files = (tree.tree || []).map((x) => x.path).filter((p) => p.startsWith('public/data/current/')).map((p) => p.slice('public/data/current/'.length))
  const last = weekArg ? Number(weekArg) : 18
  for (const m of markets) byMarket[m.key] = []
  const weeksUsed = []
  for (let wk = 1; wk <= last; wk += 1) {
    const tag = String(wk).padStart(2, '0')
    const res = JSON.parse((await fetchCached(`${RAW}/nfl_results_2026_w${tag}.json`, `res_${wk}.json`, { final: false })) || 'null')
    if (!res?.lines || !res?.totals) continue
    const gm = await sb.from('nfl_week_games').select('kickoff').eq('season', 2026).eq('week', wk).eq('season_type', 2)
    const kicks = (gm.data || []).map((g) => Date.parse(g.kickoff)).filter(Number.isFinite)
    if (!kicks.length) { notes.push(`week ${wk}: no kickoff times on file, skipped`); continue }
    const first = Math.min(...kicks)
    // the last run BEFORE the week's first kickoff: everything in it was known to the model before any game started
    let best = null
    for (const f of files.filter((x) => x.startsWith(`nfl_prediction_log_2026-wk${tag}.`))) {
      const s = await fetchCached(`${RAW}/${f}`, `pred_${f}`)
      if (!s) continue
      const head = jsonl(s.slice(0, s.indexOf('\n')))[0]
      const at = Date.parse(head?.generated_at || '')
      if (Number.isFinite(at) && at < first && (!best || at > best.at)) best = { at, s, f }
    }
    if (!best) { notes.push(`week ${wk}: no pregame run found`); continue }
    const board = jsonl(best.s).slice(1)
    weeksUsed.push(wk)
    const date = new Date(first).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })   // the first game's own (local) date, not the UTC day
    for (const m of markets) byMarket[m.key].push(...nflRows({ season: 2026, week: wk, market: m.key, board, results: res, lockedAt: best.at, startAt: first, date }))
  }
  notes.push(`weeks read: ${weeksUsed.join(', ')} (each week's last prediction-log run before its first kickoff). CALLED = the card's five rungs per market; a TD that was only a game's call reads by its board rank.`)
}

// ── report ──────────────────────────────────────────────────────────────────
const reps_ = []
for (const m of markets) {
  const rows = byMarket[m.key] || []
  if (!rows.length) { notes.push(`${m.key}: no rows`); continue }
  reps_.push(buildReport(rows, { sport, market: m.key, label: `${m.label} (${m.bar})`, unitWord: S.unit, windowDays: S.windowDays, producedWord: S.producedWord, reps, liveVersion: S.liveVersion || null }))
}
const asOf = reps_.map((r) => r.asOf).filter(Boolean).sort().at(-1)
const isoWeek = (ymd) => { const d = new Date(`${ymd}T12:00:00Z`); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-w${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}` }
const week = sport === 'nfl' ? `2026-w${String(weekArg || reps_[0]?.units || '').padStart(2, '0')}` : isoWeek(asOf || new Date().toISOString().slice(0, 10))
const generatedAt = new Date().toISOString()
let md = renderMarkdown(reps_, { sport, week, generatedAt })
if (notes.length) md += `\n## Run notes\n\n${notes.map((n) => `- ${n}`).join('\n')}\n`
fs.writeFileSync(path.join(OUT, `${sport}-${week}.md`), md)
const slim = (cmp) => ({ nA: cmp.nA, nB: cmp.nB, units: cmp.units, floor: cmp.floor, features: cmp.features.map((f) => ({ feature: f.feature, direction: f.direction, auc: f.auc, aucRange: f.aucRange, effect: f.effect, effectRange: f.effectRange, medA: f.medA, medB: f.medB, nA: f.nA, nB: f.nB, stable: f.stable, fdrPass: f.fdrPass, claim: f.claim, why: f.why })) })
const json = { sport, week, generatedAt, asOf, notes, markets: reps_.map((r) => ({ market: r.market, label: r.label, units: r.units, from: r.from, asOf: r.asOf, rows: r.rows, lateExcluded: r.lateExcluded, counts: r.counts, recent: r.recent, weekly: r.gotAway.weekly, boardNoCall: { called: r.boardNoCall.called, board: r.boardNoCall.board, off: r.boardNoCall.off, readout: r.boardNoCall.readout, floor: r.boardNoCall.floor, within: slim(r.boardNoCall.within) }, separators: { c1_gotAway_vs_called: slim(r.gotAway.c1), c2_gotAway_vs_notCalledMiss: slim(r.gotAway.c2), c3_calledHit_vs_calledMiss: slim(r.gotAway.c3) }, candidates: r.candidates && { tried: r.candidates.tried, units: r.candidates.units, proposals: r.candidates.proposals.map((p) => ({ feature: p.feature, direction: p.direction, status: p.status, testUnits: p.testUnits, meanLift: p.meanLift, liftRange: p.liftRange, pBonferroni: p.pBonferroni, halves: p.halves, signShare: p.signShare, topKLift: p.topKLift })), shadow: r.candidates.shadow } })) }
fs.writeFileSync(path.join(OUT, `${sport}-${week}.json`), `${JSON.stringify(json, null, 1)}\n`)

if (has('--publish')) {
  const pub = path.join(repoRoot, 'lib', 'learn', 'published.json')
  const cur = fs.existsSync(pub) ? JSON.parse(fs.readFileSync(pub, 'utf8')) : { sports: {} }
  cur.sports[sport] = { asOf, generatedAt, markets: reps_.filter((r) => S.markets.find((m) => m.key === r.market)?.public !== false).map(publicEntry) }
  fs.writeFileSync(pub, `${JSON.stringify(cur, null, 1)}\n`)
}

for (const r of reps_) {
  const c = r.counts
  console.log(`${sport.toUpperCase()} ${r.market}: ${r.rows.graded} graded / ${r.units} ${r.unitWord}s | called ${c.called.hits}/${c.called.n} | board-no-call ${c.board.hits}/${c.board.n} | off ${c.off.hits}/${c.off.n} | got away ${c.gotAway.n} (${c.gotAway.onBoard} board, ${c.gotAway.notOnBoard} off) | late excluded ${r.lateExcluded} | board-vs-called: ${r.boardNoCall.readout}`)
  for (const k of ['c1', 'c2', 'c3']) {
    const cmp = r.gotAway[k]
    const sep = cmp.features.filter((f) => f.claim === 'separates').slice(0, 3).map((f) => `${f.feature} ${f.direction} (auc ${f.auc.toFixed(2)})`)
    console.log(`   ${k}: n=${cmp.nA} vs ${cmp.nB}${cmp.floor ? '' : ' (under floor)'} separates: ${sep.length ? sep.join('; ') : 'none'}`)
  }
  const ready = r.candidates?.proposals.filter((p) => p.status === 'ready') || []
  const watch = r.candidates?.proposals.filter((p) => p.status === 'watch') || []
  console.log(`   candidates: ${r.candidates?.tried ?? 0} tried | ready ${ready.length} | watch ${watch.length} | ${r.candidates ? `held-out units ${r.candidates.proposals[0]?.testUnits ?? 0}` : ''}`)
}
console.log(`wrote ${path.join(OUT, `${sport}-${week}.md`)} and .json${has('--publish') ? ' + lib/learn/published.json' : ''}`)
for (const n of notes) console.log(`note: ${n}`)
