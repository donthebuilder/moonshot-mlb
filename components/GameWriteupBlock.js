'use client'
// THE CALL ON A GAME PAGE, ANY SPORT (2026-10-05). MOONSHOT's block (components/MlbWriteupBlock.js,
// TUDDY's look) made sport-blind: the write-up JSON (lib/writeups/<sport>.js) plus the product's
// theme and three lines of its own words -- the status line, each player's meta and his numbers.
// Phone first: each called player's name, status, numbers and two reasons; the rest one tap down.
import { useState } from 'react'
import CallStatusBadge from './CallStatusBadge'
import Tap from './Tap'

/**
 * @param w        a write-up (buildWriteup)
 * @param theme    { C, NUM_FONT, TYPE, accent }
 * @param words    { status(w), meta(p), numbers(p) } -> strings
 * @param onOpen   (p) => void, opens the player
 * @param depth    optional { player(p) => node, game: node } the sport's deeper sections, drawn only while the full write-up is open
 */
export default function GameWriteupBlock({ w, theme, words, onOpen, depth = null }) {
  const { C, NUM_FONT, TYPE, accent: ACCENT } = theme
  const [open, setOpen] = useState(false)
  if (!w || !w.players.length) return null
  const Kicker = ({ children }) => (
    <div style={{ font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '8px 0 4px' }}>{children}</div>
  )
  return (
    <section aria-label="The call" style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', marginBottom: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: ACCENT }}>THE CALL</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{words.status(w)}</span>
      </div>
      {w.players.map((p) => (
        <div key={p.player_id} style={{ marginTop: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Tap onClick={onOpen ? () => onOpen(p) : null}
              style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: TYPE.name, fontWeight: 900, color: C.text }}>{p.name}</Tap>
            <CallStatusBadge status={p.status} />
            <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{words.meta(p)}</span>
          </div>
          <div style={{ fontSize: TYPE.body, color: C.text2, fontFamily: NUM_FONT }}>
            {words.numbers(p)}
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: TYPE.body, lineHeight: 1.5, color: C.text2 }}>
            {(open ? p.why : p.why.slice(0, 2)).map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}
          </ul>
          {open && p.watch.length > 0 && (<><Kicker>WATCH OUT</Kicker>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: TYPE.body, lineHeight: 1.5, color: C.text2 }}>{p.watch.map((l) => <li key={l.t} title={l.src}>{l.t}</li>)}</ul></>)}
          {open && depth?.player && depth.player(p)}
        </div>
      ))}
      {open && (<>
        {w.game.length > 0 && (<><Kicker>THE GAME</Kicker>{w.game.map((l) => <div key={l.t} title={l.src} style={{ fontSize: TYPE.body, color: C.text2 }}>{l.t}</div>)}</>)}
        {depth?.game}
        <Kicker>BOTTOM LINE</Kicker>
        {w.bottom.map((l) => <div key={l.t} style={{ fontSize: TYPE.body, color: C.text2 }}>{l.t}</div>)}
        <div style={{ marginTop: 8, fontSize: TYPE.micro, color: C.text3 }}>{w.footer}</div>
      </>)}
      {!open && w.noCall.map((n) => <div key={n.team} style={{ marginTop: 8, fontSize: TYPE.body, color: C.text3 }}>{w.bottom.find((l) => l.t.startsWith(`${n.team}:`))?.t}</div>)}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ marginTop: 6, minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', color: ACCENT, font: `800 ${TYPE.micro}px/1 ${NUM_FONT}`, letterSpacing: '.06em', cursor: 'pointer' }}>
        {open ? 'SHOW LESS' : 'THE FULL WRITE-UP ›'}
      </button>
    </section>
  )
}
