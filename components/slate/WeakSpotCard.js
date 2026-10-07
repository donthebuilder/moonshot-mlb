'use client'
import { C, NUM_FONT } from '../../lib/theme'

// ONE WEAK-SPOT CARD, ANY SPORT (2026-09-28, parity plan 00Q step 2).
// MOONSHOT's weak-spot card (components/WeakSpotCards.js, the Live page's
// "★ Weak spots") lifted out style for style: who is soft (the arm, the
// defense), his number against the league mark, one sentence, then a row per
// player standing in the soft spot -- the spot, the name, his side, the
// bot's tag, his score, the reason. MOONSHOT renders through it unchanged;
// TUDDY (a defense's soft roles) and LAMP (a club's soft penalty kill /
// defense) pass their own cards.
//
// card = { key, title, onTitle?, meta, stat: { text, hot, vs }, lead, damage,
//          rows: [{ key, spot, name, side, flag, tag, value, extra, why, edge, onClick }] }
// large (LAMP, 2026-10-06): every word 12px or more, the figure on its own line.
// Absent, the card draws exactly as before.
export function WeakSpotGrid({ cards = [], accent = C.orange, tagColor = C.cyan, large = false }) {
  if (!cards.length) return null
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(' + (large ? 'min(100%, 300px)' : '300px') + ', 1fr))' }}>
      {cards.map((c) => <WeakSpotCard key={c.key} c={c} accent={accent} tagColor={tagColor} large={large} />)}
    </div>
  )
}

export default function WeakSpotCard({ c, accent = C.orange, tagColor = C.cyan, large = false }) {
  if (large) return <LargeCard c={c} accent={accent} />
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 11px',
      background: 'rgba(255,255,255,.02)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
        {/* The arm's name opens his page when the caller can (2026-09-29,
            check-clickable: Live's starter names were plain text). */}
        {c.onTitle
          ? <span role="link" tabIndex={0} onClick={c.onTitle} onKeyDown={(ev) => { if (ev.key === 'Enter') c.onTitle() }}
              title={`Open ${c.title}`}
              style={{ fontSize: 12, fontWeight: 800, color: C.text, cursor: 'pointer' }}>{c.title}</span>
          : <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{c.title}</span>}
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{c.meta}</span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
          color: c.stat?.text == null ? C.text3 : c.stat.hot ? accent : C.text2,
        }}>
          {c.stat?.text ?? '—'}
          {c.stat?.vs && <span style={{ color: C.text3, fontWeight: 500 }}> {c.stat.vs}</span>}
        </span>
      </div>

      <div style={{ fontSize: 9.5, color: C.text2, marginTop: 4, lineHeight: 1.45 }}>
        {c.lead}
        {c.damage && <span style={{ color: C.text3 }}> {c.damage}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }}>
        {c.rows.map((b) => (
          <div
            key={b.key}
            role="button"
            tabIndex={0}
            onClick={() => b.onClick?.()}
            onKeyDown={(ev) => { if (ev.key === 'Enter') b.onClick?.() }}
            style={{
              borderLeft: `2px solid ${b.edge ? accent : C.border2}`,
              paddingLeft: 8, cursor: b.onClick ? 'pointer' : 'default', minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{b.spot}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{b.name}</span>
              {b.side && <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{b.side}</span>}
              {b.flag && (
                <span style={{ fontSize: 8.5, fontWeight: 900, color: accent, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>
                  {b.flag}
                </span>
              )}
              {b.tag && (
                <span style={{ fontSize: 8.5, fontWeight: 900, color: tagColor, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>
                  {b.tag}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT, color: C.text2, flexShrink: 0 }}>
                {b.value}
                {b.extra && <span style={{ color: accent }}> · {b.extra}</span>}
              </span>
            </div>
            {b.why && (
              <div style={{ fontSize: 8.5, color: C.text3, lineHeight: 1.45, marginTop: 1 }}>{b.why}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// the readable card: title and the figure on top (label above, number below),
// one plain sentence, then a row per skater with the name at 14px and his score.
function LargeCard({ c, accent }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 14px 12px', background: 'rgba(255,255,255,.02)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          {c.onTitle
            ? <span role="link" tabIndex={0} onClick={c.onTitle} onKeyDown={(ev) => { if (ev.key === 'Enter') c.onTitle() }} title={`Open ${c.title}`}
                style={{ display: 'inline-block', padding: '4px 0', fontSize: 16, fontWeight: 800, color: C.text, cursor: 'pointer' }}>{c.title}</span>
            : <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{c.title}</span>}
          <div style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{c.meta}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT }}>{c.stat?.label ?? ''}</div>
          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: NUM_FONT, color: c.stat?.value == null ? C.text3 : c.stat.hot ? accent : C.text }}>{c.stat?.value ?? '—'}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.text2, marginTop: 8, lineHeight: 1.45 }}>{c.lead}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {c.rows.map((b) => (
          <div key={b.key} role="button" tabIndex={0} onClick={() => b.onClick?.()} onKeyDown={(ev) => { if (ev.key === 'Enter') b.onClick?.() }}
            style={{ borderLeft: `3px solid ${b.edge ? accent : C.border2}`, padding: '6px 0 6px 10px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, cursor: b.onClick ? 'pointer' : 'default', minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{b.name} <span style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT, fontWeight: 600 }}>{b.side}</span></div>
              {b.why && <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.4 }}>{b.why}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: NUM_FONT, color: C.text }}>{b.value}</div>
              {b.extra && <div style={{ fontSize: 12, color: accent, fontFamily: NUM_FONT }}>{b.extra}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
