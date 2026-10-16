'use client'
// 🧾 THE FOOTBALL ARCHIVE — season-to-date, harvested the MLB way.
//
// nfl_results.json is rewritten every grading pass, so the Accountability tab
// could only ever show the last run. Since 2026-09-05 the bot also writes one
// file per graded week under a name the site can guess --
// nfl_results_<season>_w03.json, p02 for preseason -- and publish_data.sh
// carries them forward on the data branch. This is the browser-side harvest,
// the same shape as lib/ledgerArchive.js does for graded_results_<date>.json:
// ask for every week up to the current one, keep what answers, remember it.
//
// Donovan (2026-09-05): "i want it like mlb how it updates because i will
// refresh the site or bot daily." So: the current week and the one before it
// are re-fetched on every load (a Thursday grade is not the Monday grade);
// older weeks come out of localStorage and are only asked for again if they
// were never seen. A 404 is a week that hasn't been graded, not an error.
import { useEffect, useState } from 'react'
import { NFL_DATA_BASE } from './dataSource'
import { sharedRead, sharedJSON } from '../sharedRead'
import { digestKey, gradedTotals, MAX_WEEK, PRE_WEEKS } from './resultsDigest'

const KEY = 'tuddy_results_archive_v2'
// MAX_WEEK (19-22 are the playoffs, only asked once results.week gets there) and PRE_WEEKS live in resultsDigest.js with the
// naming and the hasGrade rule, so the Home digest route and this archive cannot disagree on which files exist.
export const weekKey = digestKey
// Exported 2026-09-15 for lib/tuddyLedger.js (B10a) -- same one-week file,
// same fetch, no second implementation of either.
export const urlFor = (season, key) => `${NFL_DATA_BASE}/nfl_results_${season}_${key.split('_')[1]}.json`

function readStore() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
function writeStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* full store is not fatal */ }
}

// A GRADED WEEK HAS AT LEAST ONE GRADED PICK (2026-10-05 scan). The bot could
// publish {totals:{}} when its card fetch failed, and `j.totals` is truthy for
// {} -- so the empty grade was accepted, cached in localStorage, and (older
// weeks are never re-asked once `totals` is truthy) kept for good. Key bumped to
// v2 so a browser already holding one lets go of it.
export const hasGrade = gradedTotals

// Exported 2026-09-15 for lib/tuddyLedger.js (B10a) -- see urlFor above.
export async function fetchWeek(season, key) {
  try {
    // one read per week file when two readers on the page (Home's tiles and its strip) ask in the same moment
    const j = await sharedRead(`week:${season}:${key}`, async () => {
      const r = await fetch(`${urlFor(season, key)}?t=${Date.now()}`, { cache: 'no-store' })
      return r.ok ? r.json() : null
    })
    return hasGrade(j) ? j : null
  } catch { return null }
}

/**
 * HOME'S SMALL READ (2026-10-13, TUDDY speed). Home prints season totals and a week count, nothing else of the weekly
 * files, so it asks /api/nfl/results-digest (one cached read of { [weekKey]: { totals } }) instead of up to 22 whole files
 * plus the preseason probes. Same shape as useResultsArchive's `archive`/`keys` for what Home reads (seasonTotals, keys),
 * same fold-in of the current payload, so the numbers are the archive's. Pages that need a week's picks keep the archive.
 */
export function useResultsDigest(results, season) {
  const [weeks, setWeeks] = useState(null)   // null until the digest answers (or fails): no partial record before then
  const [failed, setFailed] = useState(false) // the read failed, or the route said it only got some of the weeks
  const yr = Number(season || results?.season) || null
  const mode = results?.mode || 'week'
  const week = Number(results?.week) || 0
  useEffect(() => {
    if (!yr) return undefined
    let alive = true
    setFailed(false)
    sharedJSON(`/api/nfl/results-digest?season=${yr}&mode=${mode}&week=${week}`)
      .then((j) => { if (alive) { setFailed(Boolean(j?.partial)); setWeeks(j?.weeks || {}) } }).catch(() => { if (alive) { setFailed(true); setWeeks({}) } })
    return () => { alive = false }
  }, [yr, mode, week, results?.graded_at])
  // NOTHING UNTIL THE DIGEST LANDS: the archive printed no record until every file was in, and folding the current week in
  // alone would show this week's tally as the season's for a beat, then jump.
  // loading and failed are not "nothing graded": a caller prints a dash for either, never a record built from what is left
  if (weeks == null) return { archive: {}, keys: [], loading: true, failed: false }
  if (failed) return { archive: {}, keys: [], loading: false, failed: true }
  const archive = { ...weeks }
  // the current payload is always folded in under its own key, as in useResultsArchive
  if (yr && results?.totals && week) archive[weekKey(yr, mode, week)] = { totals: results.totals, ...(results.line_totals ? { line_totals: results.line_totals } : {}) }
  return { archive, keys: Object.keys(archive).sort(keyOrder), loading: false, failed: false }
}

/** How the rungs did against the book's own line (the weeks that stored one): { n, hit, pct, from, to } -- from/to are the
 *  first and last week numbers that carried a line, so a caller can say "wk 3-5" and not imply the whole season. */
export function lineTotals(keys, archive) {
  let n = 0, hit = 0
  const wk = []
  for (const k of keys || []) {
    const lt = archive?.[k]?.line_totals
    if (!lt) continue
    let wn = 0
    for (const t of Object.values(lt)) { const m = Number(t?.n) || 0; wn += m; n += m; hit += Number(t?.hit) || 0 }
    if (wn > 0) { const num = Number(String(k).split('_')[1]?.slice(1)); if (String(k).split('_')[1]?.[0] === 'w' && num) wk.push(num) }
  }
  wk.sort((a, b) => a - b)
  return { n, hit, pct: n ? Math.round(1000 * hit / n) / 10 : null, from: wk[0] ?? null, to: wk[wk.length - 1] ?? null }
}

/** Human label for a key: "Week 3", "Pre 2". */
export function labelOf(key) {
  const tag = String(key).split('_')[1] || ''
  const n = Number(tag.slice(1))
  return tag[0] === 'p' ? `Pre ${n}` : `Week ${n}`
}

/** Sort keys: preseason first, then weeks, ascending. */
export const keyOrder = (a, b) => {
  const [sa, ta] = a.split('_'); const [sb, tb] = b.split('_')
  if (sa !== sb) return sa < sb ? -1 : 1
  if (ta[0] !== tb[0]) return ta[0] === 'p' ? -1 : 1
  return Number(ta.slice(1)) - Number(tb.slice(1))
}

/**
 * Every graded week for this season, keyed like weekKey(). The current
 * payload (`results`, from nfl_results.json) is always folded in under its own
 * key so the newest grade is present even before the archive file has been
 * published for it.
 */
export function useResultsArchive(results, season) {
  const [archive, setArchive] = useState({})
  const [loading, setLoading] = useState(true)
  const yr = Number(season || results?.season) || null
  const mode = results?.mode || 'week'
  const week = Number(results?.week) || 0

  useEffect(() => {
    if (!yr) { setLoading(false); return undefined }
    let alive = true
    const store = readStore()
    const have = { ...(store[yr] || {}) }
    const current = weekKey(yr, mode, week)
    const wanted = []
    // Preseason weeks, then regular-season weeks up to the current one.
    for (let w = 1; w <= PRE_WEEKS; w++) wanted.push(weekKey(yr, 'preseason', w))
    const top = mode === 'week' ? Math.min(MAX_WEEK, Math.max(week, 1)) : 0
    for (let w = 1; w <= top; w++) wanted.push(weekKey(yr, 'week', w))
    const prev = mode === 'week' && week > 1 ? weekKey(yr, 'week', week - 1) : null
    const fresh = new Set([current, prev].filter(Boolean))
    // A KNOWN MISS IS NOT RE-ASKED (2026-10-04, audit 14 noise: the four
    // preseason files 404'd on every load, because a miss was never stored).
    // A past week's missing file waits a day; once the regular season is on, a
    // missing preseason week is never coming. The current and previous weeks
    // are always asked.
    const skipMiss = (k) => {
      const m = have[k]
      if (!m?.missing || fresh.has(k)) return false
      return (mode === 'week' && k.includes('_p')) || Date.now() - (m.at || 0) < 864e5
    }
    const ask = wanted.filter((k) => !skipMiss(k) && (fresh.has(k) || !have[k] || !hasGrade(have[k])))
    ;(async () => {
      const got = await Promise.all(ask.map((k) => fetchWeek(yr, k).then((j) => [k, j])))
      if (!alive) return
      for (const [k, j] of got) { if (j) have[k] = j; else if (!fresh.has(k)) have[k] = { missing: true, at: Date.now() } }
      if (results?.totals && week) have[current] = results
      const next = { ...store, [yr]: have }
      writeStore(next)
      setArchive(Object.fromEntries(Object.entries(have).filter(([, v]) => v && !v.missing)))
      setLoading(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yr, mode, week, results?.graded_at])

  return { archive, loading, keys: Object.keys(archive).sort(keyOrder) }
}

/** Per-market season-to-date totals across a set of graded payloads. */
export function seasonTotals(payloads) {
  const out = {}
  for (const p of payloads) {
    for (const [mk, t] of Object.entries(p?.totals || {})) {
      const cur = out[mk] || { n: 0, hit: 0, void: 0, weeks: 0 }
      cur.n += Number(t.n) || 0
      cur.hit += Number(t.hit) || 0
      cur.void += Number(t.void) || 0
      if (Number(t.n) > 0) cur.weeks += 1
      out[mk] = cur
    }
  }
  for (const t of Object.values(out)) t.pct = t.n ? Math.round(1000 * t.hit / t.n) / 10 : null
  return out
}

/**
 * What a grade has been worth THIS season: every graded rung across the
 * archive, bucketed by the letter the site printed on it, with its hit rate.
 * The Report tab's deciles are the backtest's answer to the same question;
 * this is the live one, and it is thin until a few weeks are in -- `n` rides
 * on every band so the page can say so.
 */
export function gradeBands(payloads, gradeOf) {
  const out = {}
  for (const p of payloads) {
    for (const blk of Object.values(p?.card || {})) {
      for (const r of blk?.rungs || []) {
        if (r.hit !== true && r.hit !== false) continue
        const label = gradeOf(r.score).label
        const cur = out[label] || { label, n: 0, hit: 0 }
        cur.n += 1; cur.hit += r.hit ? 1 : 0
        out[label] = cur
      }
    }
  }
  const order = ['A+', 'A', 'A-', 'B+', 'B', 'C+']
  return order.filter((k) => out[k]).map((k) => ({ ...out[k], pct: Math.round(1000 * out[k].hit / out[k].n) / 10 }))
}

/** One number for the header: all markets, all weeks. */
export function grandTotal(totals) {
  let n = 0, hit = 0
  for (const t of Object.values(totals || {})) { n += t.n || 0; hit += t.hit || 0 }
  return { n, hit, pct: n ? Math.round(1000 * hit / n) / 10 : null }
}
