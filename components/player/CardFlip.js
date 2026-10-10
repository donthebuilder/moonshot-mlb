'use client'
// THE PLAYER'S CARD, ON HIS PAGE (shared by MOONSHOT, TUDDY and LAMP; the sport's words and colours come in as props / the sport theme).
// A small "Card" chip that lives in a row the page already has (so the first useful row does not move), and opens a sheet with the
// card's FRONT; one tap on the card flips it to the BACK (the stat-table back), and again to the front. The pictures are the site's own
// image route (/api/card/image), the same renderer the CALLED alerts post: nothing is drawn twice in two ways.
//   - the chip and the flip target are >= 44px; the card itself is the flip button (Enter / Space work), with a live-region word
//   - Escape closes THIS sheet only (the player's own card underneath stays open); the backdrop and a 44px close button also close it
//   - the back is requested only after the first flip (one render, not two); a card that is not available says so in words
//   - reduced motion: the flip is instant
//   - safe areas and landscape: the sheet scrolls, the card's width follows the height left on screen
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSportTheme } from '../SportTheme'
import { isHiddenSport } from '../../lib/routes'
import { CARD_SPORTS } from '../../lib/card/core'

const SIDES = ['front', 'back']
export const cardImageUrl = (sport, id, side, { date = null, w = 720 } = {}) => `/api/card/image?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(String(id))}&side=${side}&w=${w}${date ? `&date=${encodeURIComponent(date)}` : ''}`

function CardSheet({ sport, id, name, date, onClose }) {
  const { C, accent } = useSportTheme()
  const [side, setSide] = useState('front')
  const [backSeen, setBackSeen] = useState(false)
  const [bad, setBad] = useState({})          // side -> true when its image could not load
  const [loaded, setLoaded] = useState({})
  const closeRef = useRef(null)
  const flipRef = useRef(null)
  const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const prior = document.activeElement
    const t = setTimeout(() => { try { flipRef.current?.focus({ preventScroll: true }) } catch { /* ignore */ } }, 30)
    // capture phase on window: this sheet owns Escape and Tab while it is open, so the player's card under it does not also close
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); return }
      if (e.key !== 'Tab') return
      const els = [flipRef.current, closeRef.current].filter(Boolean)
      if (!els.length) return
      e.stopImmediatePropagation()
      const i = els.indexOf(document.activeElement)
      e.preventDefault()
      els[(i + (e.shiftKey ? els.length - 1 : 1)) % els.length].focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey, true); try { if (prior && document.contains(prior)) prior.focus({ preventScroll: true }) } catch { /* ignore */ } }
  }, [onClose])

  const flip = () => { setBackSeen(true); setSide((s) => (s === 'front' ? 'back' : 'front')) }
  const face = (s) => ({ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: s === 'back' ? 'rotateY(180deg)' : 'none', borderRadius: 14, overflow: 'hidden', background: C.bg3 })
  const word = side === 'front' ? 'front' : 'back'
  return createPortal(
    <div onClick={(e) => { e.stopPropagation(); onClose() }} role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 420, background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'safe center', justifyContent: 'center', overflowY: 'auto', overscrollBehavior: 'contain', padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))' }}>
      <div role="dialog" aria-modal="true" aria-label={`${name || 'Player'} card`} onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: 'auto', width: 'min(100%, 440px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
          <span aria-live="polite" style={{ color: C.text2, fontSize: 13, fontWeight: 700 }}>{`${name || 'Card'} · ${word} · tap the card to flip`}</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the card"
            style={{ minWidth: 44, minHeight: 44, borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>{'✕'}</button>
        </div>
        <button ref={flipRef} type="button" onClick={flip} aria-label={`Flip the card. Showing the ${word}.`}
          style={{ display: 'block', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', perspective: 1400, width: 'min(100%, calc((100dvh - 150px) * 0.8))', minWidth: 220, aspectRatio: '4 / 5' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: still ? 'none' : 'transform .55s ease', transform: side === 'back' ? 'rotateY(180deg)' : 'none' }}>
            {SIDES.map((s) => (
              <div key={s} style={face(s)}>
                {(s === 'front' || backSeen) && !bad[s] ? (
                  <img src={cardImageUrl(sport, id, s, { date })} alt={s === 'front' ? `${name || 'Player'}: the front of the card` : `${name || 'Player'}: the back of the card, the season stats`}
                    onLoad={() => setLoaded((l) => ({ ...l, [s]: true }))} onError={() => setBad((b) => ({ ...b, [s]: true }))}
                    style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', opacity: loaded[s] ? 1 : 0, transition: 'opacity .2s' }} />
                ) : null}
                {!loaded[s] ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: C.text2, fontSize: 14, lineHeight: 1.4 }}>
                    {bad[s] ? 'This card is not available for him today. Cards are drawn only from a real board and real stats.' : 'Drawing the card…'}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </button>
        <span style={{ color: accent, fontSize: 12, fontWeight: 800, letterSpacing: '.08em' }}>{side === 'front' ? 'FRONT' : 'BACK'}</span>
      </div>
    </div>,
    document.body,
  )
}

/** The chip. `style` lets the host row size it; the target is never under 44px. */
export default function CardFlip({ sport, id, name, date = null, style = null, label = 'Card' }) {
  const { C, accent } = useSportTheme()
  const [open, setOpen] = useState(false)
  if (!CARD_SPORTS.includes(String(sport)) || isHiddenSport(sport) || id == null || id === '') return null
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true) }} aria-haspopup="dialog" aria-expanded={open}
        title="Open his card: tap it to flip between the front and the stat-table back" aria-label={`Open ${name || 'his'} card: front and back`}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, flex: '0 0 auto', boxSizing: 'border-box', minWidth: 44, minHeight: 44, padding: '0 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 800, lineHeight: 1, border: `1px solid ${C.border2}`, background: 'transparent', color: accent, ...(style || {}) }}>
        <span aria-hidden="true">{'\u{1F3B4}'}</span><span>{label}</span>
      </button>
      {open ? <CardSheet sport={sport} id={id} name={name} date={date} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
