'use client'
// HOW TO READ THIS BOARD (2026-10-01). Donovan: "something that will help the
// people understand what they're looking at, picking and doing."
//
// A picture, not a paragraph: one REAL row from tonight's board, drawn the way
// the table draws it, with numbered marks on the parts that matter and one
// plain line for each mark underneath. Then what to do with it.
//
// It costs the page no scroll: the way in is an inline button that sits in a
// sentence the page already prints, and the picture opens in a sheet (bottom
// sheet on a phone, centred on desktop). The first visit says "New here?";
// after it has been opened once, it just says "How to read this".
//
// Sport-agnostic on purpose. The caller hands in the row's parts and the
// words; TUDDY and LAMP reuse this with their own row, not a copy of it.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import PlayerFace from './PlayerFace'
import { useIsPhone } from './MobileFold'

const seenKey = (id) => `dash.howto.${id}`
function readSeen(id) { try { return window.localStorage.getItem(seenKey(id)) === '1' } catch { return false } }
function markSeen(id) { try { window.localStorage.setItem(seenKey(id), '1') } catch { /* private window: harmless */ } }

function Mark({ n, accent }) {
  return (
    <span aria-hidden="true" style={{
      position: 'absolute', top: -10, left: -8, width: 20, height: 20, borderRadius: 999,
      background: accent, color: C.bg, fontSize: 11, fontWeight: 900, lineHeight: '20px',
      textAlign: 'center', fontFamily: NUM_FONT, boxShadow: `0 0 0 2px ${C.bg2}, 0 0 12px ${accent}88`,
    }}>{n}</span>
  )
}

// A part of the row is a button: tap it and the callout under the picture
// says what it is. The one being explained lights up; the rest step back.
function Part({ n, accent, active, dim, onPick, label, children, style }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={active} aria-label={`Part ${n}: ${label}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44,
        padding: '8px 10px', borderRadius: 10, cursor: 'pointer', font: 'inherit', textAlign: 'left',
        color: 'inherit', transition: 'opacity .18s, box-shadow .18s, border-color .18s',
        border: `1px solid ${active ? accent : `${accent}40`}`,
        background: active ? `linear-gradient(180deg, ${accent}2e, ${accent}10)` : `linear-gradient(180deg, ${accent}14, ${accent}06)`,
        boxShadow: active ? `0 0 0 3px ${accent}26, 0 0 22px ${accent}40` : 'none',
        opacity: dim ? 0.55 : 1, ...style }}>
      <Mark n={n} accent={accent} />
      {children}
    </button>
  )
}

/**
 * row: { sport, faceId, espnId?, team, opp, name, rank, score: { label, value, dp? },
 *        pick: label or null, pickNone?, fifth: { label, value } }
 * notes: [{ title, text }] in mark order 1..5 (rank, player, score, pick, facing)
 * steps: [{ icon, text }] what to do next
 */
export default function HowToRead({ id, accent = C.orange, row, notes, steps = [], title = 'How to read this board' }) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(true)
  const [active, setActive] = useState(0)
  const isPhone = useIsPhone()
  const closeRef = useRef(null)
  useEffect(() => { setSeen(readSeen(id)) }, [id])
  useEffect(() => {
    if (!open) return undefined
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', key)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', key)
  }, [open])
  if (!row) return null
  const openIt = () => { setActive(0); setOpen(true); if (!seen) { markSeen(id); setSeen(true) } }
  const pick = (i) => () => setActive(i)
  const partProps = (i) => ({ n: i + 1, accent, active: active === i, dim: active !== i, onPick: pick(i), label: notes[i]?.title || '' })

  return (
    <>
      {/* A pill, so it reads as a thing to tap. Its 44px hit area is an
          invisible inset span, and the negative margin keeps the sentence's
          line from growing. */}
      <button type="button" onClick={openIt} aria-haspopup="dialog"
        style={{
          position: 'relative', font: 'inherit', cursor: 'pointer', color: accent, fontWeight: 800,
          margin: '-6px 0 -6px 6px', padding: '3px 10px 3px 8px', borderRadius: 999,
          border: `1px solid ${accent}66`, background: `${accent}14`, minHeight: 0,
          display: 'inline-flex', alignItems: 'center', gap: 5, verticalAlign: 'middle', whiteSpace: 'nowrap',
        }}>
        <span aria-hidden="true" style={{ position: 'absolute', inset: '-10px -4px' }} />
        <span aria-hidden="true">🧭</span>
        {/* Short on a phone so it shares the line with the sentence before it;
            first visit gets a dot. */}
        <span>{isPhone ? 'How to read' : (seen ? 'How to read this' : 'New here? How to read this')}</span>
        {!seen && <span aria-label="new" style={{ width: 7, height: 7, borderRadius: 999, background: accent, boxShadow: `0 0 8px ${accent}` }} />}
      </button>

      {/* Portalled: the button sits inside a sentence (<p>), and a sheet is
          not allowed in one -- nor should a parent's stacking trap it. */}
      {open && typeof document !== 'undefined' && createPortal(
        <div role="presentation" onClick={() => setOpen(false)} style={{
          // zIndex: above the phone tab bar (MobileTabBar, 390).
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.66)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: isPhone ? 'flex-end' : 'center', justifyContent: 'center',
          padding: isPhone ? 0 : 24,
        }}>
          <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{
            width: isPhone ? '100%' : 560, maxWidth: '100%',
            maxHeight: isPhone ? 'calc(100dvh - 40px - env(safe-area-inset-top))' : 'calc(100dvh - 48px)',
            overflowY: 'auto', overscrollBehavior: 'contain',
            background: `radial-gradient(140% 60% at 50% 0%, ${accent}1a, transparent 60%), ${C.bg2}`,
            border: `1px solid ${C.border}`, borderTop: `3px solid ${accent}`,
            borderRadius: isPhone ? '16px 16px 0 0' : 16,
            padding: `14px 16px calc(18px + env(safe-area-inset-bottom))`,
            boxShadow: '0 -12px 40px rgba(0,0,0,.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: TYPE.title, fontWeight: 900, color: C.text }}>{title}</div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close"
                style={{ width: 44, height: 44, borderRadius: 999, border: `1px solid ${C.border}`, background: C.glass,
                  color: C.text2, fontSize: 18, cursor: 'pointer', flex: '0 0 auto' }}>✕</button>
            </div>
            <div style={{ fontSize: TYPE.body, color: C.text2, margin: '2px 0 16px' }}>
              {row.caption || 'One row from tonight\u2019s board, taken apart.'} Tap any part of it.
            </div>

            {/* THE PICTURE: a real row, drawn like the table draws it. */}
            <div style={{
              position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '18px 12px',
              padding: '30px 12px 16px', borderRadius: 14,
              background: `radial-gradient(90% 120% at 0% 0%, ${accent}22, transparent 55%), ${C.bg3 || C.bg}`,
              border: `1px solid ${accent}33`, boxShadow: `inset 0 1px 0 ${accent}22`,
            }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 9, left: 12, fontSize: 10, fontWeight: 900, letterSpacing: '.14em',
                textTransform: 'uppercase', color: accent }}>{row.eyebrow || 'Live from tonight\u2019s board'}</span>
              <Part {...partProps(0)}>
                <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 15, color: C.text }}>#{row.rank}</span>
              </Part>
              <Part {...partProps(1)} style={{ flex: '1 1 180px', minWidth: 0 }}>
                <span style={{ borderRadius: 999, padding: 2, background: `conic-gradient(${accent}, ${accent}33, ${accent})`, display: 'inline-flex', flex: '0 0 auto' }}>
                  <span style={{ borderRadius: 999, padding: 2, background: C.bg2, display: 'inline-flex' }}>
                    <PlayerFace sport={row.sport} id={row.faceId} espnId={row.espnId} photo={row.photo} team={row.team} name={row.name} size={42} />
                  </span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: TYPE.name, fontWeight: 800, color: C.text }}>{row.name}</span>
                  <span style={{ fontSize: TYPE.label, color: C.text3, fontFamily: NUM_FONT }}>{row.team}{row.opp ? ` vs ${row.opp}` : ''}</span>
                </span>
              </Part>
              <Part {...partProps(2)}>
                <span style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 800 }}>{row.score.label}</span>
                <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 17, color: C.bg, borderRadius: 7, padding: '3px 9px',
                  background: `linear-gradient(180deg, ${accent}, ${accent}cc)`, boxShadow: `0 0 16px ${accent}55` }}>
                  {Number(row.score.value).toFixed(row.score.dp ?? 1)}
                </span>
              </Part>
              <Part {...partProps(3)}>
                <span style={{ fontSize: 15 }} aria-hidden="true">🤖</span>
                <span style={{ fontSize: TYPE.label, color: row.pick ? accent : C.text3, fontWeight: 800 }}>{row.pick ? `● ${row.pick}` : (row.pickNone || 'not picked tonight')}</span>
              </Part>
              <Part {...partProps(4)}>
                <span style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 800 }}>{row.fifth.label}</span>
                <span style={{ fontSize: TYPE.body, color: C.text, fontWeight: 700 }}>{row.fifth.value}</span>
              </Part>
            </div>

            {/* THE CALLOUT: what the lit part means, right under it. Tap a part,
                or step through with the arrows. */}
            <div aria-live="polite" style={{ marginTop: 12, padding: '12px 12px 10px', borderRadius: 12,
              background: `${accent}12`, border: `1px solid ${accent}55`, borderLeft: `4px solid ${accent}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: NUM_FONT, fontWeight: 900, color: accent, fontSize: 13 }}>{active + 1}</span>
                <b style={{ color: C.text, fontSize: 15 }}>{notes[active]?.title}</b>
              </div>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5, marginTop: 4, minHeight: 58 }}>{notes[active]?.text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button type="button" onClick={() => setActive((a) => (a + notes.length - 1) % notes.length)} aria-label="Previous part"
                  style={{ width: 44, height: 44, borderRadius: 999, border: `1px solid ${C.border}`, background: C.glass, color: C.text2, fontSize: 18, cursor: 'pointer' }}>‹</button>
                <span aria-hidden="true" style={{ display: 'inline-flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                  {notes.map((nt, k) => (
                    <span key={nt.title} style={{ width: k === active ? 18 : 7, height: 7, borderRadius: 999, transition: 'width .18s',
                      background: k === active ? accent : `${accent}44` }} />
                  ))}
                </span>
                <button type="button" onClick={() => setActive((a) => (a + 1) % notes.length)}
                  style={{ minWidth: 88, height: 44, borderRadius: 999, border: `1px solid ${accent}`, background: accent, color: C.bg,
                    fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>{active === notes.length - 1 ? 'Start over' : 'Next \u203a'}</button>
              </div>
            </div>

            {steps.length > 0 && (
              <>
                <div style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', color: C.text3, margin: '20px 0 10px' }}>
                  Then
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : `repeat(${steps.length}, 1fr)`, gap: 8 }}>
                  {steps.map((s) => (
                    <div key={s.text} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 11px', borderRadius: 12,
                      border: `1px solid ${accent}33`, background: `linear-gradient(135deg, ${accent}12, transparent 70%)` }}>
                      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 999, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                        fontSize: 18, background: `${accent}1f`, border: `1px solid ${accent}55` }}>{s.icon}</span>
                      <span style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.4 }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
