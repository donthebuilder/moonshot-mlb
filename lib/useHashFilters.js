'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hashParams, writeHash } from './urlState'

// FILTERS IN THE ADDRESS (2026-10-09). A filter row that lives in the shared Filters sheet writes what it is set to
// into the hash as `<prefix>.<key>=<value>` (REPLACE, never push: lib/urlState.js, "replace for everything else
// (filters)"), so a refresh or a shared link reopens the same filters, and Back / Forward re-read the address.
// A value equal to its default is not written. With no `prefix` the state is plain local state (a second panel on the
// same page stays its own). The shells keep their own params; this only ever touches keys under its prefix.
//
//   const [f, setF, reset] = useHashFilters('shots', { res: 'ALL', type: 'ALL' })
//   setF('res', 'goal')  ->  #...&shots.res=goal
export default function useHashFilters(prefix, defaults) {
  const dref = useRef(defaults)
  dref.current = defaults
  const read = useCallback(() => {
    const d = dref.current
    if (!prefix || typeof window === 'undefined') return { ...d }
    const h = hashParams()
    const o = {}
    for (const k of Object.keys(d)) o[k] = h.get(`${prefix}.${k}`) ?? d[k]
    return o
  }, [prefix])
  const [v, setV] = useState(read)
  useEffect(() => {
    if (!prefix) return undefined
    const sync = () => setV(read())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [prefix, read])
  const write = useCallback((patch) => {
    if (!prefix) return
    const h = hashParams()
    for (const [k, val] of Object.entries(patch)) {
      const name = `${prefix}.${k}`
      if (val === dref.current[k] || val == null || val === '') h.delete(name); else h.set(name, String(val))
    }
    writeHash(h)
  }, [prefix])
  const set = useCallback((k, val) => { setV((s) => ({ ...s, [k]: val })); write({ [k]: val }) }, [write])
  const reset = useCallback(() => {
    const d = dref.current
    setV({ ...d })
    write(Object.fromEntries(Object.keys(d).map((k) => [k, d[k]])))
  }, [write])
  return [v, set, reset]
}
