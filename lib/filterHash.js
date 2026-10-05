'use client'
import { useCallback, useEffect, useState } from 'react'

// BOARD FILTERS RIDE THE ADDRESS (2026-09-28, audit 00A: "the team filter is
// not in the URL -- a shared or refreshed board loses it"). The top bar's team
// and game (all three products) are fteam= / fgame= -- their own keys, because
// team= / game= already mean a team page or a selected game on LAMP and the
// Games tabs. A filter REPLACES the history entry (it is a view of the page,
// not a new place), follows Back / Forward and pasted links via hashchange,
// and is read after mount so the server render never disagrees with it.
export const FILTER_KEYS = ['fteam', 'fgame']

// pushState / replaceState fire no hashchange: a shell that rewrites fteam= /
// fgame= itself (a week flip drops the game) tells the filters with this.
export const FILTER_EVENT = 'dash:filters'
export function announceFilters() { try { window.dispatchEvent(new Event(FILTER_EVENT)) } catch { /* no window */ } }

export function readHashKey(key) {
  try { return new URLSearchParams(String(window.location.hash || '').replace(/^#/, '')).get(key) || '' } catch { return '' }
}

export function useHashFilter(key) {
  const [value, setValue] = useState('')
  useEffect(() => {
    const read = () => setValue(readHashKey(key))
    read()
    window.addEventListener('hashchange', read)
    window.addEventListener('popstate', read)
    window.addEventListener(FILTER_EVENT, read)
    return () => { window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read); window.removeEventListener(FILTER_EVENT, read) }
  }, [key])
  const set = useCallback((next) => {
    const v = next ? String(next) : ''
    setValue(v)
    try {
      const h = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''))
      if (v) h.set(key, v); else h.delete(key)
      const s = h.toString()
      window.history.replaceState(null, '', s ? `#${s}` : window.location.pathname + window.location.search)
    } catch { /* the filter still works without the address */ }
  }, [key])
  return [value, set]
}
