'use client'
import { useSportTheme } from './SportTheme'

// THE COMBINE-FILTERS ROW, SHARED (2026-10-06). Lifted out of
// components/PlayerSplits.js unchanged -- its Sel and the pick-then-clear row of
// ComboFilter -- so TUDDY's per-game filter (components/nfl/NflGameCombo.js) is
// drawn by the same control rather than a look-alike. With no `roomy` prop the
// markup is byte-identical to what PlayerSplits rendered before; the theme
// comes from useSportTheme(), which on MOONSHOT is lib/theme's own C.
//
// `fields`  [{ key, placeholder, options: [{ v, label }] }]
// `values`  { key: selected v | '' }
// `roomy`   44px-tall controls at 13px, for a phone (TUDDY); MOONSHOT omits it.
export function Sel({ value, onChange, options, placeholder, roomy = false, label }) {
  const { C } = useSportTheme()
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label || placeholder}
      style={{
        fontSize: 10.5, fontWeight: 600, padding: '4px 8px', borderRadius: 6,
        background: C.bg2, border: `1px solid ${C.border}`,
        color: value ? C.text : C.text3, cursor: 'pointer',
        ...(roomy ? { fontSize: 13, minHeight: 44, padding: '4px 10px', maxWidth: '100%' } : null),
      }}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  )
}

export default function ComboFilterBar({ fields, values, onChange, onClear, anyOn, roomy = false }) {
  const { C } = useSportTheme()
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
      {fields.map((f) => (
        <Sel key={f.key} value={values[f.key] || ''} onChange={(v) => onChange(f.key, v)}
          placeholder={f.placeholder} options={f.options} roomy={roomy} />
      ))}
      {anyOn && (
        <button
          onClick={onClear}
          style={{ fontSize: 10, fontWeight: 700, color: C.text3, background: 'none',
            border: 'none', cursor: 'pointer', textDecoration: 'underline',
            ...(roomy ? { fontSize: 13, minHeight: 44, minWidth: 44, padding: '0 10px' } : null) }}>
          clear
        </button>
      )}
    </div>
  )
}
