'use client'
import { useRef, useState } from 'react'
import { useSportTheme } from './SportTheme'

// ══ THE SITE'S FIND / FILTER ROW, ONE COMPONENT (2026-10-21, Donovan: "we need to build upon our site filters and get a
// harness on that and build that component as well so that way it's shared across everything") ════════════════════════
// MOONSHOT's top row on the Props page (components/Controls.js): one pill search box and a ⚙ Filter button; the
// filters open under it, the button lighting and counting while any is in force. It was components/props/PropFind.js,
// wired to the Props page's three selects; now any page passes its own:
//   filters  [{ key, label, value, onChange, options: [{ key, label }], all: 'All teams' | null }]   a dropdown each;
//            `all` adds the "everything" choice (value '') and the filter counts as on when value !== ''; without
//            `all`, it is on when value !== options[0].key
//   toggles  [{ key, label, on, onChange, title }]   an on/off pill each
// It holds no data and decides nothing: the page owns the values and does the filtering.
const FIND_CSS = `
  .pf-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
  .pf-row .pf-search-wrap { flex: 1 1 0; min-width: 0; position: relative; }
  .pf-row .pf-search { min-height: 44px; }
  .pf-row .pf-search::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
  .pf-row .pf-btn { flex: none; display: inline-flex; }
  .pf-row .pf-more { display: none; flex: 1 1 100%; flex-wrap: wrap; gap: 8px; }
  .pf-row.open .pf-more { display: flex; }
  .pf-row .pf-more > * { flex: 1 1 120px; }
  .pf-row .pf-select { min-height: 44px; }
`

const isOn = (f) => (f.all != null ? f.value !== '' && f.value != null : f.value !== (f.options?.[0]?.key ?? ''))

export default function FindBar({
  query, setQuery, placeholder = 'Search player or team…', searchLabel = 'Search by player or team',
  filters = [], toggles = [], C: Cin = null, NUM_FONT: NFin = null, accent: accentIn = null, style = null,
}) {
  const theme = useSportTheme()
  const C = Cin || theme.C
  const NUM_FONT = NFin || theme.NUM_FONT
  const accent = accentIn || theme.accent
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const wash = (p) => `color-mix(in srgb, ${accent} ${p}%, transparent)`
  const shownFilters = filters.filter((f) => (f.options || []).length > 0)
  const active = shownFilters.filter(isOn).length + toggles.filter((t) => t.on).length
  const lit = active > 0 || open
  const words = [...shownFilters.map((f) => f.label), ...toggles.map((t) => t.label)].join(', ').toLowerCase()
  const sel = (on) => ({
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    background: on ? `linear-gradient(135deg, ${wash(16)}, ${wash(5)})` : C.bg3,
    border: `1px solid ${on ? wash(55) : C.border2}`,
    color: on ? accent : C.text, fontWeight: on ? 800 : 500,
    borderRadius: 999, padding: '9px 30px 9px 14px', fontSize: 12, fontFamily: NUM_FONT,
    outline: 'none', width: '100%', minWidth: 0, boxSizing: 'border-box', cursor: 'pointer',
  })
  const caret = (on) => ({ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: on ? accent : C.text3, pointerEvents: 'none' })
  return (
    <div className={`pf-row${open ? ' open' : ''}`} style={style || undefined}>
      <div className="pf-search-wrap">
        <span aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.55, pointerEvents: 'none' }}>🔍</span>
        <input
          ref={inputRef} type="search" className="pf-search" aria-label={searchLabel}
          placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)}
          style={{
            background: C.bg3, border: `1px solid ${query ? wash(45) : C.border2}`, color: C.text,
            borderRadius: 999, padding: '9px 44px 9px 34px', fontSize: 12, outline: 'none',
            width: '100%', minWidth: 0, boxSizing: 'border-box',
          }}
        />
        {query ? (
          <button type="button" aria-label="Clear search" title="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus() }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, background: 'transparent', border: 'none', color: accent, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0 }}>✕</button>
        ) : null}
      </div>
      {(shownFilters.length > 0 || toggles.length > 0) && (
        <button type="button" className="pf-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          aria-label={active ? `Filter: ${active} active` : `Filter by ${words}`}
          style={{
            alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
            fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${lit ? wash(55) : C.border2}`, background: lit ? wash(14) : C.bg3, color: lit ? accent : C.text2,
          }}>
          <span aria-hidden="true">⚙</span>Filter{active ? ` · ${active}` : ''}
        </button>
      )}
      <div className="pf-more">
        {shownFilters.map((f) => (
          <div key={f.key} style={{ position: 'relative', minWidth: 0 }}>
            <select className="pf-select" value={f.value} onChange={(e) => f.onChange(e.target.value)} aria-label={f.aria || `Filter by ${String(f.label).toLowerCase()}`} style={sel(isOn(f))}>
              {f.all != null ? <option value="">{f.all}</option> : null}
              {f.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <span aria-hidden="true" style={caret(isOn(f))}>▾</span>
          </div>
        ))}
        {toggles.map((t) => (
          <button key={t.key} type="button" onClick={() => t.onChange(!t.on)} aria-pressed={t.on} title={t.title}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontFamily: NUM_FONT, fontSize: 12, fontWeight: t.on ? 800 : 600,
              border: `1px solid ${t.on ? wash(55) : C.border2}`, background: t.on ? `linear-gradient(135deg, ${wash(16)}, ${wash(5)})` : C.bg3, color: t.on ? accent : C.text }}>
            {t.label}
          </button>
        ))}
      </div>
      <style>{FIND_CSS}</style>
    </div>
  )
}
