'use client'
import { useSport } from '../../lib/sport'
import { onBar } from '../../lib/routes'
import { useState } from 'react'
import { TYPE } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { useSportTheme, SportTheme } from '../SportTheme'

// THE GUIDE'S PIECES, SHARED (2026-09-29, Donovan: "all pages take from MLB
// components and make them fit their sports, like even the guide page").
// Moved verbatim out of components/tabs/Guide.js (MOONSHOT's "rewritten
// short" Guide, 2026-08-09): the accordion Section, P, Note, the one-line
// Term and Stat rows, and the numbered START HERE path. TUDDY and LAMP now
// render their own words through them. Colours come from the sport theme
// (components/SportTheme.js); MOONSHOT has none set, so its orange and its
// markup are unchanged.

export { SportTheme as GuideTheme }

export function Section({ title, emoji, children, defaultOpen = false }) {
  const { C } = useSportTheme()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: TYPE.title, fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          {emoji && <span style={{ fontSize: 16 }}>{emoji}</span>}
          {title}
        </span>
        <span style={{ color: C.text3, fontSize: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

export function P({ children }) {
  const { C } = useSportTheme()
  return <p style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.65, marginBottom: 10 }}>{children}</p>
}

export function Note({ children, color = null }) {
  const { C, accent } = useSportTheme()
  const col = color || accent
  return (
    <div style={{ background: `${col}14`, border: `1px solid ${col}33`, borderRadius: 8, padding: '9px 12px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.55, marginBottom: 12 }}>
      {children}
    </div>
  )
}

// One line per term. The old version carried an optional example line under
// every row; it doubled the height of the glossary and the examples were
// mostly restatements, so the definition has to do the whole job now.
export function Term({ icon, term, def, tab, go }) {
  const { C, accent } = useSportTheme()
  const sport = useSport()
  const clickable = !!(tab && go)
  // WHERE IT LIVES (2026-10-04 user review #10: the Guide named pages that
  // aren't on the bottom bar, with nothing saying they're under More).
  const where = tab ? (onBar(sport, tab) ? 'on the bar' : 'under More') : null
  return (
    <div
      onClick={clickable ? () => go(tab) : undefined}
      className={clickable ? 'tap-row' : undefined}
      title={clickable ? `Open the ${term} tab` : undefined}
      style={{
        display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}`,
        cursor: clickable ? 'pointer' : 'default',
      }}>
      <div style={{ width: 24, flexShrink: 0, fontSize: 14, textAlign: 'center', lineHeight: '18px' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: TYPE.name, fontWeight: 800, color: clickable ? accent : C.text }}>{term}</span>
        {clickable && <span style={{ color: accent, fontSize: 11, fontWeight: 900 }}> →</span>}
        {where && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: C.text3, whiteSpace: 'nowrap' }}>· {where}</span>}
        <span style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.55 }}> — {def}</span>
      </div>
    </div>
  )
}

export function Stat({ stat, def, good }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: TYPE.label, fontWeight: 800, color: accent, fontFamily: NUM_FONT, width: 74, flexShrink: 0 }}>{stat}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: TYPE.body, color: C.text2, lineHeight: 1.55 }}>
        {def}
        {good && <span style={{ color: C.green, fontFamily: NUM_FONT }}> · {good}</span>}
      </span>
    </div>
  )
}

// THE NUMBERED PATH. First, second, third -- in order, with the tab named and
// the one thing to read on it. Each step with a `tab` is a real button onto it.
export function StartHere({ steps, heading, footer, onNavigate }) {
  const { C, NUM_FONT, accent, themed } = useSportTheme()
  return (
    <div style={{
      background: `linear-gradient(155deg, ${themed ? alpha(accent, 0.11) : 'rgba(249,115,22,.11)'}, ${C.bg2} 60%)`,
      border: `1px solid ${accent}55`, borderRadius: 14,
      padding: '16px 18px', marginBottom: 14,
    }}>
      <div style={{ fontSize: TYPE.label, fontWeight: 900, color: accent, letterSpacing: '.1em', fontFamily: NUM_FONT, marginBottom: 3 }}>
        ▶ START HERE
      </div>
      <div style={{ fontSize: TYPE.title, fontWeight: 900, marginBottom: 10 }}>
        {heading}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {steps.map((s) => (
          <div key={s.n}
            onClick={s.tab && onNavigate ? () => onNavigate(s.tab) : undefined}
            className={s.tab && onNavigate ? 'tap-row' : undefined}
            title={s.tab && onNavigate ? 'Take me there' : undefined}
            style={{
              display: 'flex', gap: 11, alignItems: 'flex-start',
              cursor: s.tab && onNavigate ? 'pointer' : 'default',
              borderRadius: 9, padding: s.tab && onNavigate ? '3px 5px' : 0,
              margin: s.tab && onNavigate ? '-3px -5px' : 0,
            }}>
            <span style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
              border: `1px solid ${accent}77`, background: `${accent}18`,
              color: accent, fontFamily: NUM_FONT, fontWeight: 900, fontSize: TYPE.label,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{s.n}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: TYPE.name, fontWeight: 800, color: C.text, lineHeight: 1.4 }}>
                {s.title}
                {s.tab && onNavigate && <span style={{ color: accent, fontWeight: 900 }}> →</span>}
              </div>
              <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.6, marginTop: 2 }}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: TYPE.body, color: C.text3, lineHeight: 1.6, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${accent}33` }}>
        {footer}
      </div>
    </div>
  )
}

/** The page's opening: MOONSHOT's plain title and its one paragraph. */
export function GuideTitle({ title = 'Guide', children }) {
  const { C } = useSportTheme()
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: TYPE.title, fontWeight: 900, color: C.text, marginBottom: 6 }}>{title}</div>
      <P>{children}</P>
    </div>
  )
}

// THE PLAYBOOK, FROM THE GUIDE (2026-09-30, BATCH-PLAYBOOK P1). The Guide
// says what each page is; the Playbook (/playbook) walks one pick through
// them in order. One line under every product's Guide title.
export function PlaybookLink({ market, label }) {
  const { C } = useSportTheme()
  return (
    <a href={`/playbook/${market}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, margin: '-6px 0 10px', color: C.text, fontSize: TYPE.body, fontWeight: 800, textDecoration: 'none' }}>
      <span aria-hidden="true" style={{ marginRight: 6 }}>📘</span>New here? {label} — the Playbook, step by step →
    </a>
  )
}
