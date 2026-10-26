'use client'
import { useCallback, useEffect, useState } from 'react'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'

// 🙈 HIDE A CLUB OR A PLAYER (2026-10-26, Donovan: "filter players out too ... we don't want a certain player, or certain teams ... more
// intuitive"). One small shared control for the openings research pages: the ones you hide stay hidden on this device (localStorage, never
// the server; a browser that blocks it just forgets), and a chip row says what is hidden and puts it back in one tap.
//   const h = useHidden('nhl:clubs')            { hidden: Set, toggle(id), clear() }
//   <HideClubs clubs={['BOS', ...]} h={h} .../>  the "Hide teams" chip and its picker
//   <HiddenChips h={h} label={(id) => name} .../> what is hidden now, a tap each to bring back
export function useHidden(key) {
  const [hidden, setHidden] = useState(() => new Set())
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(`dash-hide:${key}`) || '[]'); if (Array.isArray(v)) setHidden(new Set(v.map(String))) } catch { /* private window: nothing remembered */ }
  }, [key])
  const save = useCallback((s) => { try { localStorage.setItem(`dash-hide:${key}`, JSON.stringify([...s])) } catch { /* not kept */ } }, [key])
  const toggle = useCallback((id) => setHidden((prev) => { const n = new Set(prev); const k = String(id); if (n.has(k)) n.delete(k); else n.add(k); save(n); return n }), [save])
  const clear = useCallback(() => { const n = new Set(); setHidden(n); save(n) }, [save])
  return { hidden, toggle, clear }
}

/** The "Hide teams" chip: opens a wrap of club chips, each pressed = hidden (`label(id)` draws a player's name). Renders nothing when there are none. */
export function HideClubs({ clubs = [], h, C, NUM_FONT, accent, word = 'teams', label = (c) => c }) {
  const [open, setOpen] = useState(false)
  if (!clubs.length) return null
  const n = clubs.filter((c) => h.hidden.has(String(c))).length
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="chip-row" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto' }}>
        <button type="button" className={FLAT_CHIP_CLASS} aria-expanded={open} aria-pressed={n > 0} onClick={() => setOpen((v) => !v)} style={{ ...flatChip(n > 0, accent, C, NUM_FONT), flexShrink: 0 }}>{n ? `Hiding ${n} ${n === 1 ? word.replace(/s$/, '') : word}` : `Hide ${word}`}</button>
        {n ? <button type="button" className={FLAT_CHIP_CLASS} onClick={h.clear} style={{ ...flatChip(false, accent, C, NUM_FONT), flexShrink: 0 }}>Show all</button> : null}
      </div>
      {open ? (
        <div role="group" aria-label={`Hide ${word}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {clubs.map((c) => (
            <button key={c} type="button" className={FLAT_CHIP_CLASS} aria-pressed={h.hidden.has(String(c))} onClick={() => h.toggle(c)} style={flatChip(h.hidden.has(String(c)), accent, C, NUM_FONT)}>{label(c)}</button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** What is hidden now, one chip each ("Name ×"), a tap to bring it back. Renders nothing when nothing is hidden. */
export function HiddenChips({ h, label = (id) => id, C, NUM_FONT, accent, ids = null }) {
  const list = [...h.hidden].filter((id) => !ids || ids.has(id))
  if (!list.length) return null
  return (
    <div className="chip-row" role="group" aria-label="Hidden" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto' }}>
      <span style={{ font: `700 11px/1.2 ${NUM_FONT}`, color: C.text3, whiteSpace: 'nowrap' }}>Hidden</span>
      {list.map((id) => (
        <button key={id} type="button" className={FLAT_CHIP_CLASS} onClick={() => h.toggle(id)} aria-label={`Show ${label(id)} again`} style={{ ...flatChip(false, accent, C, NUM_FONT), flexShrink: 0 }}>{`${label(id)} ×`}</button>
      ))}
    </div>
  )
}
