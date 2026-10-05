// THE FEATURED-GAME RULE, BACKTESTED (BATCH-GAME-WRITEUP plan rule 5: "measure
// before trusting it"). For MLB and NHL, one game a day goes to X. Does the game
// the rule picks actually do better than the slate? Run on every archived board:
//
//   node scripts/writeups/featured-backtest.mjs
//
// MLB: the locked boards por_rows_<date>.jsonl (the data branch has them from
//      2026-09-09 -- earlier nights were never archived), graded off each game's
//      final box (1+ HR = hit, no plate appearance = void), like lib/shadowRecord.
// NHL: LAMP's graded nights (/api/lamp/record: every called skater, score, hit).
// A game's "calls" are each side's highest-scored CALLED player (lib/callStatus);
// a game is eligible when both sides have one (rule 1). Rule 2 ranks by the sum
// of the two scores; the fallback ranks by the TOP call alone. Rule 4 (no club
// two days running within 5 points) runs as written; rule 3's start-time
// tiebreak can't (the archives carry no start time) and says so in the output.
// Writes lib/writeups/featuredBacktest.json, which /admin prints. Nothing posts.
await import('../_esm-resolve.mjs')
const fs = await import('node:fs')
const { callStatus } = await import('../../lib/callStatus.js')
const { dailyFeatured } = await import('../../lib/writeups/featured.js')

const POR = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const SITE = 'https://dashnetwork.vercel.app'
const FIRST_MLB = '2026-09-09'
const BOX_FIELDS = 'gameData,status,abstractGameState,liveData,boxscore,teams,away,home,players,id,stats,batting,plateAppearances,homeRuns'
const today = new Date().toISOString().slice(0, 10)
const days = (from, to) => { const out = []; for (let t = Date.parse(`${from}T12:00:00Z`); t < Date.parse(`${to}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out }
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } })); return out }
const rate = (h, n) => ({ hits: h, n, rate: n ? Math.round(1000 * h / n) / 10 : null })

// one rule over a run of days: [{ date, games:[{ game_id, teams, calls:[{score, role, hit}] }] }]
function run(nights, rank) {
  let fh = 0, fn = 0, ah = 0, an = 0, featuredGames = 0
  const recent = []   // clubs featured on each of the last nights
  for (const night of nights) {
    const elig = night.games.filter((g) => g.calls.length >= 2)
    for (const g of elig) for (const c of g.calls) if (c.hit != null) { an++; if (c.hit) ah++ }
    const pick = dailyFeatured(elig.map((g) => ({ ...g, start: '', lineups: true, started: false })), { rank, recentTeams: new Set(recent.slice(-2).flat()) })
    if (!pick) { recent.push([]); continue }
    featuredGames++
    for (const c of pick.calls) if (c.hit != null) { fn++; if (c.hit) fh++ }
    recent.push(pick.teams)
  }
  return { featuredGames, featured: rate(fh, fn), all: rate(ah, an) }
}

// ── MLB ──
const jsonl = (t) => t.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
const mlbDates = days(FIRST_MLB, today)
const perDate = await pool(mlbDates, 6, async (d) => [d, jsonl(await fetch(`${POR}/por_rows_${d}.jsonl`).then((r) => (r.ok ? r.text() : '')).catch(() => ''))])
const mlbNights = []
const sides = new Map()   // date|pk -> Map(team -> best called row)
for (const [d, rows] of perDate) {
  const seen = new Set()
  for (const r of rows) {
    const pk = String(r?.game_pk ?? ''), id = String(r?.player_id ?? '')
    if (!pk || !id || seen.has(`${pk}|${id}`)) continue
    seen.add(`${pk}|${id}`)
    const role = String(r.game_pick_role || '').trim()
    const st = callStatus({ role, board_rank: Number(r.scores?.board_rank), board_of: Number(r.scores?.board_of), on_board: true })
    if (st !== 'called' || !r.team) continue
    const key = `${d}|${pk}`
    if (!sides.has(key)) sides.set(key, new Map())
    const m = sides.get(key), cur = m.get(r.team), score = Number(r.scores?.hr)
    if (!cur || score > cur.score) m.set(r.team, { pk, id, score, role, team: r.team })
  }
}
const pks = [...new Set([...sides.keys()].map((k) => k.split('|')[1]))]
const boxes = new Map(await pool(pks, 10, async (pk) => [pk, await fetch(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live?fields=${BOX_FIELDS}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)]))
const lineOf = (pk, id) => {
  const f = boxes.get(pk)
  if (f?.gameData?.status?.abstractGameState !== 'Final') return undefined
  for (const side of ['away', 'home']) {
    const p = f?.liveData?.boxscore?.teams?.[side]?.players?.[`ID${id}`]
    if (p) return { pa: Number(p.stats?.batting?.plateAppearances) || 0, hr: Number(p.stats?.batting?.homeRuns) || 0 }
  }
  return { pa: 0, hr: 0 }
}
for (const d of mlbDates) {
  const games = [...sides.entries()].filter(([k]) => k.startsWith(`${d}|`)).map(([k, m]) => {
    const calls = [...m.values()].map((c) => { const l = lineOf(c.pk, c.id); return { score: c.score, role: c.role, hit: l === undefined || l.pa === 0 ? null : l.hr > 0 } })
    return { game_id: k.split('|')[1], teams: [...m.keys()], calls }
  })
  if (games.length) mlbNights.push({ date: d, games })
}

// ── NHL ──
const nhl = await fetch(`${SITE}/api/lamp/record?days=120`).then((r) => r.json()).catch(() => null)
const nhlNights = (nhl?.nights || []).slice().reverse().map((n) => {
  const byGame = new Map()
  for (const c of n.called || []) {
    const gid = [c.team, c.opp].sort().join('@')
    if (!byGame.has(gid)) byGame.set(gid, new Map())
    const m = byGame.get(gid), cur = m.get(c.team)
    if (!cur || c.score > cur.score) m.set(c.team, { score: c.score, role: c.rank === 1 ? 'TOP' : 'GOAL', hit: c.hit == null ? null : !!c.hit })
  }
  return { date: n.date, games: [...byGame.entries()].map(([gid, m]) => ({ game_id: gid, teams: [...m.keys()], calls: [...m.values()] })) }
})

function judge(nights) {
  const sum = run(nights, 'sum'), top = run(nights, 'top')
  const beats = (x) => x.featured.rate != null && x.all.rate != null && x.featured.rate > x.all.rate
  const keep = beats(sum) ? 'sum' : beats(top) ? 'top' : 'neither'
  return { nights: nights.length, from: nights[0]?.date || null, to: nights[nights.length - 1]?.date || null, sum, top, keep }
}
const out = {
  built_at: new Date().toISOString(),
  method: "Each game's calls = each side's highest-scored CALLED player; eligible = both sides have one. Featured = rule 2 (sum of the two scores) or the TOP call alone, with rule 4 (no club featured in the last 2 days when another game is within 5). Rule 3's start-time tiebreak is not applied: the archives carry no start time. Hit rate is per call, voids out.",
  mlb: { source: `por_rows_<date>.jsonl from ${FIRST_MLB} (earlier nights were never archived), graded off statsapi final boxes`, ...judge(mlbNights) },
  nhl: { source: '/api/lamp/record nights (LAMP graded called skaters)', ...judge(nhlNights) },
}
fs.writeFileSync(new URL('../../lib/writeups/featuredBacktest.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`)
for (const s of ['mlb', 'nhl']) {
  const r = out[s]
  console.log(`${s.toUpperCase()} ${r.nights} nights (${r.from} .. ${r.to})`)
  console.log(`  rule 2 (sum): featured ${r.sum.featured.hits}/${r.sum.featured.n} = ${r.sum.featured.rate}%  vs all ${r.sum.all.hits}/${r.sum.all.n} = ${r.sum.all.rate}%`)
  console.log(`  TOP only:     featured ${r.top.featured.hits}/${r.top.featured.n} = ${r.top.featured.rate}%  vs all ${r.top.all.hits}/${r.top.all.n} = ${r.top.all.rate}%`)
  console.log(`  keep: ${r.keep}`)
}
