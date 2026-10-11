'use client'
// THE INJURY LAYER, CLIENT SIDE (2026-10-10). One fetch of /api/injuries per sport per 20 minutes for the whole app (the
// server and CDN hold the same window), shared by every chip and every "Out" module through this context. Mounted once in
// components/SportRoot.js. A failed read is SAID ("Injury report unavailable"), never an empty list.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { indexEntries, findEntry, forGame } from '../../lib/injuries/lookup'
import { BLOCKS } from '../../lib/injuries/statuses'

const Ctx = createContext(null)
const WINDOW_MS = 20 * 60 * 1000
const _mem = {}   // sport -> { at, promise }

export function loadInjuries(sport) {
  const hit = _mem[sport]
  if (hit && Date.now() - hit.at < WINDOW_MS) return hit.promise
  const promise = fetch(`/api/injuries?sport=${encodeURIComponent(sport)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && Array.isArray(j.entries) ? j : { sport, ok: false, unavailable: true, reason: 'injury report unavailable', entries: [] }))
    .catch(() => ({ sport, ok: false, unavailable: true, reason: 'injury report unavailable', entries: [] }))
  _mem[sport] = { at: Date.now(), promise }
  return promise
}

export function InjuryLayer({ sport, children }) {
  const [snap, setSnap] = useState(null)
  useEffect(() => {
    let live = true
    setSnap(null)
    loadInjuries(sport).then((s) => { if (live) setSnap(s) })
    return () => { live = false }
  }, [sport])
  const value = useMemo(() => {
    const index = snap && !snap.unavailable ? indexEntries(sport, snap.entries) : null
    return { sport, snap, loading: !snap, unavailable: Boolean(snap && snap.unavailable), index, entryFor: (who) => (index ? findEntry(index, who) : null) }
  }, [sport, snap])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** { sport, snap, loading, unavailable, index, entryFor(who) } or null outside the layer. */
export const useInjuryLayer = () => useContext(Ctx)

/** (clubs) => { out, total }: how many of both clubs' listed men are out (out / injured list / doubtful), and how many are listed at all.
 *  null while loading or when the report is unavailable -- a page then shows no count, never "0 out". */
export function useOutCounts(sport) {
  const layer = useContext(Ctx)
  return (clubs) => {
    if (!layer || !layer.index) return null
    const rows = forGame(layer.index, sport, clubs)
    return { out: rows.filter((e) => BLOCKS.has(e.status)).length, total: rows.length }
  }
}
