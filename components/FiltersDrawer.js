'use client'
import { flatChip, CHIP_MARK } from '../lib/chips'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { STATE, alpha } from '../lib/scales'
import LedgerChip from './LedgerChip'
import WatchChip from './WatchChip'
import { PositionRow } from './Filters'
import ColumnSetSwitch from './ColumnSetSwitch'
import { useIsPhone } from './MobileFold'

// ══ THE BOARD FILTERS DRAWER, ONE FOR ALL THREE PRODUCTS (2026-09-28) ═══════
// Donovan: "on the boards we can toggle teams, games, multi filters, all type
// filters -- use MLB as the base again, USE THE COMPONENTS." This is the shell
// of MOONSHOT's own drawer (components/BoardFilters.js), lifted out verbatim:
// the compact "▤ Filters" trigger with its count, the fixed panel, the "N of
// M · Reset all · Done" footer, the "N of M in the pool" pill and the
// always-visible removable chips. Each board passes its own sections as
// children and its own accent; MOONSHOT renders through it unchanged (accent
// defaults to its orange and ink). TUDDY and LAMP draw through the same file.
//
//   active / activeCount   is anything narrowing, and how many things
//   activeFilters          [{ key, label, onRemove }] -- the removable chips
//   reset                  clears every filter the board owns
//   shown / total          rows that clear vs the pool
//   poolTitle              the pill's tooltip (what "the pool" is here)
//   emptyNote              said inside the panel when nothing clears

export const drawerLabel = () => ({ fontSize: 10, color: C.text2, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 })

// UNIVERSAL FILTER RECIPE (2026-08-23): a filter is STATE, drawn in the theme
// accent through STATE.on()/off(), never a data hue.
export const drawerChip = (on) => {
  const s = on ? STATE.on() : STATE.off()
  return {
    ...CHIP_MARK,   // the 44px thumb target (globals.css) now that the chip is not a 999px pill
    padding: '4px 11px', fontSize: 11, fontWeight: s.fontWeight, borderRadius: 6,
    cursor: 'pointer', fontFamily: NUM_FONT,
    border: `1px solid ${s.borderColor}`,
    background: on ? alpha(s.color, 0.14) : 'transparent',
    color: s.color,
  }
}

export function useOutsideClose(open, setOpen) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen])
  return ref
}

/** One labelled block inside the panel (MOONSHOT's section spacing). */
export function DrawerSection({ label, hint = null, children, style = null }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      {label ? <div style={drawerLabel()}>{label}</div> : null}
      {hint ? <div style={{ fontSize: 9, color: C.text3, marginTop: 2, lineHeight: 1.45 }}>{hint}</div> : null}
      {children}
    </div>
  )
}

export default function FiltersDrawer({
  active, activeCount = 0, activeFilters = [], reset, shown, total, children,
  accent = C.orange, accentInk = '#1a0f00',
  poolTitle = "Rows on tonight's board that clear the filters.",
  emptyNote = null,
  // PHONE, ONE CONTROL ROW (2026-10-06, the Rankings merge): `compact` makes the trigger a 44px
  // button, drops the pool pill (the panel's footer still says "N of M") and puts `beside` (e.g. the
  // market chips) in the same row; `lead` is what the panel says before the filter sections.
  // Every other caller leaves all three alone and draws exactly what it drew before.
  compact = false, beside = null, lead = null,
  // THE LEDGER CHIP (2026-10-07): a sport key puts "Ledger 7/18" in this row, beside the trigger (the Rankings pages
  // pass it; every other board leaves it off). It lives in the row that is already here, so no page gets taller.
  ledger = null,
  // THE SAVE-A-PICTURE BUTTON (components/card/ShareCardButton.js): MOONSHOT's phone Rankings put it after the Ledger / Watchlist
  // chips, in this same row, so it is visible without opening the sheet. Every other caller leaves it null and draws exactly what it drew before.
  share = null,
  // THE POSITION FILTER (2026-10-10, lib/usePositionFilter.js `control`): on a desktop its pills sit inline in this same
  // row (no extra line); inside a compact (phone) sheet they are the first section of the panel. Null = no row.
  positions = null,
  // THE COLUMN-SET SWITCH (Wave 4, lib/columnViews.js): { set, onChange } puts Short list / What I read / All in the panel,
  // first section. Null (MOONSHOT, every board without sets) draws exactly what it drew before.
  columnSet = null,
}) {
  const [open, setOpen] = useState(false)
  const wrap = useOutsideClose(open, setOpen)
  const phone = useIsPhone(560)
  const chip = drawerChip

  const chipsEl = activeFilters.length > 0 && (
          <div className="chip-row" style={{ display: 'flex', gap: 5, alignItems: 'center', flex: 1, minWidth: 0 }}>
            {activeFilters.map((f) => (
              <button key={f.key} onClick={f.onRemove} title="Remove this filter"
                style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {f.label} <span style={{ opacity: .7 }}>✕</span>
              </button>
            ))}
            <button onClick={reset} style={{ ...chip(false), border: 'none', textDecoration: 'underline', color: C.text3 }}>Reset</button>
          </div>
  )
  return (
    <div className={compact ? 'board-filters board-filters-compact' : 'board-filters'} style={{ marginBottom: compact ? 8 : 14 }}>
      {/* ── THE TRIGGER, ALWAYS COMPACT ─────────────────────────────────────
          One button + a count, same size on a phone as on a desktop monitor —
          "avoid a giant filter bar" applies to both, not just mobile. The
          panel below is what used to be permanently on screen. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div ref={wrap} style={{ position: 'relative', ...(compact ? { flex: '0 0 auto' } : null) }}>
          <button
            type="button"
            className="tap-box"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            // the site's one chip (lib/chips.js flatChip, the oval; 10-22); the 44px tap is .tap-box's
            style={flatChip(open || active, accent, C, NUM_FONT)}
          >
            ▤ Filters
            {activeCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
                background: accent, color: accentInk, fontSize: 10, fontWeight: 900,
              }}>{activeCount}</span>
            )}
          </button>

          {open && phone && (
            // PHONE (2026-10-29, Donovan: hard to get out of): a tap on the dimmed page closes the sheet, and Done / ✕ stay pinned
            // at the top and the footer at the bottom while the sections scroll between them.
            <div onClick={() => setOpen(false)} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 89, background: 'rgba(0,0,0,.5)' }} />
          )}
          {open && (
            <div style={{
              // Fixed to the viewport, pinned to both edges below ~560px —
              // exactly PaletteButton's dual-mode panel, same reasoning: a
              // popover anchored to a button that can sit anywhere on a
              // 390px screen has nowhere safe to overflow.
              position: 'fixed', zIndex: 90,
              top: 'calc(env(safe-area-inset-top, 0px) + 108px)',
              left: 8, right: 8, width: 'auto', maxWidth: 520, margin: '0 auto',
              maxHeight: phone ? 'min(72vh, calc(100dvh - 200px))' : '72vh', overflowY: 'auto',
              background: 'rgba(17,17,19,0.98)', backdropFilter: 'blur(14px)',
              border: `1px solid ${C.border2}`, borderRadius: 12, padding: 14,
              boxShadow: '0 20px 60px rgba(0,0,0,.5)',
            }}>
              {phone && (
                <div style={{ position: 'sticky', top: -14, zIndex: 2, margin: '-14px -14px 10px', padding: '8px 10px 8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgb(17,17,19)', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ ...drawerLabel(), fontSize: 11 }}>Filters{activeCount > 0 ? ` · ${activeCount}` : ''}</span>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close filters" style={{ ...chip(true), minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>Done ✕</button>
                </div>
              )}
              {compact && positions && (
                <DrawerSection label="Position" hint="Pick several to see any of them. Ranks stay the board's overall ranks.">
                  <PositionRow control={positions} accent={accent} wrap label="" />
                </DrawerSection>
              )}
              {columnSet && (
                <DrawerSection label="Columns" hint="Short list is the key columns; All is every column the table has. Kept in the address, so a shared link opens the same.">
                  <ColumnSetSwitch set={columnSet.set} onChange={columnSet.onChange} accent={accent} />
                </DrawerSection>
              )}
              {lead}
              {children}

              {shown === 0 && emptyNote ? (
                <div style={{ fontSize: 10, color: accent, marginTop: 9 }}>{emptyNote}</div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, ...(phone ? { position: 'sticky', bottom: -14, background: 'rgb(17,17,19)', margin: '12px -14px -14px', padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))' } : null) }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: shown < total ? accent : C.text3, fontFamily: NUM_FONT }}>{shown} of {total}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {active && <button onClick={reset} style={{ ...chip(false), border: `1px dashed ${C.border2}`, ...(phone ? { minHeight: 44 } : null) }}>Reset all</button>}
                  <button onClick={() => setOpen(false)} style={{ ...chip(true), ...(phone ? { minHeight: 44, minWidth: 64 } : null) }}>Done</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {ledger && (compact ? <><LedgerChip sport={ledger} /><WatchChip sport={ledger} /></> : <span className="ledger-chip-wide" style={{ display: 'inline-flex', gap: 6 }}><LedgerChip sport={ledger} /><WatchChip sport={ledger} /></span>)}

        {share}

        {!compact && positions && <PositionRow control={positions} accent={accent} inline />}

        {compact && beside ? <div style={{ flex: '1 1 100%', minWidth: 0 }}>{beside}</div> : null}

        {/* #58: the pool pill says which count it is, so it can't be read as
            the board's own ranked badge beside it. */}
        {!compact && <span
          title={poolTitle}
          style={{ fontSize: 11, fontWeight: 800, color: shown < total ? accent : C.text3, fontFamily: NUM_FONT, border: `1px solid ${C.border}`, borderRadius: 999, padding: '3px 11px' }}>
          {shown} of {total} <span style={{ color: C.text3, fontWeight: 700 }}>in the pool</span>
        </span>}

        {/* ── ALWAYS-VISIBLE, REMOVABLE CHIPS ─────────────────────────────
            A filter you forgot you set is a worse trap than a filter you have
            to scroll past, so the chips live outside the panel. */}
        {!compact && chipsEl}
      </div>
      {compact && chipsEl && <div style={{ marginTop: 6 }}>{chipsEl}</div>}
    </div>
  )
}
