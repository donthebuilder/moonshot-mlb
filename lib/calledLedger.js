'use client'

// ═══ THE CALLED LEDGER — MOONSHOT'S FEED INTO THE SHARED Ledger COMPONENT ═══
//
// Path to Victory A10 (decided 2026-09-13, Donovan: "Full fledge, build it."):
// every night's CALLED homers, running totals, per-player history, browsable
// by date, PERSISTED SERVER-SIDE — NOT ONE BROWSER.
//
// THE DATA SOURCE. There is already a real, multi-night, server-side archive:
// graded_results_YYYY-MM-DD.json, one file per night, published by
// bots/live_results_tracker.py to the bot's own `data` branch. It carries
// `graded_slots` (the bot's own designations — game_pick_role: TOP / HR /
// HRR / HIT / CONTACT / WATCH / TOP15) and `hr_capture_report
// .all_homer_entries` (every homer in the majors that night, whether the
// sheet had him or not). Results.js, ResultsDepth.js and the existing Homer
// Ledger (lib/ledgerArchive.js / SeasonRecord.js) already read this exact
// file for exactly this reason — this module does too, and invents nothing.
//
// WHY A SEPARATE FILE RATHER THAN CALLING lib/ledgerArchive.js's OWN NIGHT
// STORE DIRECTLY. That store is a BROWSER cache (localStorage,
// `ms_ledger_night_*`), the right tool for the page it was built for (the
// numerology research tool at #tab=ledger) and the wrong shape of
// "persisted" for A10's own stated complaint: "not one browser". This module
// calls the same pure fetch — `fetchGradedNight`, exported from
// ledgerArchive.js, THE data source, not a second one — and keeps only an
// IN-MEMORY cache scoped to this page's session: a fresh load of the site
// always re-derives the truth from the branch, never from a value one
// device happened to store weeks ago. The branch itself — kept, shared, the
// same file for every visitor — is the server-side record; this cache is
// purely a within-session network optimisation, the same job fetchShared()
// already does for the live slate (lib/dataSource.js).
//
// THE THREE-WAY CALL (Path to Victory item 14 / the notification audit).
// CALLED = TOP, HR, HIT, HRR or CONTACT (CONTACT added 2026-09-26, see
// lib/callStatus.js; decided 2026-09-15, Donovan, widening the
// original TOP/HR-only cut). Each of those four is its own real "call" lane
// with its own hit-rate scoreboard elsewhere on the site -- Path to Victory
// A1's PICKS lane (TOP+HR) and A9's Hits/HRR lanes, both graded the same
// way. WATCH is documented in A1 as explicitly "not a call"; TOP15 is a
// ranking band, not a designated pick -- both stay ON BOARD. CONTACT was a
// band here until 2026-09-26, when it joined the calls (it is graded on its
// own bar, 2+ total bases, like the other four).
//   CALLED         wore TOP, HR, HIT, HRR or CONTACT that night — a real call.
//   ON THE BOARD   tracked by the sheet (a graded slot exists) with none of
//                  those five badges — WATCH, TOP15, or no role
//                  published at all.
//   NOT ON BOARD   not a graded slot at all — an off-slate homer (bench bat,
//                  call-up, late-lineup replacement).
// Identical to the classification SeasonRecord.js's RoleChip already draws
// (`badged` / `onSheet` / neither, both fed by the same `badged` flag in
// lib/ledgerArchive.js's fetchGradedNight) — reused here, not reinvented, so
// a hitter's status can never read differently on the two pages.
//
// THE SCHEMA IS NOT STABLE ACROSS THE SEASON (confirmed by hand, 2026-09-15:
// curled graded_results_2026-04-19 through -09-14 off the branch directly).
// Files before roughly late May carry no `hr_capture_report` at all — some
// are a bare array of picks, one has `hrs_caught`/no `graded_slots`, one has
// neither `graded_slots` nor `hr_capture_report`. A night like that MUST NOT
// silently count as "zero home runs" in a season total — that is exactly the
// "zero is a join bug until proven otherwise" mistake this repo's own rules
// warn about. So every night carries `hasCapture`, and loadCalledSeason only
// folds nights where it is true into the total, reporting how many of the
// nights it walked actually had it.

import { fetchGradedNight, recentDates, seasonRecord } from './ledgerArchive'
import { leagueRates } from './leagueRates'
import { postseasonOn } from './dash/seasonGuard'

// date (YYYY-MM-DD) -> night entry | null (a confirmed miss). THIS SESSION
// ONLY — cleared on a hard reload, never written to disk.
const cache = new Map()

// The statuses /called prints (lib/record/mlbStatus.js via /api/mlb/call-status),
// per night, for this page session. A failed read is null: the night is then
// labelled by the same lib/callStatus.js rule from the graded row alone.
const feedCache = new Map()
export async function loadFeedNights(from, to) {
  const need = recentDates(to, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5) + 1).filter((d) => !feedCache.has(d))
  if (!need.length) return
  const lo = need[need.length - 1]
  const hi = need[0]
  try {
    const r = await fetch(`/api/mlb/call-status?from=${lo}&to=${hi}`)
    if (!r.ok) return
    const { days = {} } = await r.json()
    need.forEach((d) => feedCache.set(d, days[d] || { of: null, st: {} }))
  } catch { /* the graded file alone */ }
}

/** One night, straight off the branch — cached only for this page load. */
export async function getCalledNight(date) {
  if (!date) return null
  if (cache.has(date)) return cache.get(date)
  await loadFeedNights(date, date)
  const entry = await fetchGradedNight(date, feedCache.get(date) || null)
  cache.set(date, entry)
  return entry
}

/** Drops this session's in-memory cache — the one honest "stale" failure
 *  mode left once localStorage is out of the picture. */
export function clearCalledLedgerCache() { cache.clear(); feedCache.clear() }

/**
 * Every night in the `days` ending on `endDate`, fetched (cache-aware) and
 * folded into the same season digest lib/ledgerArchive.js's own Season
 * Record view uses (`seasonRecord`) — one definition of "the season" for
 * both pages. Nights without real hr_capture_report coverage are walked
 * (so Prev/Next single-night browsing still works past them) but EXCLUDED
 * from the aggregate, and counted separately so the UI can say so.
 *
 * Sequential on purpose, same reasoning as ledgerArchive.js's harvestRange:
 * raw.githubusercontent.com is a shared resource, and opening 100+
 * connections to it at once is a burst for no reader-visible gain.
 */
export async function loadCalledSeason(endDate, days, { onProgress } = {}) {
  const dates = recentDates(endDate, days)
  // the statuses for the whole window in a few requests, not one per night
  for (let i = 0; i < dates.length; i += 60) {
    // eslint-disable-next-line no-await-in-loop
    await loadFeedNights(dates[Math.min(i + 59, dates.length - 1)], dates[i])
  }
  const covered = []
  let published = 0
  for (let i = 0; i < dates.length; i += 1) {
    const d = dates[i]
    // eslint-disable-next-line no-await-in-loop
    const entry = await getCalledNight(d)
    if (entry) {
      published += 1
      if (entry.hasCapture) covered.push({ ...entry, date: d })
    }
    onProgress?.({ i: i + 1, of: dates.length, date: d, ok: Boolean(entry) })
  }
  // ONE SEASON PER RECORD (2026-09-27, list-posts step 6): nights on the end
  // date's side of the postseason's first day make `season`; the other side
  // comes back as `otherSeason`, never mixed into one percentage.
  const post = await postseasonOn(endDate).catch(() => ({ postseason: null }))
  const inPost = Boolean(post.start && endDate >= post.start)
  const side = post.start ? covered.filter((e) => (e.date >= post.start) === inPost) : covered
  const other = post.start ? covered.filter((e) => (e.date >= post.start) !== inPost) : []
  return {
    season: seasonRecord(side),
    postseason: inPost,
    otherSeason: other.length ? seasonRecord(other) : null,
    otherNights: other.length,
    coveredNights: side.length,
    publishedNights: published,
    requestedNights: dates.length,
  }
}

// ── THE BASE RATE ───────────────────────────────────────────────────────
// "The naive baseline hit-rate to compare against" (Path to Victory A10) —
// for homers, the league's own home runs per team-game, fetched live off
// MLB's own season team-hitting totals (lib/leagueRates.js — already
// shipped for the Home tab's "is tonight loud" context lines). Real,
// sourced, never a number typed in here.
export async function hrBaseRate() {
  const r = await leagueRates()
  if (!r) return null
  return {
    value: r.hrPerGame,
    unit: 'HR / team-game',
    label: 'League average',
    note: `${r.season} season, ${r.games.toLocaleString()} games — MLB team hitting totals`,
  }
}

// ── MAPPING A NIGHT INTO THE SHARED Ledger COMPONENT'S GENERIC ROW SHAPE ──
// ONE DEFINITION (2026-10-06, ledger audit P0-1): `status` is set by
// digestGradedNight from lib/callStatus.js with the homer_feed rows /called
// reads -- never re-derived here from "was he on the sheet". An entry stored
// before that existed falls back to the old reading.
const statusOf = (r) => r.status || (r.badged ? 'called' : r.onSheet ? 'board' : 'off')
const statusLabelOf = (r) => {
  const st = statusOf(r)
  return st === 'called' ? (r.role || 'CALLED') : st === 'board' ? (r.role || 'on the board') : 'not on the board'
}

/** One night's homers, in the shape components/ledger/Ledger.js reads. */
export function nightToRows(night) {
  if (!night?.hasCapture || !Array.isArray(night.all)) return []
  return night.all
    .slice()
    .sort((a, b) => b.hr - a.hr || (b.hrScore || 0) - (a.hrScore || 0))
    .map((r, i) => ({
      id: `${night.date}-${r.pid || r.name}-${i}`,
      name: r.name,
      team: r.team,
      value: r.hr,
      status: statusOf(r),
      statusLabel: statusLabelOf(r),
      score: r.hrScore,
      detail: [r.ft ? `${r.ft} ft` : null, r.ev ? `${r.ev.toFixed(1)} mph` : null, r.spot ? `#${r.spot} spot` : null]
        .filter(Boolean).join(' · '),
      wasOn: r.seasonHrSlate,
      _raw: { player_id: r.pid != null ? Number(r.pid) : undefined, player_name: r.name, name: r.name, team: r.team },
    }))
}

/** Called / on board / not on board counts for one night. */
export function nightTotals(night) {
  const rows = nightToRows(night)
  const hrs = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + r.value, 0)
  return {
    // HOME RUNS, not hitters: a two-homer night is two, as /called counts it
    total: rows.reduce((a, r) => a + r.value, 0),
    men: rows.length,
    called: hrs('called'),
    board: hrs('board'),
    off: hrs('off'),
  }
}

/** The season's per-player history, in the same generic row shape. */
export function seasonHitterRows(season) {
  if (!season) return []
  return season.hitters.map((h) => ({
    id: h.k,
    name: h.name,
    team: h.team,
    value: h.hr,
    status: h.calledNights > 0 ? 'called' : h.boardNights > 0 ? 'board' : 'off',
    statusLabel: h.calledNights > 0
      ? `${h.calledNights} called night${h.calledNights === 1 ? '' : 's'}`
      : h.boardNights > 0 ? `${h.boardNights} on board` : 'off board',
    score: h.avgScore,
    detail: [h.nights ? `${h.nights}n` : null, h.longest ? `${h.longest.ft} ft` : null, h.ev ? `${h.ev.toFixed(1)} mph` : null]
      .filter(Boolean).join(' · '),
    wasOn: h.wasOn,
    last: h.last,
    _raw: { player_id: h.pid != null ? Number(h.pid) : undefined, player_name: h.name, name: h.name, team: h.team },
  }))
}
