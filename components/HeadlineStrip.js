'use client'
import { useRef } from 'react'
import { useAutoScroll } from '../lib/headlines'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../lib/theme'
import { asLogos } from './TeamMark'

// ── THE HEADLINES STRIP, ONE COMPONENT FOR ALL THREE PRODUCTS (2026-09-26) ──
// MOONSHOT's Home drew it privately (components/tabs/Home.js `Headlines`),
// TUDDY rebuilt the same card shape in its own CSS (NflHeadlineStrip), and
// LAMP had none (.claude-notes/BATCH-LAMP-SHELL-PLAN.md step 2). This is
// MOONSHOT's render, moved as it was -- MOONSHOT's look is the reference --
// with the product's theme, its number font and its accent as props. Each
// product still builds its own cards (lib/headlines.js, lib/nfl/headlines.js,
// lib/nhl/headlines.js) and decides what a tap opens.
//
//   card: { k, tag, icon, name, why, stat, col }
//
// Self-scrolling (useAutoScroll, pauses under the pointer), two copies back
// to back for a seamless loop, the echo hidden from screen readers.
// faceOf(card) -> node | null (BATCH-FACES step 8): a small face beside the
// name on a card about one player. Absent, the card draws exactly as before.
export default function HeadlineStrip({ cards = [], onOpen = null, theme = null, numFont = null, accent = null, speed = 30, faceOf = null, sport = null }) {
  const C = theme || MLB_C
  const NUM_FONT = numFont || MLB_NUM
  const stripRef = useRef(null)
  useAutoScroll(stripRef, { speed })
  if (!cards.length) return null
  const Card = ({ c, i, echo }) => (
    <button type="button" tabIndex={echo ? -1 : 0} aria-hidden={echo || undefined} onClick={() => onOpen?.(c)}
      className="home-headline"
      style={{
        display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 3, width: 232, minHeight: 104, flexShrink: 0,
        padding: '10px 12px 9px', borderRadius: 10, border: `1px solid ${c.col}33`,
        background: `linear-gradient(160deg, ${c.col}14, ${C.glass} 70%)`, color: C.text, textAlign: 'left', cursor: 'pointer', font: 'inherit',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro, fontWeight: 900, color: c.col }}>{String(i + 1).padStart(2, '0')}</span>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.14em', fontFamily: NUM_FONT, color: c.col }}>{c.tag}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, lineHeight: 1 }}>{c.icon}</span>
      </span>
      {(() => {
        const face = faceOf?.(c)
        const nameEl = <span style={{ fontSize: TYPE.name, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{asLogos(sport, c.name, { px: 18 })}</span>
        return face ? <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>{face}{nameEl}</span> : nameEl
      })()}
      <span style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.why}</span>
        <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, color: c.col, whiteSpace: 'nowrap', border: `1px solid ${c.col}44`, background: `${c.col}14`, borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>{c.stat}</span>
      </span>
    </button>
  )
  return (
    <div className="home-headlines" style={{ margin: '2px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.16em', fontFamily: NUM_FONT, color: C.text3 }}>HEADLINES</span>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${accent || C.orange}66, transparent)` }} />
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{cards.length} · tap any · swipe or let it roll</span>
      </div>
      {/* #97: WebkitOverflowScrolling:'touch' dropped here too -- see the
          matching note in components/Header.js. Same useAutoScroll hook,
          same iOS quirk (a touch-momentum layer ignores a JS scrollLeft
          write until a real touch unlocks it), same fix. */}
      <div className="home-headlines-viewport" ref={stripRef} style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 24px, black calc(100% - 24px), transparent)', maskImage: 'linear-gradient(90deg, transparent, black 24px, black calc(100% - 24px), transparent)' }}>
        <div className="home-headlines-track" style={{ display: 'flex', gap: 12, width: 'max-content', paddingBottom: 2 }}>
          {cards.map((c, i) => <Card key={c.k} c={c} i={i} />)}
          {cards.map((c, i) => <Card key={`${c.k}-echo`} c={c} i={i} echo />)}
        </div>
      </div>
    </div>
  )
}
