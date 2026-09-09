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

const KEY = 'tuddy_results_archive_v1'
const MAX_WEEK = 18
const PRE_WEEKS = 4

const tagOf = (mode, week) => `${mode === 'preseason' ? 'p' : 'w'}${String(week).padStart(2, '0')}`
export const weekKey = (season, mode, week) => `${season}_${tagOf(mode, week)}`
const urlFor = (season, key) => `${NFL_DATA_BASE}/nfl_results_${season}_${key.split('_')[1]}.json`

function readStore() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
function writeStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* full store is not fatal */ }
}

async function fetchWeek(season, key) {
  try {
    const r = await fetch(`${urlFor(season, key)}?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    return j && j.totals ? j : null
  } catch { return null }
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
    const ask = wanted.filter((k) => fresh.has(k) || !have[k] || !have[k].totals)
    ;(async () => {
      const got = await Promise.all(ask.map((k) => fetchWeek(yr, k).then((j) => [k, j])))
      if (!alive) return
      for (const [k, j] of got) if (j) have[k] = j
      if (results?.totals && week) have[current] = results
      const next = { ...store, [yr]: have }
      writeStore(next)
      setArchive(have)
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
