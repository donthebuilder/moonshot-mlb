'use client'
// THE ON-CANVAS DOCK (BATCH-3D-V2 step 0, lifted out of SprayField.js). The
// top-left panel every stadium view carries: SHOWING n of N, the filters that
// are on as chips with an ✕, CLEAR ALL, a legend slot -- and, new, a `stats`
// line of big numbers for the sports that want them on screen (LAMP, TUDDY).
//
// It REPORTS, it does not duplicate: every control still lives in the rows
// above the chart; this shows what is on and offers the one unambiguous action,
// clear it. MOONSHOT's markup moved here unchanged (check-3d-parity).
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../../lib/theme'

/**
 * chips: [[key, text, clear], ...]  stats: [{ k, v, sub? }] or null
 * accentSoft: the chip fill (MOONSHOT's orange at 10% by default)
 */
export default function StadiumDock({
  open, onToggle, now, all, chips = [], onClearAll, emptyText, legend = null, stats = null,
  theme: C = MLB_C, numFont = MLB_NUM, accent = MLB_C.orange, accentSoft = 'rgba(249,115,22,.10)', maxWidth = '58%',
}) {
  return (
    <div style={{
      position: 'absolute', top: 10, left: 10, zIndex: 3, maxWidth,
      background: C.scrim, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: open ? '7px 9px' : '4px 8px',
      backdropFilter: 'blur(6px)', pointerEvents: 'auto',
    }}>
      <button
        onClick={onToggle}
        title={open ? 'Collapse' : 'Show what is on this chart'}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, width: '100%',
          background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
          fontFamily: numFont, fontSize: 9.5, fontWeight: 900,
          letterSpacing: '.07em', color: C.text2,
        }}>
        <span style={{ color: C.text3 }}>{open ? '▾' : '▸'}</span>
        <span>SHOWING</span>
        <span style={{ color: chips.length ? accent : C.text2 }}>
          {now}
        </span>
        <span style={{ color: C.text3, fontWeight: 700 }}>of {all}</span>
        {!open && chips.length > 0 && (
          <span style={{
            color: accent, fontWeight: 900, fontSize: 8.5,
            border: `1px solid ${accent}66`, borderRadius: 999, padding: '0 5px',
          }}>{chips.length}</span>
        )}
      </button>

      {/* THE STATS LINE (new, step 0): one line of big numbers off the
          filtered list, so the numbers stay on screen with the picture. */}
      {stats && stats.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontFamily: numFont }}>
          {stats.map((s) => (
            <span key={s.k} title={s.title || undefined} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.08em', color: C.text3 }}>{s.k}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: s.tone || C.text, fontVariantNumeric: 'tabular-nums' }}>{s.v ?? '—'}</span>
              {s.sub ? <span style={{ fontSize: 8.5, fontWeight: 700, color: C.text3 }}>{s.sub}</span> : null}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 6 }}>
          {chips.length === 0 ? (
            <div style={{ fontSize: 9, color: C.text3, fontFamily: numFont, lineHeight: 1.5 }}>
              {emptyText}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {chips.map(([k, txt, clear]) => (
                  <button key={k} onClick={clear} title={`Turn off: ${txt}`}
                    style={{
                      fontSize: 9, fontFamily: numFont, fontWeight: 700,
                      borderRadius: 999, padding: '1px 7px', cursor: 'pointer',
                      border: `1px solid ${accent}55`, color: accent,
                      background: accentSoft, whiteSpace: 'nowrap',
                    }}>{txt} ✕</button>
                ))}
              </div>
              <button
                onClick={onClearAll}
                style={{
                  marginTop: 6, fontSize: 8.5, fontFamily: numFont, fontWeight: 900,
                  letterSpacing: '.07em', background: 'transparent', border: 0,
                  padding: 0, cursor: 'pointer', color: C.text3,
                }}>CLEAR ALL</button>
            </>
          )}
          {legend}
        </div>
      )}
    </div>
  )
}
