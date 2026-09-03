'use client'
import { C, NUM_FONT } from '../lib/theme'

export function btnStyle(color, active = false) {
  return {
    border: `1px solid ${active ? color + '99' : C.border}`,
    background: active ? `${color}22` : 'rgba(255,255,255,.035)',
    color: active ? color : C.text2,
    borderRadius: 999,
    padding: '7px 11px',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

export function chipStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: `1px solid ${color}55`,
    background: `${color}16`,
    color,
    borderRadius: 999,
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  }
}

export function Chip({ color = C.text2, children, style }) {
  return <span style={{ ...chipStyle(color), ...style }}>{children}</span>
}

export function selectStyle() {
  return {
    background: C.bg3,
    border: `1px solid ${C.border2}`,
    color: C.text,
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  }
}

export function inputStyle() {
  return {
    background: C.bg3,
    border: `1px solid ${C.border2}`,
    color: C.text,
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  }
}

export function PanelTitle({ title, sub, right }) {
  return (
    // .panel-title: every tab's header. The `right` slot is usually three or
    // four mode buttons, which on a phone wrap into a second and third row of
    // pills stacked under the h2. MobileCSS turns that slot into one
    // sideways-scrolling row instead.
    <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'end', flexWrap: 'wrap', margin: '4px 0 14px' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: 24, margin: '0 0 3px', fontWeight: 900, letterSpacing: '-.03em' }}>{title}</h2>
        {sub && <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Grid({ children, min = 260, gap = 10, style }) {
  return (
    <div
      className="dash-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
        gap,
        alignItems: 'stretch',
        width: '100%',
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Stack({ children, gap = 10, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, minWidth: 0, width: '100%', ...style }}>
      {children}
    </div>
  )
}

export function Empty({ text }) {
  return (
    <div style={{ padding: 36, textAlign: 'center', background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 18, color: C.text3 }}>
      {text}
    </div>
  )
}

export function Card({ children, color = C.border, onClick, style, title }) {
  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        background: C.bg2,
        border: `1px solid ${color}`,
        borderRadius: 14,
        padding: 12,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color .15s, transform .15s',
        boxSizing: 'border-box',
        minWidth: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── SECTION BAND (2026-08-09) ───────────────────────────────────────────────
// One header treatment for every band on every page. Before this each tab
// hand-rolled its own label row — Pitchers had five, Home five, At the Plate
// three — at 8.5px / 9px / 11px with three different letter-spacings, so
// nothing read as belonging to the same site. A rule running to the edge does
// the work a box used to do without adding another border.
export function Band({ children, note, right, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, marginTop: 2, ...style }}>
      <span style={{
        fontSize: 8.5, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase',
        color: C.text2, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
      }}>{children}</span>
      {note && (
        <span style={{
          fontSize: 9.5, color: C.text3, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{note}</span>
      )}
      <span style={{ flex: 1, height: 1, background: C.border, minWidth: 12 }} />
      {right}
    </div>
  )
}


/**
 * RoleTag — a conviction tier as typography.
 *
 * The dot is the whole icon system. It reads at 9px where an emoji doesn't,
 * renders identically on every platform, inherits the tier colour so the badge
 * is legible in one glance, and — unlike a pictograph — has a predictable
 * width, so a column of these stays aligned. That's the idiom every one of the
 * redesign reference apps uses: restrained mark, colour as the signal,
 * the word doing the work.
 */
export function RoleTag({ label, color = C.text2, title, style, glyph = null }) {
  if (!label || label === '—') return null
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        border: `1px solid ${color}55`, background: `${color}14`, color,
        borderRadius: 6, padding: '2px 7px',
        fontSize: 9.5, fontWeight: 900, letterSpacing: '.06em',
        whiteSpace: 'nowrap', textTransform: 'uppercase',
        fontFamily: NUM_FONT,
        ...style,
      }}
    >
      {glyph
        ? <span style={{ fontSize: 10, lineHeight: 1 }}>{glyph}</span>
        : <span style={{
            width: 5, height: 5, borderRadius: '50%', background: color, flex: '0 0 auto',
          }} />}
      {label}
    </span>
  )
}

// ── THE HELPER LINES, FOLDED (2026-08-23) ───────────────────────────────────
//
// Donovan: "little words here and there throughout the site that just don't
// need to be there — i know they're helpers but it's kinda not helping. make
// smaller or remove them or repurpose better."
//
// He is right about the failure mode, and it is a specific one: a paragraph
// that prints on EVERY visit is read on the first visit and skipped forever
// after, while still costing three lines above the thing you came for. The
// phone copies had already been hidden behind TabExplainer's ❓ pill for
// exactly this reason; the desktop copies never got the same treatment.
//
// So they fold. The label stays visible — one small line, so a first-time
// reader can still find the explanation — and the explanation itself is one
// tap away instead of permanently in the way. Nothing is deleted: every word
// these blocks carried is still on the page for anyone who wants it.
// ── THE DEFAULT CASE STOPPED FOLDING (2026-09-03) ───────────────────────────
//
// Found while splitting the Boards pill row. Every page on this site has a
// one-line answer to "what am I looking at" written for it -- the single most
// direct fix for the most common piece of feedback the product gets -- and all
// nineteen of them were inside a <details> SHUT BY DEFAULT, behind a 9px grey
// summary. On a phone several were also duplicated into a title= tooltip,
// which a phone cannot show at all. The sentence written to stop people
// feeling lost was, on the device where they are lost, unreachable.
//
// The rule now, and it is a rule rather than a list: a CUSTOM label means this
// is a specific aside -- "how this pool was built", "why no combined
// percentage is printed", "how a slot is graded" -- and those still fold,
// because they answer a question you have to have thought of first. The
// DEFAULT label means the text is what the page IS, and that gets printed.
//
// Ten of the nineteen take the default: Live, Slate, At the plate, The record,
// Results depth, the pair builder, the homer ledger, partner watch and both
// halves of Boards.
export function WhatThis({ children, label = null, maxWidth = 720 }) {
  if (!label) {
    return (
      <p className="quiet-note" style={{
        margin: '2px 0 8px', maxWidth,
        fontSize: 11, color: C.text2, lineHeight: 1.6,
      }}>{children}</p>
    )
  }
  return (
    <details className="quiet-note" style={{ margin: '2px 0 8px', maxWidth }}>
      <summary style={{
        fontSize: 9, color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT,
        letterSpacing: '.06em', textTransform: 'uppercase',
      }}>{label}</summary>
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, marginTop: 5 }}>{children}</div>
    </details>
  )
}
