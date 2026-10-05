// TUDDY'S BOARD ANGLES, MEASURED, EVERY MARKET (2026-10-05, Donovan: "needs to be ran for all sports
// and all props"). Nothing is written but the result file.
//
//   node scripts/nfl/angle-backtest.mjs --cache <folder>
//
// WHAT HISTORY EXISTS (checked 10-05): the bot's data branch is one squashed commit. The full board
// with its components, per market, is the prediction log (nfl_prediction_log_2026-wkNN.<time>.jsonl)
// for 2026 weeks 1-4; every player's outcome is nfl_results_2026_wNN.json `lines`; game logs for
// 2025-26 are nfl_logs.json. No 2025 board rows exist anywhere, so LAST season can't be replayed --
// this measures what there is, and says so.
//   board     each week's LAST run before its Sunday 1 PM ET window (a Thursday game read from it
//             had kicked off already; its components barely move inside a week -- said)
//   hiconf    the bot's own high_confidence_td_flag: nfl_signal_log, weeks 3-4 only (TD)
//   weak / soft / aligned: they read the week's matchup file (roles, DvP, red zone, snaps), which
//             is not archived week by week -- NOT measurable from published data (said in the file)
// THE ANGLES are components/nfl/NflBoardExtras.js angleDefs (copied: that file is React):
//   rz f_rz_opp >= 75 · gl RB and f_gl_opp >= 75 · total implied_total >= 70 ·
//   last a TD in his last game before the week · two a TD in each of his last two · due rz + no TD in two
// Markets and bars = nfl_results `bars` (TD 1, REC_YDS 40, REC 4, RUSH_YDS 50, RUSH_ATT 12, PASS_YDS
// 225, KICK_PTS 6). A player absent from the week's lines didn't play: void.
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')

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

const tree = await fetch('https://api.github.com/repos/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/git/trees/data?recursive=1').then((r) => r.json())
const files = (tree.tree || []).map((x) => x.path).filter((p) => p.startsWith('public/data/current/')).map((p) => p.slice('public/data/current/'.length))
const logs = JSON.parse(await text(`${RAW}/nfl_logs.json`, 'nfl_logs.json'))
// components/nfl/NflBoardExtras.js tdRun, copied
function tdRun(id, before) {
  const g = logs?.logs?.[String(id)]?.log
  if (!Array.isArray(g)) return null
  const prior = g.filter((x) => Number.isFinite(x?.g_td) && (x.s < before.season || (x.s === before.season && x.w < before.week)))
  const tds = prior.slice(-2).reverse().map((x) => x.g_td)
  if (!tds.length) return null
  return { last: tds[0] > 0, two: tds.length === 2 ? tds[0] > 0 && tds[1] > 0 : null, dry2: tds.length === 2 ? tds[0] === 0 && tds[1] === 0 : null }
}
const ANGLES = {
  rz: (p) => (num(p.components?.f_rz_opp) ?? -1) >= 75,
  gl: (p) => p.position === 'RB' && (num(p.components?.f_gl_opp) ?? -1) >= 75,
  total: (p) => (num(p.components?.implied_total) ?? -1) >= 70,
  last: (p, wk) => tdRun(p.player_id, { season: 2026, week: wk })?.last === true,
  two: (p, wk) => tdRun(p.player_id, { season: 2026, week: wk })?.two === true,
  due: (p, wk) => (num(p.components?.f_rz_opp) ?? -1) >= 75 && tdRun(p.player_id, { season: 2026, week: wk })?.dry2 === true,
}
// week N's Sunday 1 PM ET (week 1 Sunday = 2026-09-13)
const cutoff = (wk) => Date.parse('2026-09-13T17:00:00Z') + (wk - 1) * 7 * 864e5

const T = {}
const add = (m, k, hit) => { T[m] ||= {}; T[m][k] ||= [0, 0]; T[m][k][1] += 1; if (hit) T[m][k][0] += 1 }
const weeks = []
for (let wk = 1; wk <= 18; wk += 1) {
  const res = JSON.parse(await text(`${RAW}/nfl_results_2026_w${String(wk).padStart(2, '0')}.json`, `res_${wk}.json`) || 'null')
  if (!res?.lines) continue
  const pre = files.filter((f) => f.startsWith(`nfl_prediction_log_2026-wk${String(wk).padStart(2, '0')}.`))
  // each run's own generated_at (the file name carries a time but no date)
  let best = null
  for (const f of pre) {
    const rows = jsonl(await text(`${RAW}/${f}`, f))
    const at = Date.parse(rows[0]?.generated_at || '')
    if (Number.isFinite(at) && at < cutoff(wk) && (!best || at > best.at)) best = { at, rows: rows.slice(1), file: f }
  }
  if (!best) continue
  // the bot's high-confidence flag (weeks it was logged), last signal run before the cutoff
  let sig = null
  for (const f of files.filter((x) => x.startsWith(`nfl_signal_log_2026-wk${String(wk).padStart(2, '0')}.`))) {
    const rows = jsonl(await text(`${RAW}/${f}`, f))
    const at = Date.parse(rows[0]?.generated_at || '')
    if (Number.isFinite(at) && at < cutoff(wk) && (!sig || at > sig.at)) sig = { at, by: new Map(rows.slice(1).map((r) => [String(r.player_id), r])) }
  }
  weeks.push({ week: wk, run: best.file, signal: Boolean(sig) })
  const bars = res.bars || {}
  for (const p of best.rows) {
    const m = p.market
    if (!m || bars[m] == null) continue
    const line = res.lines[String(p.player_id)]
    if (!line) continue   // didn't play: void
    const hit = (num(line[m]) ?? 0) >= bars[m]
    add(m, 'board', hit)
    for (const [k, test] of Object.entries(ANGLES)) if (test(p, wk)) add(m, k, hit)
    if (m === 'TD' && sig) { add(m, 'hiconf_base', hit); if (sig.by.get(String(p.player_id))?.high_confidence_td_flag === true) add(m, 'hiconf', hit) }
  }
}
const rate = ([h, n]) => ({ hits: h, n, rate: n ? Math.round(1000 * h / n) / 10 : null })
const markets = Object.fromEntries(Object.entries(T).map(([m, a]) => [m, Object.fromEntries(Object.entries(a).map(([k, v]) => [k, rate(v)]))]))
for (const a of Object.values(markets)) for (const k of [...Object.keys(ANGLES), 'hiconf']) {
  const base = k === 'hiconf' ? a.hiconf_base : a.board
  if (a[k] && base) a[k].verdict = a[k].n >= 30 && a[k].rate > base.rate ? 'edge' : a[k].n < 30 ? 'too few' : 'no edge'
}
const out = {
  built_at: new Date().toISOString(),
  method: "2026 weeks with a pregame board and results: each week's last prediction-log run before its Sunday 1 PM ET window (components barely move inside a week), every player on each market's board, graded off nfl_results lines at the file's bars (absent = didn't play, void). hiconf = the bot's high_confidence_td_flag from nfl_signal_log (weeks 3-4 only). weak / soft / aligned read the weekly matchup file, which is not archived week by week: not measurable. No 2025 board rows exist on the data branch, so last season can't be replayed. An angle has an edge when it beats that market's board (30+ rows).",
  weeks, notMeasurable: { weak: 'matchup roles / DvP not archived weekly', soft: 'DvP not archived weekly', aligned: 'matchup tag / red zone / snaps not archived weekly' },
  markets,
}
fs.writeFileSync(new URL('../../lib/nfl/angleBacktest.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`)
const cell = (x) => (x ? `${x.rate}%${x.verdict === 'edge' ? '✓' : x.verdict === 'no edge' ? '✗' : x.verdict ? '?' : ''} (${x.n})` : '—')
console.log(`weeks: ${weeks.map((w) => `${w.week}${w.signal ? '+sig' : ''}`).join(', ')}`)
for (const [m, a] of Object.entries(markets)) console.log(`  ${m.padEnd(9)} board ${cell(a.board)} | ${[...Object.keys(ANGLES), 'hiconf'].map((k) => `${k} ${cell(a[k])}`).join(' | ')}`)
