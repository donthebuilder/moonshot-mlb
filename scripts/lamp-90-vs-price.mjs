// LAMP 90+ vs the STORED BOOK PRICE (2026-10-13). READ-ONLY, report-only analysis: not on the site, not published.
//
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/lamp-90-vs-price.mjs [--out FILE]
//
// Question: of the games LAMP CALLED and scored 90+, how many have a stored book price (odds_snap, snap 'lock', market
// 'goal' = anytime goal), and how does the hit rate compare with what those stored prices imply? Counts only. The
// prices are read the way the site reads them (lib/odds/priceAtLock.js pricesFromRows: one price per player-date,
// best / median of the available books, the feed's no-vig fair price when stored); a player-date with two events
// (a doubleheader, ambiguous) is left out, and a game with no lock row has NO price (never guessed).
// Env values are never printed (same pattern as scripts/learn-report.mjs).
await import('./_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const { createRequire } = await import('node:module')
const args = process.argv.slice(2)
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const envRoot = fs.existsSync(path.join(repoRoot, '.env.local')) ? repoRoot : repoRoot.split(`${path.sep}.claude${path.sep}worktrees${path.sep}`)[0]
const req = createRequire(path.join(envRoot, 'package.json'))
const { loadEnvConfig } = req('@next/env'); loadEnvConfig(envRoot)
const { createClient } = req('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { readNhlRecords } = await import('../lib/record/nhl.js')
const { scoreBandsFromRecords, BAND_TOP } = await import('../lib/record/scoreBands.js')
const { impliedOf, winProfit, americanOf } = await import('../lib/odds/priceAtLock.js')
const { readPaged } = await import('../lib/record/paged.js')
const { wilson } = await import('../lib/interval.js')

const { rows, error } = await readNhlRecords(sb, { graded: true })
if (error) throw new Error(error.message)
const reg = rows.filter((r) => Number(r.game_type) === 2 && r.locked_at && (r.result === 'hit' || r.result === 'miss') && r.score != null)
const bands = scoreBandsFromRecords(rows)

// the lock rows for every regular-season date in the record (all books), the way the site reads them
const dates = reg.map((r) => r.game_date).sort()
const from = dates[0]; const to = dates.at(-1)
const { data: snap, error: e2 } = await readPaged(() => sb.from('odds_snap')
  .select('sport, event_id, game_date, our_player_id, book, odds, available, fair_odds, open_odds, taken_at, market')
  .eq('sport', 'nhl').eq('snap', 'lock').eq('market', 'goal').not('our_player_id', 'is', null).gte('game_date', from).lte('game_date', to)
  .order('game_date').order('event_id').order('odd_id').order('book'))
if (e2) throw new Error(e2.message)
const byPD = new Map()
for (const r of snap) { const k = `${r.game_date}:${r.our_player_id}`; if (!byPD.has(k)) byPD.set(k, []); byPD.get(k).push(r) }
const priceOf = (date, pid) => {
  const list = byPD.get(`${date}:${pid}`)
  if (!list) return { why: 'no lock row' }
  if (new Set(list.map((r) => r.event_id)).size > 1) return { why: 'ambiguous (two events)' }
  const live = list.filter((r) => r.available && Number.isInteger(r.odds))
  if (!live.length) return { why: 'no available book' }
  const imp = live.map((r) => impliedOf(r.odds)).sort((a, b) => a - b)
  const m = imp.length >> 1
  const medImp = imp.length % 2 ? imp[m] : (imp[m - 1] + imp[m]) / 2
  const best = live.reduce((a, b) => (b.odds > a.odds ? b : a)).odds
  const fair = list.find((r) => Number.isInteger(r.fair_odds))?.fair_odds ?? null
  return { median: americanOf(medImp), best, medImp, bestImp: impliedOf(best), fair, fairImp: fair == null ? null : impliedOf(fair), books: live.length }
}

const pct = (x) => (x == null ? '—' : `${(100 * x).toFixed(1)}%`)
const rng = (h, n) => { const w = wilson(h, n); return w ? `${w[0].toFixed(0)}–${w[1].toFixed(0)}%` : '—' }
function summarize(label, list) {
  const priced = []; const why = {}
  for (const r of list) { const p = priceOf(r.game_date, r.player_id); if (p.why) why[p.why] = (why[p.why] || 0) + 1; else priced.push({ r, p }) }
  const hits = priced.filter((x) => x.r.result === 'hit').length
  const mean = (f) => { const v = priced.map((x) => x.p[f]).filter((v) => v != null); return v.length ? { n: v.length, v: v.reduce((a, b) => a + b, 0) / v.length } : null }
  const med = mean('medImp'); const best = mean('bestImp'); const fair = mean('fairImp')
  // one unit staked on each priced game, as a count of what the stored prices would have paid: a fact about the past, not a method
  const units = (f) => priced.reduce((a, x) => a + (x.r.result === 'hit' ? winProfit(x.p[f]) : -1), 0)
  return {
    label, n: list.length, hits: list.filter((r) => r.result === 'hit').length, priced: priced.length, pricedHits: hits, pricedRate: priced.length ? hits / priced.length : null,
    noPrice: why, medImp: med, bestImp: best, fairImp: fair,
    unitsMedian: priced.length ? units('median') : null, unitsBest: priced.length ? units('best') : null,
    buckets: [['under +200', (a) => a < 200], ['+200 to +299', (a) => a >= 200 && a < 300], ['+300 and longer', (a) => a >= 300]].map(([name, f]) => {
      const b = priced.filter((x) => f(x.p.median)); return { name, n: b.length, hits: b.filter((x) => x.r.result === 'hit').length, mean: b.length ? b.reduce((a, x) => a + x.p.medImp, 0) / b.length : null }
    }),
  }
}

const top = reg.filter((r) => Number(r.score) >= BAND_TOP)
const groups = [
  summarize('CALLED + 90+', top.filter((r) => r.status === 'called')),
  summarize('90+ not CALLED', top.filter((r) => r.status !== 'called')),
  summarize('CALLED under 90', reg.filter((r) => r.status === 'called' && Number(r.score) < BAND_TOP)),
  summarize('All scored skaters (the base)', reg),
]
const dayCover = new Set(snap.map((r) => r.game_date)).size
const line = (g) => {
  const ci = rng(g.pricedHits, g.priced)
  return `| ${g.label} | ${g.hits}/${g.n} | ${g.priced} (${g.n ? Math.round((100 * g.priced) / g.n) : 0}%) | ${g.pricedHits}/${g.priced} = ${pct(g.pricedRate)} (${ci}) | ${g.medImp ? pct(g.medImp.v) : '—'} | ${g.bestImp ? pct(g.bestImp.v) : '—'} | ${g.fairImp ? `${pct(g.fairImp.v)} (n=${g.fairImp.n})` : '—'} |`
}
const md = `# LAMP 90+ vs the stored book price (as of ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })})

Report only. Not on the site, not published, and not betting advice: these are counts of what happened against prices that were stored before puck drop.

## Scope

- Games: regular season (game_type 2), ${bands.nights} graded nights (${from} to ${to}), LAMP goal model rows as stored at lock (lamp_goal_log; status CALLED / ON THE BOARD / NOT ON THE BOARD is the stored one, never re-derived). A skater who did not dress is out of every count. ${bands.unscored.n} dressed skaters with no score are in no 90+ group.
- Prices: odds_snap, sport nhl, snap 'lock', market 'goal' (anytime goal), ${snap.length} stored rows over ${dayCover} of the ${new Set(reg.map((r) => r.game_date)).size} graded dates. One price per player-date, read the way the site reads it (lib/odds/priceAtLock.js): "median" = the middle of the available books by implied probability, "best" = the longest available price, "fair" = the feed's no-vig price when it was stored. No lock row means no price; nothing is guessed or back-filled. A player-date that sits in two events is left out.

## How many have a stored price, and the hit rate against it

| Group | Scored (all games) | Games with a stored lock price | Scored among the priced | Mean implied by the median book price | Mean implied by the best price | Mean implied by the no-vig fair price |
|---|---|---|---|---|---|---|
${groups.map(line).join('\n')}

"Implied" is the book's price turned into a probability (a price of +200 implies 33.3%), averaged over the priced games in the group. The median and best prices include the book's margin; the fair price does not. The ranges are 95% Wilson ranges on the priced sample.

## Why a game has no price

${groups.map((g) => `- ${g.label}: ${Object.entries(g.noPrice).map(([k, v]) => `${v} ${k}`).join(', ') || 'none missing'}`).join('\n')}

## CALLED + 90+, by the median price offered

| Price bucket | Priced games | Scored | Mean implied |
|---|---|---|---|
${groups[0].buckets.map((b) => `| ${b.name} | ${b.n} | ${b.hits} | ${pct(b.mean)} |`).join('\n')}

## What one unit on every priced game would have returned (a fact about the past, nothing more)

| Group | Priced games | Units at the median price | Units at the best price |
|---|---|---|---|
${groups.map((g) => `| ${g.label} | ${g.priced} | ${g.unitsMedian == null ? '—' : g.unitsMedian.toFixed(1)} | ${g.unitsBest == null ? '—' : g.unitsBest.toFixed(1)} |`).join('\n')}

## Caveats

- Small sample. ${bands.nights} nights, ${groups[0].n} CALLED + 90+ games, ${groups[0].priced} with a price. The 95% range on the priced hit rate is the honest size of the uncertainty; a gap between a hit rate and an implied rate that sits inside it is not a finding.
- The score bands were looked at after the fact. 90+ is a cut picked once the results were visible; a different cut would give a different table. Treat this as a question to watch forward, not a result.
- The prices are the lock snapshot (NHL: 5-15 minutes before puck drop). A price a person could actually have taken is not stored, the books' limits are not stored, and neither is anything about a price moving after the snapshot.
- Missing prices may not be random. A game with no lock row is one the feed had no stored price for, and that can differ by team, line or night; the priced share is shown above for each group.
- The median and best prices carry the book's margin, so the average implied rate overstates the true chance a little; the fair price is the closer comparison where it exists.
- Nothing here says a price is right or wrong. It compares two counts.
`
console.log(md)
if (out) fs.writeFileSync(out, md)
