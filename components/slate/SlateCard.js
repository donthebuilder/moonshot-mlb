'use client'
import { C, NUM_FONT } from '../../lib/theme'
import { alpha, verdictInk } from '../../lib/scales'
import { Dial } from '../VerdictHero'

// ONE GAME CARD, ANY SPORT (2026-09-28). MOONSHOT's game card
// (components/GameStrip.js, "the same style as the prop cards", 2026-08-23)
// lifted out style for style: the wash by heat, the light bar, the dial, the
// matchup, one meta line, the score once there is one, and up to three pick
// chips. GameStrip builds MOONSHOT's cards and renders them through this, so
// its strip is unchanged; TUDDY and LAMP pass their own card objects.
//
// card = {
//   id, title ('NYM @ WSH'), tooltip, past, heat (0-1, tonight's own range),
//   dial: { value, pct, title, dp },
//   band: { icon, word },              // 🌋 MAIN EVENT, 🔥, 🧊
//   lead: node,                        // the first meta mark (✓✓ lineups…)
//   status: { kind: 'live' | 'final' | 'time', text },
//   extra: node,                       // one more meta clause (the air…)
//   score: { away, home, awayScore, homeScore, live } | null,
//   chips: [{ key, tag, color, name, score, title, onClick, leg, style }],
// }
export default function SlateCard({ card: c, on = false, accent = C.orange, onSelect, target = null }) {
  const ink = verdictInk(c.heat >= 0.55 ? true : c.heat <= 0.25 ? false : null)
  const col = on ? accent : ink.color
  const wash = alpha(col, 0.05 + 0.11 * c.heat)
  return (
    <button
      onClick={() => onSelect(c.id)}
      title={c.tooltip}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left',
        cursor: 'pointer', padding: '12px 13px 11px', minWidth: 0,
        borderRadius: 18,
        border: `1px solid ${alpha(col, on ? 0.6 : 0.24)}`,
        background: `linear-gradient(158deg, ${wash}, ${C.bg2} 56%)`,
        opacity: c.past && !on ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 9,
      }}
    >
      {/* the light bar — the prop card's one piece of chrome */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${col}, ${alpha(col, 0)} 72%)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        <Dial value={c.dial.value} pct={c.dial.pct} col={col} size={52} dp={c.dial.dp || 0} title={c.dial.title} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{
              fontFamily: NUM_FONT, fontSize: 15.5, fontWeight: 900, letterSpacing: '-.02em',
              color: C.text, minWidth: 0, flex: '1 1 auto',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textDecoration: c.past ? 'line-through' : 'none',
            }}>{c.title}</span>
            {c.band?.icon && <span style={{ fontSize: 11, flexShrink: 0 }}>{c.band.icon}</span>}
            {target}
          </div>

          {/* the meta line */}
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
            fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 600, color: C.text3,
          }}>
            {c.lead}
            {c.status?.kind === 'live' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.green, fontWeight: 800 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: C.green,
                  animation: 'gsLivePulse 1.8s ease-in-out infinite', flexShrink: 0,
                }} />
                {c.status.text}
              </span>
            ) : c.status?.kind === 'final' ? (
              <span style={{ fontWeight: 800 }}>{c.status.text || 'FINAL'}</span>
            ) : (
              <span>{c.status?.text}</span>
            )}
            {c.extra}
            {c.band?.word && (
              <span style={{ fontSize: 8.5, fontWeight: 900, color: accent, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                {c.band.word}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* the live score, once there is one */}
      {c.score && (c.score.awayScore != null || c.score.homeScore != null) && (() => {
        const aS = c.score.awayScore ?? 0, hS = c.score.homeScore ?? 0
        return (
          <div style={{
            fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900,
            color: c.score.live ? C.green : C.text2,
            display: 'flex', gap: 6, alignItems: 'baseline',
          }}>
            <span style={{ color: aS > hS ? undefined : C.text3 }}>{c.score.away}</span>
            <span>{aS}–{hS}</span>
            <span style={{ color: hS > aS ? undefined : C.text3 }}>{c.score.home}</span>
          </div>
        )
      })()}

      {/* THE EITHER/OR ROW, in the prop card's tile language */}
      {c.chips?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          {c.chips.map((k) => (
            <span key={k.key}
              title={k.title}
              onClick={k.onClick}
              style={{
                display: 'flex', gap: 7, alignItems: 'baseline', minWidth: 0,
                fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 600, color: C.text2,
                cursor: k.onClick ? 'pointer' : 'inherit',
                border: `1px solid ${k.leg ? k.color : C.border}`,
                background: k.leg ? alpha(k.color, 0.19) : C.glass,
                boxShadow: k.leg ? `0 0 10px ${alpha(k.color, 0.33)}` : 'none',
                borderRadius: 10, padding: '4px 8px',
                ...(k.leg ? {} : (k.style || {})),
              }}>
              {k.leg && <span style={{ fontSize: 8 }}>🔗</span>}
              <b style={{ color: k.color, fontSize: 8, letterSpacing: '.06em', flexShrink: 0 }}>{k.tag}</b>
              <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto' }}>{k.name}</span>
              <b style={{ color: k.leg ? k.color : C.text, flexShrink: 0 }}>{k.score}</b>
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
