'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIsPhone } from '../components/MobileFold'
import { readHashKey, FILTER_EVENT, announceFilters } from './filterHash'
import { columnSetKey, applyColumnSet } from './columnViews'

const memKey = (sport) => `dash_cols_v1:${sport || 'all'}`

/**
 * The chosen set for this device. `set` is always one of lean|read|all (explicit, else the remembered
 * one, else lean on a phone / all on a desktop). `setSet(k)` writes the address and the memory and tells
 * every other copy of the hook on the page.
 */
export function useColumnSet(sport = 'all') {
  const phone = useIsPhone(640)
  const [explicit, setExplicit] = useState(null)
  useEffect(() => {
    const read = () => {
      const fromUrl = columnSetKey(readHashKey('cols'))
      if (fromUrl) { setExplicit(fromUrl); return }
      let mem = null
      try { mem = columnSetKey(window.localStorage.getItem(memKey(sport))) } catch { /* private mode */ }
      setExplicit(mem)
    }
    read()
    window.addEventListener('hashchange', read)
    window.addEventListener('popstate', read)
    window.addEventListener(FILTER_EVENT, read)
    return () => { window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read); window.removeEventListener(FILTER_EVENT, read) }
  }, [sport])
  const setSet = useCallback((next) => {
    const k = columnSetKey(next)
    if (!k) return
    setExplicit(k)
    try { window.localStorage.setItem(memKey(sport), k) } catch { /* private mode */ }
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      h.set('cols', k)
      window.history.replaceState(null, '', `#${h.toString()}`)
    } catch { /* the choice still works without the address */ }
    announceFilters()
  }, [sport])
  return { set: explicit || (phone ? 'lean' : 'all'), explicit, setSet }
}

/** A table's columns for the chosen set, when the caller opted in (`sets`); otherwise the columns untouched. */
export function useSetColumns(columns, enabled, sport) {
  const { set } = useColumnSet(sport)
  return useMemo(() => (enabled ? applyColumnSet(columns, set) : columns), [columns, enabled, set])
}
