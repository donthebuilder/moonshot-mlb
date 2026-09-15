'use client'

// ═══ THE TUDDY LEDGER — NFL'S SIDE OF THE SHARED Ledger COMPONENT ═══════════
//
// Path to Victory B10a (Track B10, "fully clone MLB to NFL"): every week's
// CALLED touchdowns, running totals, per-player history, browsable by week,
// through the exact same components/ledger/Ledger.js MOONSHOT's Called
// Ledger (lib/calledLedger.js) uses — same component, TD's noun and rate
// instead of HR's, week instead of night. See that file's own header for the
// shared contract; this one only says where NFL's numbers come from.
//
// THE DATA SOURCE. nfl_results_<season>_w{week:02d}.json — one real file per
// GRADED week, rewritten in place while that week is live and then left
// alone once the next week starts (lib/nfl/resultsArchive.js's own header,
// 2026-09-05). It carries:
//   `card.TD.rungs`   the five-deep TD ladder for that week — the model's
//                     actual calls, each with `actual` (real TDs that week)
//                     and `hit` (actual >= the 1-TD bar).
//   `lines`           every player the model tracked ANY market for that
//                     week, keyed by gsis id — `lines[pid].TD` is his real
//                     TD count if the TD market tracked him, whether he
//                     scored or not (RB/WR/TE, per card.TD.positions).
// This module reuses resultsArchive.js's own `fetchWeek`/`urlFor`/`weekKey`
// — the same fetch Accountability's charts already use — never a second
// implementation of the same request.
//
// THE THREE-WAY CALL, NFL'S VERSION OF THE SAME RULE MLB'S LEDGER FOLLOWS
// (Path to Victory item 14): a called touchdown and a random one must never
// look the same.
//   CALLED        one of the week's five TD rungs, and he actually scored.
//   ON BOARD      the TD market tracked him (a `lines[pid].TD` entry exists)
//                 and he scored, but he wasn't one of the five rungs.
//   NOT ON BOARD  he scored and the TD market never had a line on him at
//                 all — a return man, a QB sneak, a practice-squad call-up.
// A player who was CALLED but did not score is not an "event" — same as
// MLB's ledger, this only lists touchdowns that actually happened; misses
// live on Accountability, not here.
//
// THE HONEST LIMIT, DISCLOSED RATHER THAN GUESSED (same discipline as
// ledgerArchive.js's `hasCapture` flag for pre-format-change MLB nights).
// NOT ON BOARD needs a source that lists every real scorer regardless of
// whether the model was tracking him — `lines` cannot supply that, since a
// player never tracked is by definition absent from it. nfl_fantasy_stats.py
// (2026-09-14) publishes exactly that, ESPN-sourced, every player in the
// box score — but only for whichever week it currently covers, overwritten
// on the next one with no per-week archive (unlike nfl_results). So NOT ON
// BOARD is only computable for the week nfl_fantasy_stats.json still holds
// (almost always the most recent one) — every other week reports it as
// unavailable, not zero, and the UI says so. Confirmed 2026-09-15, Week 1:
// nfl_fantasy_stats.json's 70 real scorers were already ALL present
// somewhere in that week's `lines` — zero true off-board misses that week,
// a real number, not an assumption.

import { fetchWeek, weekKey, labelOf } from './nfl/resultsArchive'
import { fetchNfl, nflFantasyStatsPaths, nflFantasyStatsLooksReal, nflSlatePaths, nflSlateLooksReal } from './nfl/dataSource'

// weekKey -> payload | null (a confirmed miss). Session-only, same reasoning
// as lib/calledLedger.js's cache: always re-derived from the branch on a
// fresh load, never trusted from a browser weeks later.
const cache = new Map()
let nameCache = null // gsis id -> name, off the current slate roster; best-effort only

async function rosterNames() {
  if (nameCache) return nameCache
  try {
    const raw = await fetchNfl(nflSlatePaths(), nflSlateLooksReal)
    const map = new Map()
    for (const p of raw?.players || []) {
      const pid = p?.player_id != null ? String(p.player_id) : null
      if (pid && p?.name) map.set(pid, { name: p.name, team: p.team })
    }
    nameCache = map
  } catch {
    nameCache = new Map()
  }
  return nameCache
}

/** One graded week, straight off the branch (cached only for this page load). */
export async function getTuddyWeek(season, week) {
  const key = weekKey(season, 'week', week)
  if (cache.has(key)) return cache.get(key)
  const entry = await fetchWeek(season, key)
  cache.set(key, entry)
  return entry
}

export function clearTuddyLedgerCache() { cache.clear(); nameCache = null }

/**
 * Every real touchdown in one graded week, called / board / off — see this
 * file's header for exactly what each status means and the NOT ON BOARD
 * limit. `liveStats` is nfl_fantasy_stats.json's payload IF it still covers
 * this exact season/week (null otherwise) — only then is `off` computed.
 */
function weekToRows(payload, season, week, liveStats, names) {
  if (!payload?.lines) return { rows: [], offAvailable: false }
  const rungs = payload?.card?.TD?.rungs || []
  const calledIds = new Set(rungs.filter((r) => r.hit).map((r) => String(r.player_id)))
  const rungById = new Map(rungs.map((r) => [String(r.player_id), r]))
  const rows = []

  for (const [pid, line] of Object.entries(payload.lines)) {
    const td = Number(line?.TD)
    if (!Number.isFinite(td) || td < 1) continue
    const rung = rungById.get(pid)
    const status = calledIds.has(pid) ? 'called' : 'board'
    rows.push({
      id: `${season}w${week}-${pid}`,
      name: payload.names?.[pid] || pid,
      team: rung?.team || null,
      value: td,
      status,
      statusLabel: status === 'called' ? `#${rung.rank} on the card` : 'on board',
      score: rung?.score,
      detail: [rung?.opp ? `vs ${rung.opp}` : null, rung?.position || null, rung?.grade || null].filter(Boolean).join(' · '),
      _raw: { player_id: pid, player_name: payload.names?.[pid] || pid, name: payload.names?.[pid] || pid, team: rung?.team },
    })
  }

  const offAvailable = Boolean(liveStats && Number(liveStats.season) === Number(season) && Number(liveStats.week) === Number(week))
  if (offAvailable) {
    for (const [pid, s] of Object.entries(liveStats.players || {})) {
      if (payload.lines[pid]) continue // already tracked, handled above
      const td = (Number(s.rushing_touchdowns) || 0) + (Number(s.receiving_touchdowns) || 0) + (Number(s.return_touchdowns) || 0)
      if (td < 1) continue
      const nm = names?.get(pid)
      rows.push({
        id: `${season}w${week}-${pid}`,
        name: nm?.name || pid,
        team: nm?.team || null,
        value: td,
        status: 'off',
        statusLabel: 'not on board',
        score: undefined,
        detail: 'never tracked by the TD market',
        _raw: { player_id: pid, player_name: nm?.name || pid, name: nm?.name || pid, team: nm?.team },
      })
    }
  }

  rows.sort((a, b) => b.value - a.value || (b.score || 0) - (a.score || 0))
  return { rows, offAvailable }
}

/** Called / on board / not on board counts for one week. */
function totalsOf(rows) {
  return {
    total: rows.length,
    called: rows.filter((r) => r.status === 'called').length,
    board: rows.filter((r) => r.status === 'board').length,
    off: rows.filter((r) => r.status === 'off').length,
  }
}

/** One week, in the shape components/ledger/Ledger.js reads. Returns null on
 *  a confirmed miss (week not graded/published yet). */
export async function getTuddyWeekLedger(season, week, { withOffBoard = true } = {}) {
  const payload = await getTuddyWeek(season, week)
  if (!payload) return null
  const liveStats = withOffBoard ? await fetchNfl(nflFantasyStatsPaths(), nflFantasyStatsLooksReal).catch(() => null) : null
  const names = withOffBoard && liveStats ? await rosterNames() : null
  const { rows, offAvailable } = weekToRows(payload, season, week, liveStats, names)
  return { season, week, rows, totals: totalsOf(rows), offAvailable }
}

/**
 * Every graded week 1..throughWeek for `season`, sequential (same courtesy
 * ledgerArchive.js's harvestRange pays raw.githubusercontent.com — a real
 * NFL season is at most ~18 requests, not 150).
 */
export async function loadTuddySeason(season, throughWeek, { onProgress } = {}) {
  const weeks = []
  let offWeeksCovered = 0
  for (let w = 1; w <= throughWeek; w += 1) {
    // eslint-disable-next-line no-await-in-loop
    const wk = await getTuddyWeekLedger(season, w)
    if (wk) {
      weeks.push(wk)
      if (wk.offAvailable) offWeeksCovered += 1
    }
    onProgress?.({ i: w, of: throughWeek, week: w, ok: Boolean(wk) })
  }
  if (!weeks.length) return null

  const allRows = []
  let called = 0, board = 0, off = 0
  const byPlayer = new Map()
  for (const wk of weeks) {
    for (const r of wk.rows) {
      allRows.push({ ...r, week: wk.week })
      if (r.status === 'called') called += 1
      else if (r.status === 'board') board += 1
      else off += 1
      const key = r._raw.player_id
      const cur = byPlayer.get(key) || { id: key, name: r.name, team: r.team, td: 0, calledWeeks: 0, boardWeeks: 0, weeks: 0, lastWeek: 0, avgScoreSum: 0, avgScoreN: 0 }
      cur.td += r.value
      cur.weeks += 1
      if (r.status === 'called') cur.calledWeeks += 1
      else if (r.status === 'board') cur.boardWeeks += 1
      if (Number.isFinite(r.score)) { cur.avgScoreSum += r.score; cur.avgScoreN += 1 }
      cur.lastWeek = Math.max(cur.lastWeek, wk.week)
      cur.name = r.name; cur.team = r.team || cur.team
      byPlayer.set(key, cur)
    }
  }

  return {
    seasonYear: season,
    from: weekKey(season, 'week', weeks[0].week),
    to: weekKey(season, 'week', weeks[weeks.length - 1].week),
    weeksCount: weeks.length,
    totalEvents: allRows.length,
    called, board, off,
    offWeeksCovered,
    requestedWeeks: throughWeek,
    perWeek: weeks.length ? Math.round((10 * allRows.length) / weeks.length) / 10 : null,
    hitters: [...byPlayer.values()],
    weeks,
  }
}

// ── THE BASE RATE ───────────────────────────────────────────────────────
// The measured weekly TD-scorer rate among the model's own eligible pool —
// NOT a guess. 2024+2025, 9,746 player-weeks, 1,952 TD scorers, ~270
// eligible/week: base rate 20.6% (2024) / 19.5% (2025), both seasons
// agreeing within half a point (claude/tuddy-td-model-the-number-2026-09-13.md,
// script ~/td_measure.py). Reported as a range rather than one invented
// blended figure.
export function tdBaseRate() {
  return {
    value: '~20%',
    unit: 'of eligible RB/WR/TE score a TD in a given week',
    label: 'Measured base rate',
    note: '20.6% (2024) / 19.5% (2025), 9,746 player-weeks measured — see tuddy-td-model-the-number-2026-09-13.md',
  }
}

/** One week's rows, already in the shared Ledger row shape (weekToRows does the work). */
export function weekRows(week) { return week?.rows || [] }
export function weekTotals(week) { return week?.totals || { total: 0, called: 0, board: 0, off: 0 } }

/** The season's per-player history, in the shared Ledger row shape. */
export function seasonHitterRows(season) {
  if (!season) return []
  return season.hitters
    .slice()
    .sort((a, b) => b.td - a.td)
    .map((h) => ({
      id: h.id,
      name: h.name,
      team: h.team,
      value: h.td,
      status: h.calledWeeks > 0 ? 'called' : h.boardWeeks > 0 ? 'board' : 'off',
      statusLabel: h.calledWeeks > 0
        ? `${h.calledWeeks} called week${h.calledWeeks === 1 ? '' : 's'}`
        : h.boardWeeks > 0 ? `${h.boardWeeks} on board` : 'off board',
      score: h.avgScoreN ? Math.round(h.avgScoreSum / h.avgScoreN) : undefined,
      detail: `${h.weeks} wk`,
      last: weekKey(season.seasonYear, 'week', h.lastWeek),
      _raw: { player_id: h.id, player_name: h.name, name: h.name, team: h.team },
    }))
}
