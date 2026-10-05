// MOONSHOT'S BOARD ANGLES, MEASURED, EVERY MARKET (2026-10-05, Donovan: "needs to be ran for all
// sports and all props"). Nothing is written but the result file.
//
//   node scripts/mlb/angle-backtest.mjs --cache <folder>
//
// WHAT HISTORY EXISTS (checked 10-05): the bot's data branch is one squashed commit. The FULL board
// with its angle fields, written before first pitch, is the prediction log (prediction_log_<D>.<time>
// .jsonl, every hitter's slot_snapshot) from 2026-09-12; the graded outcome of every board hitter is
// outcome_log_<D>.jsonl. So: 09-12 .. the last outcome log, every hitter, each game read from the LAST
// prediction run before its first pitch (statsapi schedule). graded_results_<D> reaches back to April
// but holds the bot's picks only and is written after the games (lib/cleanRecord.js) -- not used.
// 'due' and 'confirmed' read fields the prediction log doesn't carry (hr_due_tag, lineup_confirmed):
// those two come from slate_<D>_slim.json (the day's last board snapshot, from 09-21), said in the file.
//
// THE ANGLES are components/BoardFilters.js CATEGORIES, copied (that file is React):
//   weak weak_spot_flag · edge pitch_type_match_score > 0 · aligned lib/scoring isAligned ·
//   hiconf high_confidence_hr_flag · hot last5_hr > 0 · due /due/ in hr_due_tag ·
//   softarm pitcher_hr9 >= 1.4 · confirmed lineup_confirmed
// Markets (the bars a call is graded on): HR 1+ home run · HIT 1+ hit · HRR 2+ hits+runs+RBI ·
// TB 2+ total bases. A hitter with no plate appearance is void. Base = every board hitter that night.
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const { isAligned } = await import('../../lib/scoring.js')

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const CACHE = arg('--cache')
if (!CACHE) { console.error('usage: --cache <folder>'); process.exit(2) }
fs.mkdirSync(CACHE, { recursive: true })
const RAW = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
async function text(url, key) {
  const f = path.join(CACHE, key)
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
  for (let t = 0; t < 3; t += 1) {
    const r = await fetch(url).catch(() => null)
    if (r?.ok) { const s = await r.text(); fs.writeFileSync(f, s); return s }
    if (r?.status === 404) return null
    await new Promise((res) => setTimeout(res, 1000 * (t + 1)))
  }
  return null
}
const jsonl = (s) => (s || '').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

const ANGLES = {
  weak: (p) => p?.weak_spot_flag === true,
  edge: (p) => (num(p?.pitch_type_match_score) ?? 0) > 0,
  aligned: (p) => isAligned(p),
  hiconf: (p) => p?.high_confidence_hr_flag === true,
  hot: (p) => (num(p?.last5_hr) ?? 0) > 0,
  due: (p) => /due/i.test(String(p?.hr_due_tag || '')),
  softarm: (p) => (num(p?.pitcher_hr9) ?? 0) >= 1.4,
  confirmed: (p) => p?.lineup_confirmed === true,
}
const FROM_SLATE = new Set(['due', 'confirmed'])
const MARKETS = { HR: (o) => o.home_runs >= 1, HIT: (o) => o.hits >= 1, HRR: (o) => o.hrr_total >= 2, TB: (o) => o.total_bases >= 2 }

// the branch's file list (one tree read)
const tree = await fetch('https://api.github.com/repos/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/git/trees/data?recursive=1').then((r) => r.json())
const files = (tree.tree || []).map((x) => x.path).filter((p) => p.startsWith('public/data/current/')).map((p) => p.slice('public/data/current/'.length))
const runs = files.map((f) => /^prediction_log_(\d{4}-\d{2}-\d{2})\.(\d{2})(\d{2})(\d{2})Z\.(.+)\.jsonl$/.exec(f)).filter(Boolean)
  .map((m) => ({ file: m[0], date: m[1], at: Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) }))
const outcomeDates = files.map((f) => /^outcome_log_(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f)?.[1]).filter(Boolean)
const dates = [...new Set(runs.map((r) => r.date))].filter((d) => outcomeDates.includes(d)).sort()
console.log(`${dates.length} nights with a pregame board and graded outcomes (${dates[0]} .. ${dates[dates.length - 1]})`)

const T = {}
const add = (m, k, hit) => { T[m] ||= {}; T[m][k] ||= [0, 0]; T[m][k][1] += 1; if (hit) T[m][k][0] += 1 }
let slateNights = 0
for (const d of dates) {
  // first pitch per game
  const sched = await text(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${d}`, `sched_${d}.json`).then((s) => JSON.parse(s || '{}'))
  const start = new Map((sched.dates || []).flatMap((x) => x.games || []).map((g) => [String(g.gamePk), Date.parse(g.gameDate)]))
  // outcomes: the latest final revision per player-game, plate appearance or void
  const outs = new Map()
  for (const o of jsonl(await text(`${RAW}/outcome_log_${d}.jsonl`, `outcome_${d}.jsonl`))) {
    const k = String(o.player_game_id); const cur = outs.get(k)
    if (!cur || (o.revision || 0) > (cur.revision || 0)) outs.set(k, o)
  }
  // each game read from the last run before its first pitch
  const dayRuns = runs.filter((r) => r.date === d).sort((a, b) => a.at - b.at)
  const need = new Map()   // file -> Set(gamePk)
  for (const [pk, t] of start) { const r = dayRuns.filter((x) => x.at < t).pop(); if (r) { if (!need.has(r.file)) need.set(r.file, new Set()); need.get(r.file).add(pk) } }
  const board = new Map()  // player_game_id -> slot_snapshot
  for (const [file, pks] of need) {
    for (const row of jsonl(await text(`${RAW}/${file}`, file))) {
      if (row.prediction_type !== 'slate_row' || !pks.has(String(row.game_pk))) continue
      board.set(`${row.game_pk}|${row.player_id}`, { ...(row.slot_snapshot || {}), game_pick_role: row.game_pick_role })
    }
  }
  // the day's slate snapshot, for the two fields the prediction log doesn't carry
  const slim = await text(`${RAW}/slate_${d}_slim.json`, `slate_${d}_slim.json`).then((s) => { try { return JSON.parse(s || 'null') } catch { return null } })
  const slimBy = new Map((Array.isArray(slim) ? slim : []).map((r) => [`${r.game_pk}|${r.player_id}`, r]))
  if (slimBy.size) slateNights++
  for (const [k, p] of board) {
    const o = outs.get(k)
    if (!o || !o.is_final || o.void || o.fair_test_void || !(o.plate_appearances > 0)) continue
    for (const [m, hitOf] of Object.entries(MARKETS)) {
      const hit = hitOf(o)
      add(m, 'all', hit)
      for (const [a, test] of Object.entries(ANGLES)) {
        if (FROM_SLATE.has(a)) { const s = slimBy.get(k); if (!s) continue; add(m, `${a}_base`, hit); if (test(s)) add(m, a, hit) } else if (test(p)) add(m, a, hit)
      }
    }
  }
}
const rate = ([h, n]) => ({ hits: h, n, rate: n ? Math.round(1000 * h / n) / 10 : null })
const markets = Object.fromEntries(Object.entries(T).map(([m, a]) => [m, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, rate(v)]))]))
// an angle has an edge when it beats the same market's board (due / confirmed: the slate nights' board)
for (const a of Object.values(markets)) for (const k of Object.keys(ANGLES)) {
  const base = FROM_SLATE.has(k) ? a[`${k}_base`] : a.all
  if (a[k] && base) a[k].verdict = a[k].n >= 30 && a[k].rate > base.rate ? 'edge' : 'no edge'
}
const out = {
  built_at: new Date().toISOString(),
  method: "Every board hitter (prediction_log slot_snapshot, the last run before his game's first pitch) graded off outcome_log (latest final revision; no plate appearance = void). due / confirmed from slate_<D>_slim.json (the day's last snapshot; from 09-21) against that snapshot's hitters. Angles = components/BoardFilters.js CATEGORIES. An angle has an edge when it beats the same market's board (30+ rows). The full board with angle fields is only archived from 2026-09-12; earlier graded files hold picks only and are written after the games.",
  span: { from: dates[0], to: dates[dates.length - 1], nights: dates.length, slateNights },
  markets,
}
fs.writeFileSync(new URL('../../lib/mlbAngleBacktest.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`)
const cell = (x) => (x ? `${x.rate}%${x.verdict ? (x.verdict === 'edge' ? '✓' : '✗') : ''} (${x.n})` : '—')
console.log(`${dates.length} nights (${dates[0]} .. ${dates[dates.length - 1]}), slate snapshots ${slateNights}`)
for (const [m, a] of Object.entries(markets)) console.log(`  ${m.padEnd(4)} board ${cell(a.all)} | ${Object.keys(ANGLES).map((k) => `${k} ${cell(a[k])}`).join(' | ')} | (due/confirmed base ${cell(a.due_base)})`)
