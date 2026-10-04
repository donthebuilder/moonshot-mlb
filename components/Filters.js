'use client'
import { useSportTheme } from './SportTheme'
import { createContext, useContext, useEffect, useRef } from 'react'
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

// ── THE PRODUCT'S ACCENT (2026-09-27) ──────────────────────────────────────
// STATE.on() reads lib/theme's C.orange -- MOONSHOT's ember -- and applyTheme
// repaints only TUDDY's greys, so every shared pill, segment and search box
// drew MOONSHOT orange on TUDDY green and LAMP ice (Donovan: "doesn't feel
// anything like the mlb pages"). A product wraps its pages once in
// <AccentProvider value={C.green}>; unwrapped (MOONSHOT) stays STATE.on().
const AccentCtx = createContext(null)
export const AccentProvider = AccentCtx.Provider
// R7 (2026-10-04): one source for the product's colour -- an explicit
// AccentProvider wins, else the product's SportTheme (components/SportTheme),
// else MOONSHOT's STATE.on(). A page inside TUDDY's / LAMP's theme but outside
// the accent wrapper no longer falls back to MOONSHOT orange.
function useProductAccent() {
  const a = useContext(AccentCtx)
  const t = useSportTheme()
  return a || (t?.themed ? t.accent : null)
}
export function useAccent() { return useProductAccent() || STATE.on().color }
function useOn() {
  const a = useProductAccent()
  return a ? { borderColor: a, color: a, fontWeight: 800 } : STATE.on()
}

// ── the one pill recipe ─────────────────────────────────────────────────────
export function FilterPill({ active, onClick, children, count, title, disabled }) {
  const on = useOn()
  const s = active ? on : STATE.off()
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        // 2026-09-13: 4px vertical was tight for the pill used on every filter
        // row site-wide — this is the shared recipe, so the bump benefits
        // every board, not just this one.
        padding: '6px 12px', fontSize: 10, borderRadius: 999, cursor: disabled ? 'default' : 'pointer',
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
  const on = useOn()
  return (
    // `filter-pills` is a hook for MobileCSS, not a style. On a 400px phone
    // seven market chips wrapped to THREE lines, and Boards spent ~330px of a
    // 723px screen on filter chrome before the first player row. The mobile
    // sheet turns this into one sideways-scrolling rail, the same shape
    // Games.js's own .nfl-game-picker already uses for sixteen games.
    <div className="filter-pills"
         style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
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
      {flag && <span style={{ fontSize: 9.5, color: on.color, fontWeight: 800, fontFamily: NUM_FONT }}>{flag}</span>}
      {hint && <span style={{ fontSize: 9, color: C.text3 }}>{hint}</span>}
    </div>
  )
}

// ── joined segments, for binary/tri-state toggles ───────────────────────────
export function Segmented({ value, options, onChange, label }) {
  const on = useOn()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {label && <FilterLabel>{label}</FilterLabel>}
      <span style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {options.map((o, i) => {
          const active = value === o.key
          const s = active ? on : STATE.off()
          return (
            <button key={o.key} onClick={() => onChange(o.key)} title={o.title} style={{
              padding: '6px 11px', fontSize: 10, cursor: 'pointer', border: 'none',
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
  const on = useOn()
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: '4px 10px', fontSize: 10.5, borderRadius: 999, width,
        border: `1px solid ${value ? on.borderColor : C.border}`,
        background: 'transparent', color: C.text, fontWeight: 600, outline: 'none',
      }}
    />
  )
}

// ── what's active, and the way back out ─────────────────────────────────────
// filters: [{ key, label, onClear }]. Two variants:
//   chips (default) — removable chips, for 2+ active filters
//   sentence        — Runs' undoable sentence, best for exactly one:
//                     "Showing LHB only — 101 of 269 · show everyone"
export function ActiveFilters({ filters, shown, total, variant = 'chips', onClearAll }) {
  const on = useOn()
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
          // 2026-09-13: was padding:0 — a text-only link with zero hit area.
          background: 'transparent', border: 'none', padding: '5px 0', cursor: 'pointer',
          color: on.color, fontSize: 10, fontWeight: 700, textDecoration: 'underline',
        }}>show everyone</button>
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      {live.map((f) => (
        <button key={f.key} onClick={f.onClear} title="remove this filter" style={{
          padding: '5px 10px', fontSize: 9.5, borderRadius: 999, cursor: 'pointer',
          border: `1px solid ${on.borderColor}`,
          background: alpha(on.color, 0.14), color: on.color, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>{f.label} ✕</button>
      ))}
      {live.length > 1 && onClearAll && (
        <button onClick={onClearAll} style={{
          // 2026-09-13: no padding at all — added a real hit area.
          background: 'transparent', border: 'none', padding: '5px 4px', cursor: 'pointer',
          color: C.text3, fontSize: 9.5, fontWeight: 700, textDecoration: 'underline',
        }}>clear all</button>
      )}
    </span>
  )
}

// ── the row that hosts a filter set: trigger + active chips + slot ──────────
export function FilterBar({ children }) {
  return (
    <div className="filter-bar"
         style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

// ── THE ANGLE ROW, ALL THREE PRODUCTS (2026-09-27, board filters plan) ─────
// MOONSHOT's one-tap Angle chips as one component: each product passes its
// own defs ({ key, label, title, test(row) }), the pool the counts come from,
// and its accent. One sideways-scrolling row (no wrap), 44px taps around a
// 30px pill, the count beside each label, tap again to clear.
// hideEmpty (2026-09-28, LAMP): a chip that matches nobody isn't drawn -- "Soft
// opponent 0" before the league's tables exist read as a live finding. A chip
// that is ON always shows, so it can be switched off.
export function AngleRow({ defs, pool, value, onChange, accent: accentProp, className = 'angle-row', hideEmpty = false }) {
  const ctxAccent = useAccent()
  const accent = accentProp || ctxAccent
  if (hideEmpty && !defs.some((d) => value === d.key || pool.some(d.test))) return null
  return (
    <div className={className} style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2, marginTop: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>ANGLE</span>
      {defs.map((d) => {
        const n = pool.filter(d.test).length
        const on = value === d.key
        if (hideEmpty && n === 0 && !on) return null
        return (
          <button key={d.key} type="button" title={d.title} onClick={() => onChange(on ? null : d.key)} aria-pressed={on}
            style={{ flexShrink: 0, minHeight: 44, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 999, whiteSpace: 'nowrap',
              border: `1px solid ${on ? accent : C.border}`, background: on ? alpha(accent, 0.14) : 'transparent', color: on ? accent : C.text2,
              font: `700 11px/1 ${NUM_FONT}` }}>
              {d.label} <span style={{ color: on ? accent : C.text3 }}>{n}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
