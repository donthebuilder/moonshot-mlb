'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { STATE, alpha } from '../lib/scales'

// ══ THE UNIVERSAL FILTER (rebuilt 2026-08-23; original build 2026-08-22 was
// lost with its session before it reached GitHub — spec preserved in
// claude/moonshot-universal-filter.md) ═══════════════════════════════════════
//
// Donovan asked for the same thing on four surfaces in four wordings:
//   Boards:        "make the boards filter look universal for the site"
//   Pitcher modal: "make clickable buttons all that filters"
//   Patterns:      "make them filterable"
//   Picks:         "if so filters button"
//
// The survey behind it: five `chip()` factories, four byte-identical TabBtn
// components, two hand-styled <select> idioms — every one hard-coding
// ember's orange, which made the filter rows the least theme-aware part of
// the site. One control, drawn once, in the THEME ACCENT via STATE.on()/off()
// and alpha() — state is not measurement, so a filter never wears a data hue.
//
// ZERO hex literals in this file, by design. API modelled on PitchBreakdown's
// SplitControl ({ label, hint, value, options, onChange }) — the cleanest
// control signature already in the repo.
//
// Two behaviours promoted from single owners to first-class props, because
// each existed in exactly one place and deserved to exist everywhere:
//   · `count` on an option — Bot's PICK_TABS and OddsBoard's plus-money pill
//     both printed how many rows a filter would leave. Knowing the size of a
//     slice before you click it is the difference between a filter and a
//     guess.
//   · the undoable sentence — Runs' "Showing X only — 12 of 260 … show
//     everyone" reads better than a chip row for one active filter:
//     <ActiveFilters variant="sentence">.

// ── the one pill recipe ─────────────────────────────────────────────────────
export function FilterPill({ active, onClick, children, count, title, disabled }) {
  const s = active ? STATE.on() : STATE.off()
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        padding: '4px 11px', fontSize: 10, borderRadius: 999, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${s.borderColor}`,
        background: active ? alpha(s.color, 0.14) : 'transparent',
        color: s.color, fontWeight: s.fontWeight,
        whiteSpace: 'nowrap', opacity: disabled ? 0.45 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
    >
      {children}
      {count != null && (
        <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 700, opacity: 0.85 }}>{count}</span>
      )}
    </button>
  )
}

// ── a labelled row of pills — the SplitControl shape, shared ────────────────
export function PillRow({ label, hint, value, options, onChange, flag }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
      {label && <FilterLabel>{label}</FilterLabel>}
      {options.map((o) => (
        <FilterPill
          key={o.key}
          active={value === o.key}
          onClick={() => onChange(o.key)}
          count={o.count}
          title={o.title}
          disabled={o.disabled}
        >{o.label}</FilterPill>
      ))}
      {flag && <span style={{ fontSize: 9.5, color: C.orange, fontWeight: 800, fontFamily: NUM_FONT }}>{flag}</span>}
      {hint && <span style={{ fontSize: 9, color: C.text3 }}>{hint}</span>}
    </div>
  )
}

// ── joined segments, for binary/tri-state toggles ───────────────────────────
export function Segmented({ value, options, onChange, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {label && <FilterLabel>{label}</FilterLabel>}
      <span style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {options.map((o, i) => {
          const active = value === o.key
          const s = active ? STATE.on() : STATE.off()
          return (
            <button key={o.key} onClick={() => onChange(o.key)} title={o.title} style={{
              padding: '4px 10px', fontSize: 10, cursor: 'pointer', border: 'none',
              borderLeft: i ? `1px solid ${C.border}` : 'none',
              background: active ? alpha(s.color, 0.14) : 'transparent',
              color: s.color, fontWeight: s.fontWeight,
            }}>{o.label}</button>
          )
        })}
      </span>
    </span>
  )
}

// ── the one <select> recipe (Runs' Picker + Controls' team dropdown, unified)
export function FilterSelect({ label, value, options, onChange, title }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={title}>
      {label && <FilterLabel>{label}</FilterLabel>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '4px 8px', fontSize: 10.5, borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${C.border}`, background: C.bg2, color: C.text2, fontWeight: 700,
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}{o.count != null ? ` (${o.count})` : ''}</option>
        ))}
      </select>
    </span>
  )
}

// ── search box, same chrome ─────────────────────────────────────────────────
export function FilterSearch({ value, onChange, placeholder = 'Search…', width = 150 }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: '4px 10px', fontSize: 10.5, borderRadius: 999, width,
        border: `1px solid ${value ? STATE.on().borderColor : C.border}`,
        background: 'transparent', color: C.text, fontWeight: 600, outline: 'none',
      }}
    />
  )
}

// ── min/max pair for a numeric column ───────────────────────────────────────
export function RangeFilter({ label, min, max, onMin, onMax, step = 1 }) {
  const box = (v, on, ph) => (
    <input
      type="number" value={v ?? ''} step={step} placeholder={ph}
      onChange={(e) => on(e.target.value === '' ? null : Number(e.target.value))}
      style={{
        width: 54, padding: '3px 6px', fontSize: 10, borderRadius: 7, fontFamily: NUM_FONT,
        border: `1px solid ${v != null ? STATE.on().borderColor : C.border}`,
        background: 'transparent', color: C.text, outline: 'none',
      }}
    />
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {label && <FilterLabel>{label}</FilterLabel>}
      {box(min, onMin, 'min')}
      <span style={{ fontSize: 9, color: C.text3 }}>–</span>
      {box(max, onMax, 'max')}
    </span>
  )
}

// ── what's active, and the way back out ─────────────────────────────────────
// filters: [{ key, label, onClear }]. Two variants:
//   chips (default) — removable chips, for 2+ active filters
//   sentence        — Runs' undoable sentence, best for exactly one:
//                     "Showing LHB only — 101 of 269 · show everyone"
export function ActiveFilters({ filters, shown, total, variant = 'chips', onClearAll }) {
  const live = (filters || []).filter(Boolean)
  if (!live.length) return null
  if (variant === 'sentence' && live.length === 1) {
    const f = live[0]
    return (
      <span style={{ fontSize: 10, color: C.text2 }}>
        Showing <b style={{ color: C.text }}>{f.label}</b> only
        {shown != null && total != null && <> — <b style={{ fontFamily: NUM_FONT }}>{shown}</b> of <span style={{ fontFamily: NUM_FONT }}>{total}</span></>}
        {' · '}
        <button onClick={f.onClear} style={{
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          color: C.orange, fontSize: 10, fontWeight: 700, textDecoration: 'underline',
        }}>show everyone</button>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      {live.map((f) => (
        <button key={f.key} onClick={f.onClear} title="remove this filter" style={{
          padding: '2px 8px', fontSize: 9.5, borderRadius: 999, cursor: 'pointer',
          border: `1px solid ${STATE.on().borderColor}`,
          background: alpha(STATE.on().color, 0.14), color: STATE.on().color, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>{f.label} ✕</button>
      ))}
      {live.length > 1 && onClearAll && (
        <button onClick={onClearAll} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: C.text3, fontSize: 9.5, fontWeight: 700, textDecoration: 'underline',
        }}>clear all</button>
      )}
    </span>
  )
}

// ── collapsible panel for the heavy filter sets (Boards) ────────────────────
export function FilterPanel({ open, onClose, children, width = 300 }) {
  const ref = useOutsideClose(onClose, open)
  if (!open) return null
  return (
    <div ref={ref} style={{
      position: 'absolute', zIndex: 40, top: '100%', left: 0, marginTop: 6, width, maxWidth: '92vw',
      background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 12,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 12px 30px rgba(0,0,0,.35)',
    }}>{children}</div>
  )
}

// ── the row that hosts a filter set: trigger + active chips + slot ──────────
export function FilterBar({ children }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {children}
    </div>
  )
}

export function FilterLabel({ children }) {
  return (
    <span style={{
      fontSize: 9, color: C.text3, fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: '.05em', whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

// ── shared outside-click hook (was re-written per surface) ──────────────────
export function useOutsideClose(onClose, active = true) {
  const ref = useRef(null)
  useEffect(() => {
    if (!active) return undefined
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose, active])
  return ref
}
