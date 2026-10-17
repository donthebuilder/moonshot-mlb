'use client'
import { useCallback, useEffect, useState } from 'react'
import { hashParams, writeHash } from './urlState'

// A LENS IS A PAGE'S SECOND VIEW, KEPT IN THE ADDRESS (2026-10-17): Odds -> Longshots, Power -> Hot streaks.
// `lens=<key>` rides the hash, so a link, a reload and Back all agree; the default view writes nothing. An old key
// that means "this page, that lens" (#tab=longshots, #tab=hotsticks) is an alias that sets it (lib/routes.js ALIAS_PARAMS).
// `valid` is the lens keys this page has; anything else reads as the default.
export function useHashLens(valid, def) {
  const read = useCallback(() => { const v = hashParams().get('lens'); return v && valid.includes(v) ? v : def }, [valid, def])
  const [lens, setLensRaw] = useState(def)
  useEffect(() => {
    const sync = () => setLensRaw(read())
    sync()
    // an alias rewrites the address right after the page mounts: read again once it has
    const later = setTimeout(sync, 0)
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => { clearTimeout(later); window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [read])
  const setLens = (k) => {
    setLensRaw(k)
    try { const h = hashParams(); if (!k || k === def) h.delete('lens'); else h.set('lens', k); writeHash(h) } catch { /* the lens still works without the address */ }
  }
  return [lens, setLens]
}
