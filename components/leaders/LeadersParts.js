'use client'
import { TYPE } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { useSportTheme } from '../SportTheme'

// MOONSHOT'S LEADERS PAGE, IN PARTS (2026-09-29, Donovan: "make sure the
// leaders page for nfl and nhl look like mlb"). The pieces of
// components/tabs/Leaders.js that are layout rather than baseball, lifted out
// so TUDDY's and LAMP's Leaders are built from them: the accent-ruled intro,
// the filter bar (labelled chip groups + search), and the league top-10 card.
// They read the sport's theme from SportTheme; with no provider (MOONSHOT)
// they draw exactly what Leaders.js drew inline.

/** The accent-ruled paragraph under the page title. */
export function LeadersIntro({ children }) {
  const { C, accent } = useSportTheme()
  return (
    <div style={{
      fontSize: TYPE.body, color: C.text3, lineHeight: 1.6, margin: '6px 0 12px',
      borderLeft: `2px solid ${accent}`, paddingLeft: 10, maxWidth: 700,
    }}>{children}</div>
  )
}

/** One chip's style, MOONSHOT's Leaders chip. */
export function useLeaderChip() {
  const { C, NUM_FONT, accent } = useSportTheme()
  return (on) => ({
    padding: '3px 9px', fontSize: TYPE.body, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
    fontFamily: NUM_FONT,
    border: `1px solid ${on ? accent : C.border}`,
    background: on ? alpha(accent, 0.12) : 'transparent',
    color: on ? accent : C.text3,
  })
}

/**
 * The filter bar. groups: [{ label, value, onChange, options: [[key, text]] }].
 * search: { value, onChange, placeholder } | null.
 */
export function LeadersFilterBar({ groups = [], search = null }) {
  const { C, NUM_FONT } = useSportTheme()
  const chip = useLeaderChip()
  const lbl = {
    fontSize: TYPE.label, color: C.text3, textTransform: 'uppercase',
    letterSpacing: '.09em', fontWeight: 800,
  }
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12,
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
    }}>
      {groups.map((g) => (
        <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: g.wrap ? 'wrap' : undefined }}>
          <span style={lbl}>{g.label}</span>
          {g.options.map(([k, l]) => (
            <button key={k} onClick={() => g.onChange(k)} style={chip(g.value === k)}>{l}</button>
          ))}
        </div>
      ))}
      {search && (
        <input
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder={search.placeholder}
          style={{
            flex: 1, minWidth: 150, background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: '5px 10px', fontSize: TYPE.body, color: C.text,
            outline: 'none', fontFamily: NUM_FONT,
          }}
        />
      )}
    </div>
  )
}

/** "Every leader below is ..." -- the line over the tile grid. */
export function LeadersLead({ children }) {
  const { C } = useSportTheme()
  return <div style={{ fontSize: TYPE.body, color: C.text3, margin: '0 0 6px' }}>{children}</div>
}

/**
 * A league top-10 card. rows: [{ id, name, team, value }]. open(row) returns a
 * click handler or undefined (MOONSHOT: only men on tonight's slate open);
 * mark(row) is the suffix for a row that opens (MOONSHOT's 🤖).
 */
export function LeagueTopCard({ title, unit = '', rows, open, mark }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  if (!rows?.length) return null
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`,
      borderRadius: 11, padding: '8px 12px', minWidth: 0,
    }}>
      <div style={{
        fontSize: TYPE.label, color: C.text3, textTransform: 'uppercase',
        letterSpacing: '.09em', fontWeight: 800, marginBottom: 5,
      }}>{title}</div>
      {rows.map((r, i) => {
        const onClick = open ? open(r) : undefined
        const hot = Boolean(onClick)
        return (
          <div key={r.id}
            onClick={onClick}
            title={`${r.name} — ${r.team} · ${r.value} ${unit}${hot && mark ? ' · on tonight’s slate — click to open his card' : hot ? ' · open his card' : ''}`}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6, padding: '1.5px 0',
              cursor: hot ? 'pointer' : 'default',
            }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3, width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{
              fontSize: TYPE.name, fontWeight: hot ? 800 : 600,
              color: hot ? C.text : C.text2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
            }}>{r.name}{hot && mark ? ` ${mark}` : ''}</span>
            <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: TYPE.body, fontWeight: 900, color: hot ? accent : C.text2, flexShrink: 0 }}>
              {r.display ?? r.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** The titled box a group of LeagueTopCards sits in. */
export function LeadersSection({ title, lead, tint, children }) {
  const { C } = useSportTheme()
  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, ${tint})`,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '8px 12px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: TYPE.title, fontWeight: 900 }}>{title}</span>
        <span style={{ fontSize: TYPE.body, color: C.text3 }}>{lead}</span>
      </div>
      {children}
    </div>
  )
}
