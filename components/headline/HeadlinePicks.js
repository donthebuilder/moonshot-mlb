'use client'
import { useState } from 'react'
import { WhatThis } from '../ui'
import { explain } from '../../lib/explain'
import { useIsPhone } from '../MobileFold'
import { asLogos } from '../TeamMark'
import { TYPE } from '../../lib/theme'

// THE HEADLINE PICKS, ONE LAYOUT FOR EVERY PRODUCT (2026-09-27,
// BATCH-HEADLINE-PICKS step 1). Lifted out of components/BotPicksStrip.js
// ("🎯 The Four", MOONSHOT's home) with its markup and styles unchanged, so
// MOONSHOT renders exactly as it did; TUDDY's "The Six, three deep" is the
// second user. Each product hands in its own lanes -- label, colour token,
// the picks and the words printed for them -- and its own theme. This file
// computes nothing: every name, score and stat line arrives from the caller,
// which names the field it read.
//
// lanes: [{ key, label, icon?, blurb, color, record?, empty?,
//           picks: [{ key, name, score, flag?: {icon, title}, result?: {hit, title},
//                     lines: [node, node],
//                     team?: node, micro?: string, raw,
//                     why?: string, watch?: string, explain?: { label, text } }] }]
//   why / watch (2026-09-30, BATCH-SIGNAL-WHY S2): one line each under the
//   #1's stat lines -- the caller's reason in numbers and the one number
//   against. Ellipsis on a phone; a tap sends `explain` (every reason, full
//   length) to the app's ExplainToast (lib/explain.js), so nothing depends
//   on hover. Both optional: a lane without them renders exactly as before.
// foldWhy (BATCH-SIGNAL-WHY S5): on a phone the why / watch lines start
//   folded behind one WHY chip in the header (measured: four or six lines
//   pushed the board down 72-108px, past the plan's one-line budget). A tap
//   unfolds every card at once. Desktop always shows them.
//   picks[0] is the featured #1 (name, score, two lines); picks[1..] the
//   compact rows (index, name, team, micro stat, score).
// collapsePhone: on a phone each lane shows only its #1 until tapped
//   (TUDDY's six boxes would otherwise be a long scroll; MOONSHOT's four fit).
// cols: { wide, mid } -- an even grid instead of auto-fit (which left
//   MOONSHOT's CONTACT alone on a second row): `wide` lanes across from
//   1100px, `mid` from 561px, one column on a phone. Omitted -> auto-fit.
export default function HeadlinePicks({ theme, numFont, title, subtitle, record = null, lanes = [], onPick, whatThis = null, collapsePhone = false, gridClass = 'bot-picks-grid', cols = null, foldWhy = false, sport = null }) {
  const C = theme
  const NUM_FONT = numFont
  const [open, setOpen] = useState(() => new Set())
  const isPhone = useIsPhone()
  const [whyOpen, setWhyOpen] = useState(false)
  const anyWhy = lanes.some((l) => l.picks?.[0]?.why || l.picks?.[0]?.watch)
  const whyShown = !foldWhy || !isPhone || whyOpen
  const toggle = (k) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  if (!lanes.some((l) => l.picks?.length)) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '-.01em' }}>{title}</span>
        {subtitle && <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{subtitle}</span>}
        {foldWhy && isPhone && anyWhy && (
          <button type="button" onClick={() => setWhyOpen((v) => !v)} aria-expanded={whyOpen}
            style={{ minHeight: 44, margin: '-13px 0', padding: '0 8px', border: 'none', background: 'transparent', color: C.text2, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', cursor: 'pointer' }}>
            WHY {whyOpen ? '▾' : '▸'}
          </button>
        )}
        {record}
      </div>

      <div className={cols ? `${gridClass} hp-even-${cols.wide}-${cols.mid}` : gridClass} style={{
        display: 'grid', gap: 8,
        gridTemplateColumns: cols ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))',
      }}>
        {lanes.map((f) => {
          const lead = f.picks?.[0]
          const rest = (f.picks || []).slice(1)
          const isOpen = open.has(f.key)
          return (
            <div
              key={f.key}
              style={{
                background: `linear-gradient(155deg, ${f.color}1f, ${f.color}07)`,
                border: `1px solid ${f.color}4d`,
                boxShadow: `0 0 18px ${f.color}12`,
                borderRadius: 12, padding: '10px 13px', minWidth: 0,
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                {f.icon && <span style={{ fontSize: 12 }}>{f.icon}</span>}
                <span style={{
                  fontSize: TYPE.micro, fontWeight: 900, color: f.color,
                  letterSpacing: '.09em', fontFamily: NUM_FONT,
                }}>{f.label}</span>
                <span style={{ fontSize: TYPE.micro, color: C.text3 }}>{f.blurb}</span>
                {f.record && <span style={{ marginLeft: 'auto', fontSize: TYPE.micro, color: C.text2, fontFamily: NUM_FONT, fontWeight: 700, whiteSpace: 'nowrap' }}>{f.record}</span>}
              </div>

              {!lead ? (
                <div style={{ fontSize: 10.5, color: C.text3 }}>{f.empty || 'None designated tonight.'}</div>
              ) : (
                <>
                  {/* #1 — featured, full detail. */}
                  <div
                    onClick={() => onPick?.(lead, f)}
                    style={{ cursor: onPick ? 'pointer' : 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: lead.face ? 'center' : 'baseline', gap: 6 }}>
                      {lead.face}
                      <span style={{
                        fontSize: 14.5, fontWeight: 800, minWidth: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{lead.name}</span>
                      {lead.flag && (
                        <span title={lead.flag.title} style={{ fontSize: 11 }}>{lead.flag.icon}</span>
                      )}
                      {lead.result && <Mark r={lead.result} C={C} size={13} />}
                      <span style={{
                        marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 16,
                        fontWeight: 900, color: f.color,
                      }}>{lead.score}</span>
                    </div>
                    {lead.lines?.[0] && (
                      <div style={{
                        fontSize: TYPE.micro, color: C.text2, fontFamily: NUM_FONT, marginTop: 2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {lead.lines[0]}
                      </div>
                    )}
                    {lead.lines?.[1] && (
                      <div style={{
                        fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, marginTop: 1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {lead.lines[1]}
                      </div>
                    )}
                  </div>
                  {whyShown && (lead.why || lead.watch) && (
                    <button type="button"
                      onClick={() => explain(lead.explain?.label || lead.name, lead.explain?.text || [lead.why, lead.watch].filter(Boolean).join(' · '))}
                      aria-label={`Why ${lead.name}: ${[lead.why, lead.watch && `watch: ${lead.watch}`].filter(Boolean).join('; ')}`}
                      style={{
                        display: 'block', width: '100%', minHeight: 0, marginTop: 3, padding: 0, border: 0, background: 'transparent',
                        textAlign: 'left', cursor: 'pointer', fontFamily: NUM_FONT, fontSize: TYPE.micro, lineHeight: 1.45, minWidth: 0,
                      }}>
                      {lead.why && (
                        <span style={{ display: 'block', color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <b style={{ color: f.color, fontWeight: 900, letterSpacing: '.06em' }}>WHY</b> {lead.why}
                        </span>
                      )}
                      {lead.watch && (
                        <span style={{ display: 'block', color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <b style={{ color: C.text3, fontWeight: 900, letterSpacing: '.06em' }}>WATCH</b> {lead.watch}
                        </span>
                      )}
                    </button>
                  )}

                  {/* On a phone, collapsed lanes offer the rest behind one tap. */}
                  {collapsePhone && rest.length > 0 && (
                    <button type="button" className="hp-more" onClick={() => toggle(f.key)} aria-expanded={isOpen}
                      style={{ display: 'none', marginTop: 6, alignSelf: 'flex-start', minHeight: 44, padding: '4px 12px', borderRadius: 8, border: `1px solid ${f.color}4d`, background: 'transparent', color: f.color, fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer' }}>
                      {isOpen ? 'Hide #2 and #3' : `#2 and #3 ▾`}
                    </button>
                  )}

                  {/* #2 and #3 — compact rows, same click-through, scores on
                      the same scale so the three are comparable. */}
                  {rest.length > 0 && (
                    <div className={collapsePhone && !isOpen ? 'hp-rest hp-rest-shut' : 'hp-rest'} style={{
                      marginTop: 7, paddingTop: 6,
                      borderTop: `1px solid ${f.color}26`,
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                      {rest.map((p, idx) => (
                        <div
                          key={p.key ?? idx}
                          // A real control (role + keyboard), so the name in it
                          // counts as tappable; the look is unchanged.
                          role={onPick ? 'button' : undefined}
                          tabIndex={onPick ? 0 : undefined}
                          onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p, f) } } : undefined}
                          onClick={() => onPick?.(p, f)}
                          style={{
                            display: 'flex', alignItems: 'baseline', gap: 6,
                            cursor: onPick ? 'pointer' : 'default', minWidth: 0,
                          }}
                        >
                          <span style={{
                            fontSize: TYPE.micro, fontFamily: NUM_FONT, fontWeight: 800,
                            color: `${f.color}99`, flexShrink: 0,
                          }}>{idx + 2}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: C.text2, minWidth: 0,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{p.name}</span>
                          {p.flag && <span style={{ fontSize: TYPE.micro }}>{p.flag.icon}</span>}
                          {p.result && <Mark r={p.result} C={C} size={11} />}
                          <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0, alignSelf: 'center' }}>
                            {/* a club code draws as its logo (Donovan 10-02, logos site-wide) */}
                            {asLogos(sport, p.team, { px: 12 })}
                          </span>
                          {p.micro && (
                            <span style={{
                              marginLeft: 'auto', fontSize: TYPE.micro, color: C.text3,
                              fontFamily: NUM_FONT, flexShrink: 0,
                            }}>{p.micro}</span>
                          )}
                          {/* The micro-stat above owns the `auto` margin, so the
                              score gets a fixed gap. Two `auto` margins in one
                              flex row split the free space between them and the
                              score would drift to the middle of the row. */}
                          <span style={{
                            marginLeft: p.micro ? 6 : 'auto',
                            fontFamily: NUM_FONT, fontSize: 11,
                            fontWeight: 800, color: f.color, flexShrink: 0,
                          }}>{p.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {whatThis && (
        <WhatThis label={whatThis.label} maxWidth={720}>
          {whatThis.body}
        </WhatThis>
      )}
      {cols && (
        <style>{`
          @media (min-width: 561px) { .hp-even-${cols.wide}-${cols.mid} { grid-template-columns: repeat(${cols.mid}, minmax(0, 1fr)) !important; } }
          @media (min-width: 1100px) { .hp-even-${cols.wide}-${cols.mid} { grid-template-columns: repeat(${cols.wide}, minmax(0, 1fr)) !important; } }
        `}</style>
      )}
      {collapsePhone && (
        <style>{`
          @media (max-width: 560px) {
            .hp-more { display: inline-flex !important; align-items: center; }
            .hp-rest-shut { display: none !important; }
          }
        `}</style>
      )}
    </div>
  )
}

// A settled pick: ✓ cleared its bar, ✗ missed it. The symbol says it; the
// words ride along for screen readers and the hover (the lane's bar is printed
// in its header, so nothing depends on the hover).
function Mark({ r, C, size }) {
  return (
    <span role="img" aria-label={r.title} title={r.title} style={{ flexShrink: 0, fontSize: size, fontWeight: 900, lineHeight: 1, color: r.hit ? C.green : C.red }}>
      {r.hit ? '✓' : '✗'}
    </span>
  )
}
