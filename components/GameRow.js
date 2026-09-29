'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'

// ONE GAME, ONE ROW, TAP TO OPEN ITS BOX (2026-09-29, queue batch 8).
// Lifted out of MOONSHOT's components/tabs/Boxes.js GameCard so TUDDY's Games
// page is built from the same row rather than a look-alike: two team lines
// with the score on the right, the status column, the chevron, and the box
// underneath once opened. MOONSHOT passes nothing new and renders exactly as
// before; another sport passes its theme, accent and (optionally) a team
// mark per side.
//
// sides: [{ key: 'away'|'home', label, record, score, mark }]
// status: { text, tone } · sub: small line under the status
// strip: node rendered under the tap row whether open or not (MOONSHOT's
//        stake strip); omitted = no strip row at all.
export default function GameRow({
  id, open, onToggle, sides, winner = null, status, sub = null, strip, children,
  theme = MLB_C, numFont = MLB_NUM, accent = theme.orange, openBg = 'rgba(249,115,22,.03)',
}) {
  const C = theme
  return (
    <div style={{
      border: `1px solid ${open ? `${accent}55` : C.border}`, borderRadius: 12,
      background: open ? openBg : C.bg2, marginBottom: 8, overflow: 'hidden',
    }}>
      <div onClick={() => onToggle(id)} className="tap-row" style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', cursor: 'pointer',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {sides.map((t) => (
            <div key={t.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {t.mark && <span style={{ alignSelf: 'center', display: 'flex', flexShrink: 0 }}>{t.mark}</span>}
              <span style={{
                fontSize: 12.5, fontWeight: winner === t.key ? 900 : 600,
                color: winner && winner !== t.key ? C.text3 : C.text,
                minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.label}</span>
              {t.record && (
                <span style={{ fontFamily: numFont, fontSize: 8.5, color: C.text3 }}>{t.record}</span>
              )}
              <span style={{
                marginLeft: 'auto', fontFamily: numFont, fontSize: 15,
                fontWeight: 900, minWidth: 26, textAlign: 'right',
                color: t.score == null ? C.text3 : winner === t.key ? accent : C.text,
              }}>{t.score ?? '–'}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 78 }}>
          <div style={{ fontFamily: numFont, fontSize: 10, fontWeight: 800, color: status.tone }}>{status.text}</div>
          {sub}
        </div>
        <span style={{ color: C.text3, fontSize: 11, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
      </div>

      {/* Outside the click row so it can wrap on a phone without pushing the
          score column around. */}
      {strip !== undefined && <div style={{ padding: '0 13px 8px' }}>{strip}</div>}

      {open && (
        <div style={{ padding: '0 13px 12px', borderTop: `1px solid ${C.border}` }}>
          {children}
        </div>
      )}
    </div>
  )
}
