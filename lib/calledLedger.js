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

// date (YYYY-MM-DD) -> night entry | null (a confirmed miss). THIS SESSION
// ONLY — cleared on a hard reload, never written to disk.
const cache = new Map()

/** One night, straight off the branch — cached only for this page load. */
export async function getCalledNight(date) {
  if (!date) return null
  if (cache.has(date)) return cache.get(date)
  const entry = await fetchGradedNight(date)
  cache.set(date, entry)
  return entry
}

/** Drops this session's in-memory cache — the one honest "stale" failure
 *  mode left once localStorage is out of the picture. */
export function clearCalledLedgerCache() { cache.clear() }

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
  return {
    season: seasonRecord(covered),
    coveredNights: covered.length,
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
const statusOf = (r) => (r.badged ? 'called' : r.onSheet ? 'board' : 'off')
const statusLabelOf = (r) => (r.badged ? (r.role || 'CALLED') : r.onSheet ? (r.role || 'on sheet') : 'not on sheet')

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
  return {
    total: rows.length,
    called: rows.filter((r) => r.status === 'called').length,
    board: rows.filter((r) => r.status === 'board').length,
    off: rows.filter((r) => r.status === 'off').length,
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
    status: h.badgedNights > 0 ? 'called' : h.sheetNights > 0 ? 'board' : 'off',
    statusLabel: h.badgedNights > 0
      ? `${h.badgedNights} called night${h.badgedNights === 1 ? '' : 's'}`
      : h.sheetNights > 0 ? `${h.sheetNights} on board` : 'off board',
    score: h.avgScore,
    detail: [h.nights ? `${h.nights}n` : null, h.longest ? `${h.longest.ft} ft` : null, h.ev ? `${h.ev.toFixed(1)} mph` : null]
      .filter(Boolean).join(' · '),
    wasOn: h.wasOn,
    last: h.last,
    _raw: { player_id: h.pid != null ? Number(h.pid) : undefined, player_name: h.name, name: h.name, team: h.team },
  }))
}
