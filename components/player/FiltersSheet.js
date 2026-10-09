'use client'
import { useState } from 'react'
import { useSportTheme } from '../SportTheme'
import { alpha } from '../../lib/scales'

// ONE 'Filters' BUTTON (2026-10-08). The five rows of big situation pills live in a sheet that scrolls on a
// phone (44px targets, safe-area padding); what is active shows as small removable chips beside the button.
// groups: [{ key, label, value, defaultValue, onChange(v), options: [{ value, label, title? }], hint? }]
export default function FiltersSheet({ groups, note = null, onReset = null, summary = null, style }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const [open, setOpen] = useState(false)
  const active = groups.map((g) => {
    if (g.value === g.defaultValue) return null
    const o = g.options.find((x) => x.value === g.value)
    return { key: g.key, label: o?.label || String(g.value), clear: () => g.onChange(g.defaultValue) }
  }).filter(Boolean)
  const pill = (on) => ({
    minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: NUM_FONT,
    border: `1px solid ${on ? accent : C.border}`, background: on ? alpha(accent, 0.16) : 'transparent', color: on ? accent : C.text2,
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', ...style }}>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        style={{ ...pill(active.length > 0), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        ▤ Filters{active.length ? ` · ${active.length}` : ''}
      </button>
      {active.map((a) => (
        <button key={a.key} type="button" onClick={a.clear} aria-label={`Remove filter ${a.label}`} title="Remove this filter"
          style={{ minHeight: 44, padding: '0 6px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: NUM_FONT }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            border: `1px solid ${alpha(accent, 0.6)}`, background: alpha(accent, 0.14), color: accent }}>
            {a.label} <span style={{ opacity: 0.7 }}>✕</span>
          </span>
        </button>
      ))}
      {summary}
      {open && (
        <div role="dialog" aria-label="Filters" onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 420, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
              background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: '16px 16px 0 0', padding: '14px 16px calc(16px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, position: 'sticky', top: -14, background: C.bg2, zIndex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: NUM_FONT, color: C.text }}>Filters</span>
              <span style={{ display: 'flex', gap: 8 }}>
                {active.length > 0 && onReset && <button type="button" onClick={onReset} style={{ ...pill(false), border: 'none', textDecoration: 'underline', color: C.text3 }}>Reset</button>}
                <button type="button" onClick={() => setOpen(false)} style={pill(true)}>Done</button>
              </span>
            </div>
            {groups.map((g) => (
              <div key={g.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: C.text2, fontFamily: NUM_FONT, marginBottom: 4 }}>{g.label}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {g.options.map((o) => (
                    <button key={String(o.value)} type="button" title={o.title} aria-pressed={g.value === o.value} onClick={() => g.onChange(o.value)} style={pill(g.value === o.value)}>{o.label}</button>
                  ))}
                </div>
                {g.hint ? <div style={{ fontSize: 12, color: C.text3, marginTop: 4, lineHeight: 1.4 }}>{g.hint}</div> : null}
              </div>
            ))}
            {note ? <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.4 }}>{note}</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}
