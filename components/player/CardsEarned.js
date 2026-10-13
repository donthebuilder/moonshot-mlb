'use client'
// THE "CARDS EARNED" SHELF (2026-10-12; shared by MOONSHOT, TUDDY and LAMP; the sport's colours come from the sport theme).
// The special cards a player has earned (lib/cards/moments.js: a goal, a hat trick, a 3-point night, a multi-homer game, 2+ touchdowns, a 100-yard game, a
// called pick that cashed at +750 or longer), read from his REAL stored history by /api/card/earned: the newest three as small tiles and "+N more".
// A player with none gets NO section at all (nothing is drawn, nothing reserves space), and the shelf sits at the END of his page, so the first useful
// row never moves. Tap a tile to open the card: tap the card (or the button) to flip to his stat-table back, save it as a picture.
//   - the tiles and every button are >= 44px; Escape closes the sheet; the sheet scrolls on a short screen (landscape) and respects the safe areas
//   - the pictures are the site's own image routes (/api/card/special, /api/card/image): the card is drawn once, on the server
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSportTheme } from '../SportTheme'
import { isHiddenSport } from '../../lib/routes'
import { CARD_SPORTS } from '../../lib/card/core'
import { downloadCard, slug, stamp } from '../../lib/cards/saveCard'

const specialUrl = (c, w) => `/api/card/special?moment=${encodeURIComponent(c.moment)}&id=${encodeURIComponent(c.id)}&w=${w}`
const backUrl = (sport, id) => `/api/card/image?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(String(id))}&side=back&w=720`
const SHOWN = 3

function Sheet({ c, sport, id, name, onClose }) {
  const { C, accent } = useSportTheme()
  const [side, setSide] = useState('front')
  const [badBack, setBadBack] = useState(false)
  const [loaded, setLoaded] = useState({})
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    const t = setTimeout(() => { try { ref.current?.focus({ preventScroll: true }) } catch { /* ignore */ } }, 30)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey, true) }
  }, [onClose])
  const btn = { minHeight: 44, flex: 1, borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 13, fontWeight: 800, cursor: 'pointer' }
  const showBack = side === 'back'
  return createPortal(
    <div onClick={(e) => { e.stopPropagation(); onClose() }} role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 430, background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'safe center', justifyContent: 'center', overflowY: 'auto', overscrollBehavior: 'contain', padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))' }}>
      <div role="dialog" aria-modal="true" aria-label={`${name || 'Player'}: ${c.kicker}`} onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: 'auto', width: 'min(100%, 440px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
          <span style={{ color: C.text2, fontSize: 13, fontWeight: 700 }}>{`${c.tierWord} · ${c.kicker} · ${c.dayWord}`}</span>
          <button ref={ref} type="button" onClick={onClose} aria-label="Close the card" style={{ minWidth: 44, minHeight: 44, borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>{'✕'}</button>
        </div>
        <div style={{ position: 'relative', width: `min(100%, calc((100dvh - 190px) * 0.8))`, minWidth: 220, aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden', background: C.bg3 }}>
          {showBack && !badBack
            ? <img key="back" src={backUrl(sport, id)} alt={`${name || 'Player'}: the stat-table back of his card`} onError={() => setBadBack(true)} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} />
            : !showBack
              ? <img key="front" src={specialUrl(c, 720)} alt={`${name || 'Player'}: ${c.kicker}, a ${c.tierWord} card`} onLoad={() => setLoaded((l) => ({ ...l, f: true }))} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', opacity: loaded.f ? 1 : 0, transition: 'opacity .2s' }} />
              : null}
          {(showBack && badBack) || (!showBack && !loaded.f) ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: C.text2, fontSize: 14, lineHeight: 1.4 }}>
              {showBack && badBack ? 'His stat-table card is not available today. Cards are drawn only from a real board and real stats.' : 'Drawing the card…'}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button type="button" aria-pressed={!showBack} onClick={() => setSide('front')} style={{ ...btn, color: !showBack ? accent : C.text2, borderColor: !showBack ? accent : C.border2 }}>Moment card</button>
          <button type="button" aria-pressed={showBack} onClick={() => { setBadBack(false); setSide('back') }} style={{ ...btn, color: showBack ? accent : C.text2, borderColor: showBack ? accent : C.border2 }}>Stat table</button>
          <button type="button" onClick={() => downloadCard(showBack ? backUrl(sport, id).replace('w=720', 'w=1080') : specialUrl(c, 1080), `${slug(name, 'player')}-${slug(c.moment)}_${stamp(c.day)}${showBack ? '-back' : ''}.png`)} aria-label="Save this card as a picture" style={btn}>{'\u{1F4F8} Save'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The shelf. Draws nothing until the server says he has earned a card. */
export default function CardsEarned({ sport, id, name = '' }) {
  const { C, accent } = useSportTheme()
  const [shelf, setShelf] = useState(null)
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState(null)
  const live = CARD_SPORTS.includes(String(sport)) && !isHiddenSport(sport) && id != null && id !== ''
  useEffect(() => {
    if (!live) return undefined
    let on = true
    setShelf(null); setAll(false)
    fetch(`/api/card/earned?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(String(id))}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j && j.total > 0) setShelf(j) }).catch(() => {})
    return () => { on = false }
  }, [live, sport, id])
  if (!live || !shelf) return null
  const shown = all ? shelf.cards : shelf.cards.slice(0, SHOWN)
  const more = shelf.total - SHOWN
  return (
    <section aria-label="Cards earned" style={{ margin: '16px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: accent }}>CARDS EARNED</span>
        <span style={{ fontSize: 12, color: C.text3 }}>{`${shelf.total} from his real games`}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {shown.map((c) => (
          <button key={`${c.moment}:${c.id}`} type="button" onClick={(e) => { e.stopPropagation(); setOpen(c) }} aria-haspopup="dialog" aria-label={`Open the ${c.tierWord} card: ${c.kicker}, ${c.dayWord}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 'calc((100% - 16px) / 3)', maxWidth: 160, minWidth: 96, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: C.text }}>
            <img src={specialUrl(c, 360)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 5', display: 'block', borderRadius: 8, background: C.bg3, border: `1px solid ${C.border2}` }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: accent, lineHeight: 1.2 }}>{c.tierWord}</span>
            <span style={{ fontSize: 12, color: C.text2, lineHeight: 1.25 }}>{`${c.kicker} · ${c.dayWord}`}</span>
          </button>
        ))}
      </div>
      {more > 0 && !all ? (
        <button type="button" onClick={() => setAll(true)} style={{ marginTop: 8, minHeight: 44, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: accent, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{`+${more} more`}</button>
      ) : null}
      {open ? <Sheet c={open} sport={sport} id={id} name={name} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}
