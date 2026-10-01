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
      position: 'absolute', top: -9, left: -7, width: 18, height: 18, borderRadius: 999,
      background: accent, color: C.bg, fontSize: 10.5, fontWeight: 900, lineHeight: '18px',
      textAlign: 'center', fontFamily: NUM_FONT, boxShadow: `0 0 0 2px ${C.bg}`,
    }}>{n}</span>
  )
}

function Part({ n, accent, children, style }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '7px 9px', borderRadius: 9, border: `1px dashed ${accent}66`, ...style }}>
      <Mark n={n} accent={accent} />
      {children}
    </span>
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
  const openIt = () => { setOpen(true); if (!seen) { markSeen(id); setSeen(true) } }

  return (
    <>
      {/* 44px tall hit area without growing the sentence it sits in. */}
      <button type="button" onClick={openIt} aria-haspopup="dialog"
        style={{
          background: 'transparent', border: 'none', font: 'inherit', cursor: 'pointer',
          color: accent, fontWeight: 800, padding: '12px 6px', margin: '-12px -6px -12px 4px',
          minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
        <span aria-hidden="true">🧭</span>
        {/* Short on a phone so it shares the line with the sentence before it
            instead of taking a line of its own; first visit gets a dot. */}
        <span style={{ borderBottom: `1px dashed ${accent}66` }}>{isPhone ? 'How to read' : (seen ? 'How to read this' : 'New here? How to read this')}</span>
        {isPhone && !seen && <span aria-label="new" style={{ width: 7, height: 7, borderRadius: 999, background: accent }} />}
      </button>

      {/* Portalled: the button sits inside a sentence (<p>), and a sheet is
          not allowed in one -- nor should a parent's stacking trap it. */}
      {open && typeof document !== 'undefined' && createPortal(
        <div role="presentation" onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000,  // above the phone tab bar (MobileTabBar, 390) background: 'rgba(0,0,0,.62)',
          display: 'flex', alignItems: isPhone ? 'flex-end' : 'center', justifyContent: 'center',
          padding: isPhone ? 0 : 24,
        }}>
          <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{
            width: isPhone ? '100%' : 560, maxWidth: '100%',
            maxHeight: isPhone ? 'calc(100dvh - 40px - env(safe-area-inset-top))' : 'calc(100dvh - 48px)',
            overflowY: 'auto', overscrollBehavior: 'contain',
            background: C.bg2, border: `1px solid ${C.border}`,
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
              {row.caption || 'One row from tonight\u2019s board, taken apart.'}
            </div>

            {/* THE PICTURE: a real row, drawn like the table draws it. */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 12px',
              padding: '18px 12px 14px', borderRadius: 12, background: C.bg3 || C.bg,
              border: `1px solid ${C.border}`,
            }}>
              <Part n={1} accent={accent}>
                <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 15, color: C.text }}>#{row.rank}</span>
              </Part>
              <Part n={2} accent={accent} style={{ flex: '1 1 180px', minWidth: 0 }}>
                <PlayerFace sport={row.sport} id={row.faceId} espnId={row.espnId} team={row.team} name={row.name} size={36} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: TYPE.name, fontWeight: 800, color: C.text }}>{row.name}</span>
                  <span style={{ fontSize: TYPE.label, color: C.text3, fontFamily: NUM_FONT }}>{row.team}{row.opp ? ` vs ${row.opp}` : ''}</span>
                </span>
              </Part>
              <Part n={3} accent={accent}>
                <span style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 800 }}>{row.score.label}</span>
                <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 15, color: C.bg, background: accent, borderRadius: 6, padding: '2px 7px' }}>
                  {Number(row.score.value).toFixed(row.score.dp ?? 1)}
                </span>
              </Part>
              <Part n={4} accent={accent}>
                <span style={{ fontSize: 15 }} aria-hidden="true">🤖</span>
                <span style={{ fontSize: TYPE.label, color: row.pick ? accent : C.text3, fontWeight: 800 }}>{row.pick ? `● ${row.pick}` : (row.pickNone || 'not picked tonight')}</span>
              </Part>
              <Part n={5} accent={accent}>
                <span style={{ fontSize: TYPE.label, color: C.text3, fontWeight: 800 }}>{row.fifth.label}</span>
                <span style={{ fontSize: TYPE.body, color: C.text, fontWeight: 700 }}>{row.fifth.value}</span>
              </Part>
            </div>

            {/* WHAT EACH MARK MEANS */}
            <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 10 }}>
              {notes.map((nt, i) => (
                <li key={nt.title} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 9, alignItems: 'start' }}>
                  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 999, background: accent, color: C.bg,
                    fontSize: 11, fontWeight: 900, lineHeight: '20px', textAlign: 'center', fontFamily: NUM_FONT, marginTop: 1 }}>{i + 1}</span>
                  <span style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
                    <b style={{ color: C.text }}>{nt.title}.</b> {nt.text}
                  </span>
                </li>
              ))}
            </ol>

            {steps.length > 0 && (
              <>
                <div style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', color: C.text3, margin: '20px 0 10px' }}>
                  Then
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : `repeat(${steps.length}, 1fr)`, gap: 8 }}>
                  {steps.map((s) => (
                    <div key={s.text} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 11px', borderRadius: 10,
                      border: `1px solid ${C.border}`, background: C.glass }}>
                      <span aria-hidden="true" style={{ fontSize: 20 }}>{s.icon}</span>
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
