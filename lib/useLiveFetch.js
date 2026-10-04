'use client'
// ONE LIVE-DATA HOOK FOR EVERY PRODUCT (2026-10-02, moved out of
// lib/nhl/useLamp.js unchanged so BUCKETS reads its routes the way LAMP does):
//   useLiveFetch(url, { pollMs, enabled, tap }) -> { data, error, loading, refresh, at }
// A response is kept only if it is for the url still being asked for; a
// live view (pollMs(data) > 0) or a tap view pulls on the ↻ / a return to
// the tab (lib/liveRefresh.js); nothing runs on a timer.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveRefresh } from './liveRefresh'

const STALE_REFETCH_MS = 10 * 60 * 1000

// ONE REQUEST PER URL AT A TIME (2026-10-04 perf audit): the ticker, Home
// and the tab each mounted their own reader of the same route, so LAMP pulled
// /api/lamp/board (457 KB decoded) 3-4 times per load. Readers that ask for
// the same url while a request is in flight -- or within 2 s of it landing --
// share that one response.
const SHARE_MS = 2000
const _shared = new Map() // url -> { p: Promise, at: number|null }

function getJSON(url) {
  const hit = _shared.get(url)
  if (hit && (hit.at == null || Date.now() - hit.at < SHARE_MS)) return hit.p
  const entry = { p: null, at: null }
  entry.p = fetchJSON(url).then(
    (j) => { entry.at = Date.now(); return j },
    (e) => { if (_shared.get(url) === entry) _shared.delete(url); throw e },
  )
  _shared.set(url, entry)
  return entry.p
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' })
  let body = null
  try { body = await res.json() } catch { /* fall through */ }
  if (!res.ok) {
    const err = new Error(body?.error || `${res.status}`)
    err.status = res.status
    err.detail = body?.detail || ''
    throw err
  }
  return body
}

/**
 * Generic reader. `pollMs(data)` returns the interval for the NEXT tick
 * given the latest payload, or 0 for "don't".
 */
// LIVE ON YOUR TAP (2026-10-02, Donovan: "live in game based on personal
// refresh"). `pollMs(data)` no longer schedules anything: a non-zero answer
// only says "this view is live right now", and a live view pulls once on the
// header's ↻ or a return to the tab (lib/liveRefresh.js). `tap: true` joins a
// view that's always worth a pull on ↻ (the ledger). Every visitor's phone
// used to call these routes every 30-120 s while a game was on; now only
// when someone asks.
export function useLiveFetch(url, { pollMs = () => 0, enabled = true, tap = false } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled && url))
  const [at, setAt] = useState(0)
  const alive = useRef(true)
  const timer = useRef(null)
  const latest = useRef(null)
  const atRef = useRef(0)
  // THE URL STILL BEING ASKED FOR (2026-09-27, audit 00A finding 1, P0). One
  // `alive` flag served every url, and the effect for the NEW date set it back
  // to true -- so a slow response for the old date landed after the new one
  // and replaced it: URL and header said Fri Sep 25, the board showed Sat Sep
  // 26's games. A response is kept only if it is for the url still current.
  const current = useRef(url)

  const load = useCallback(async () => {
    if (!url || !enabled) return null
    const stale = () => !alive.current || current.current !== url
    try {
      const j = await getJSON(url)
      if (stale()) return null
      latest.current = j
      atRef.current = Date.now()
      setData(j); setError(null); setAt(atRef.current)
      return j
    } catch (e) {
      if (stale()) return null
      setError({ message: e.message || 'LIVE DATA DELAYED', detail: e.detail || '', status: e.status || 0 })
      return null
    } finally {
      if (!stale()) setLoading(false)
    }
  }, [url, enabled])

  useEffect(() => {
    alive.current = true
    current.current = url
    setLoading(Boolean(enabled && url))
    setData(null); setError(null); latest.current = null; atRef.current = 0
    load()
    const onVis = () => {
      if (typeof document === 'undefined' || document.hidden) return
      // back after 10 minutes: anything (live or not) is worth one fresh read;
      // a live view's return-pull comes from lib/liveRefresh.js instead
      if (Date.now() - (atRef.current || 0) > STALE_REFETCH_MS && !pollMs(latest.current)) load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive.current = false
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, load])

  // the ↻ (or a return to the tab): a live view, or a tap view, pulls once
  useLiveRefresh(() => { if (enabled && url && (tap || pollMs(latest.current))) load() })

  return { data, error, loading, refresh: load, at }
}
