// TUDDY'S CARD, GRADED IN PUBLIC (2026-09-27, BATCH-TUDDY-DEPTH step 1).
//
// The weekly card -- five rungs in each of seven markets -- is graded every
// week by the bot (bots/nfl/nfl_results.py -> nfl_results_<season>_wNN.json)
// and shown in-app on the Record tab (components/nfl/tabs/Accountability.js).
// /called only counted touchdowns, so the card's record was buried. This is
// the server-side read of the SAME files with the SAME arithmetic as the
// Record tab's seasonTotals() (lib/nfl/resultsArchive.js): per market, sum
// the files' own `totals` {n, hit, void}; pct = hit / n; a void (no line, or
// an ineligible position) is never a miss. Nothing is re-graded here.
//
// THE EDGE is the bot's own back-test (bots/nfl/export_report.py card_edges
// -> nfl_report_card.json): the card's hit rate against a form-only pick at
// the same depth, with its sample and a trust word. Printed as the bot wrote
// it, including when it is zero or negative.
//
// Server only (plain fetch, no 'use client'); cached like the front door's
// pulse. A missing file is a normal state: the block renders without it.
import { NFL_DATA_BASE } from './dataSource'
import { splitByBar } from './barSplit'

const TTL = 300
const MARKET_ORDER = ['TD', 'REC_YDS', 'REC', 'RUSH_YDS', 'RUSH_ATT', 'PASS_YDS', 'KICK_PTS']

async function get(file) {
  try {
    const res = await fetch(`${NFL_DATA_BASE}/${file}`, { next: { revalidate: TTL } })
    return res.ok ? await res.json() : null
  } catch { return null }
}

/** Same sum as resultsArchive.js seasonTotals(): per market n / hit / void / weeks. */
export function sumTotals(payloads) {
  const out = {}
  for (const p of payloads) {
    for (const [mk, t] of Object.entries(p?.totals || {})) {
      const o = (out[mk] ||= { n: 0, hit: 0, void: 0, weeks: 0 })
      o.n += Number(t?.n) || 0
      o.hit += Number(t?.hit) || 0
      o.void += Number(t?.void) || 0
      if ((Number(t?.n) || 0) > 0) o.weeks += 1
    }
  }
  for (const o of Object.values(out)) o.pct = o.n ? Math.round((1000 * o.hit) / o.n) / 10 : null
  return out
}

/**
 * THE BASE RATE FOR THE SAME BAR (Wave 8 ladder): the report card's back-test, per market, pooled over the seasons it
 * carries -- the rate for EVERY player the model scored (the deciles' own n), not the picks. Counted from the file's
 * own numbers (seasons[y][market].base and the deciles' n); a market or season the file does not carry is left out,
 * and null comes back when none is. This season's whole board is not stored player by player, so this is the reference
 * the ladder prints, labelled with its seasons.
 * @returns {{ n:number, hits:number, seasons:string[], scope:string } | null}
 */
export function baselineFromReport(report, key) {
  let n = 0, hits = 0
  const seasons = []
  for (const [y, markets] of Object.entries(report?.seasons || {})) {
    const m = markets?.[key]
    const rate = Number(m?.base)
    const size = Object.values(m?.deciles || {}).reduce((a, d) => a + (Number(d?.n) || 0), 0)
    if (!Number.isFinite(rate) || !(size > 0)) continue
    n += size; hits += Math.round((rate / 100) * size); seasons.push(y)
  }
  if (!n) return null
  seasons.sort()
  return { n, hits, seasons, scope: `${seasons.length > 1 ? 'back-test seasons' : 'back-test season'} ${seasons.join(' and ')}` }
}

/** The table cell: { head: '+7.8 pts' | 'none yet', detail: '60% vs 52.2% · leans' }. */
export function edgeParts(e) {
  if (!e || !Number.isFinite(Number(e.edge))) return null
  const edge = Number(e.edge)
  return { head: edge > 0 ? `+${edge} pts` : 'none yet', detail: `${Number(e.hit)}% vs ${Number(e.form_hit)}%${e.trust ? ` · ${e.trust}` : ''}` }
}

/** The edge in words: never rounder than the bot's number, and honest at zero. */
export function edgeWord(e) {
  if (!e || !Number.isFinite(Number(e.edge))) return null
  const edge = Number(e.edge)
  if (edge <= 0) return `no edge over recent form yet (${Number(e.hit)}% vs ${Number(e.form_hit)}%)`
  return `+${edge} pts over recent form (${Number(e.hit)}% vs ${Number(e.form_hit)}%)`
}

/**
 * The season's graded card, regular season and playoffs, weeks 1-22 (preseason weeks carry
 * their own pNN files and are left out, labelled as such).
 * @returns {Promise<null | { season, week, gradedAt, weeks: number[], markets: object[], backtest: object|null }>}
 */
export async function readNflCardRecord() {
  const latest = await get('nfl_results.json')
  if (!latest?.season || !latest?.totals) return null
  const season = Number(latest.season)
  const lastWeek = latest.mode === 'week' ? Number(latest.week) || 0 : 0
  const files = await Promise.all(Array.from({ length: Math.min(22, lastWeek) }, (_, i) => get(`nfl_results_${season}_w${String(i + 1).padStart(2, '0')}.json`)))
  // The current week's archive file can lag the live one; the Record tab keys
  // the live file by its week, so the live one stands in for it.
  const byWeek = new Map()
  files.forEach((f, i) => { if (f?.totals && f.mode === 'week') byWeek.set(i + 1, f) })
  if (latest.mode === 'week') byWeek.set(lastWeek, latest)
  // THE LIVE WEEK'S "VOIDS" ARE PENDING CALLS. nfl_results.py writes every
  // ungraded rung as void (hit null), so on 09-27 week 3 -- not yet played --
  // read "5 void" in every market. A void is only knowable once the week is
  // over: the live week counts its graded calls (n, hit) as they land, and
  // its void count stays out until the next week's file exists.
  const payloads = [...byWeek.entries()].map(([w, p]) => ({
    week: w, card: p.card, bars: p.bars,
    totals: w === lastWeek ? Object.fromEntries(Object.entries(p.totals || {}).map(([k, t]) => [k, { ...t, void: 0 }])) : p.totals,
  }))
  // One record per bar: weeks graded at an older bar are reported apart (lib/nfl/barSplit.js), never added in.
  const totals = splitByBar(payloads, sumTotals)
  const liveGraded = Object.values(latest.totals || {}).reduce((n, t) => n + (Number(t?.n) || 0), 0)
  const report = await get('nfl_report_card.json')
  const edges = report?.card_edges || {}
  const card = latest.card || {}
  const markets = MARKET_ORDER.filter((k) => totals[k] || card[k]).map((k) => ({
    key: k,
    label: card[k]?.label || k,
    bar: card[k]?.bar ?? null,
    ...(totals[k] || { n: 0, hit: 0, void: 0, weeks: 0, pct: null }),
    edge: edges[k] || null,
  }))
  const bases = Object.fromEntries(markets.map((m) => [m.key, baselineFromReport(report, m.key)]).filter(([, b]) => b))
  const anyEdge = markets.find((m) => m.edge)?.edge
  return {
    season, week: lastWeek, gradedAt: latest.graded_at || null,
    weeks: [...byWeek.keys()].sort((a, b) => a - b),
    // The live week: { week, graded } -- graded = its calls graded so far.
    live: latest.mode === 'week' ? { week: lastWeek, graded: liveGraded } : null,
    markets,
    bases,
    backtest: anyEdge ? { picks: anyEdge.picks, depth: anyEdge.depth, seasons: Object.keys(anyEdge.seasons || {}) } : null,
  }
}
