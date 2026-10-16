'use client'
// THE CARD SHEET (2026-10-12; lifted out of CardsEarned so the player shelf, the BINDER and a club's Cards section open a card the same way).
// A special card (lib/cards/moments.js) at full size: tap the card (or the button) to flip to the player's stat-table back, save it as a picture, and go to the
// player's page or the game. Escape closes it; it scrolls on a short screen (landscape) and respects the safe areas; every control is >= 44px.
//   props: c = a card summary { moment, id, sport, tierWord, kicker, dayWord, day, playerId, name, team, opp, game }
//          sport / id / name = whose stat-table back to draw (default: the card's own player)
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSportTheme } from '../SportTheme'
import { downloadCard, slug, stamp } from '../../lib/cards/saveCard'
import { playerHref, gameHref, teamHref } from '../../lib/routes'

export const specialUrl = (c, w) => `/api/card/special?moment=${encodeURIComponent(c.moment)}&id=${encodeURIComponent(c.id)}&w=${w}`
// the collectible back of THIS card (lib/cards/collect/collectBack.js): face 'stats' = his stat table, 'brand' = the shared CALLED IT back; both print the card's real id and issue number
export const backFaceUrl = (c, face, w) => `/api/card/special?moment=${encodeURIComponent(c.moment)}&id=${encodeURIComponent(c.id)}&side=back&face=${face}&w=${w}`
const backUrl = (sport, id) => `/api/card/image?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(String(id))}&side=back&w=720`

export default function CardSheet({ c, sport = null, id = null, name = '', onClose }) {
  const { C, accent } = useSportTheme()
  const who = { sport: sport || c.sport, id: id ?? c.playerId, name: name || c.name }
  const [side, setSide] = useState('front')
  const [badBack, setBadBack] = useState(false)
  const [legacy, setLegacy] = useState(false)   // the collectible stat-table back did not draw: the player's own back (old shape) stands in
  const [loaded, setLoaded] = useState({})
  const [stamps, setStamps] = useState([])
  const ref = useRef(null)
  // the situation stamps drawn on the card (lib/cards/situations.js), each with its one-line explanation: the card is a picture, so the words live here
  useEffect(() => {
    let on = true
    if (!c.day || !c.playerId) return undefined
    fetch(`/api/card/stamps?sport=${encodeURIComponent(c.sport)}&id=${encodeURIComponent(String(c.playerId))}&day=${encodeURIComponent(c.day)}&phase=post`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j && Array.isArray(j.stamps)) setStamps(j.stamps) }).catch(() => {})
    return () => { on = false }
  }, [c.sport, c.playerId, c.day])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    const t = setTimeout(() => { try { ref.current?.focus({ preventScroll: true }) } catch { /* ignore */ } }, 30)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey, true) }
  }, [onClose])
  const btn = { minHeight: 44, flex: '1 1 0', minWidth: 0, padding: '0 4px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }
  const showBack = side === 'back' || side === 'brand'
  const isBrand = side === 'brand'
  const collectBack = Boolean(c.moment && c.id) && !legacy
  const backSrc = (w) => (isBrand ? backFaceUrl(c, 'brand', w) : collectBack ? backFaceUrl(c, 'stats', w) : backUrl(who.sport, who.id).replace('w=720', `w=${w}`))
  const pHref = who.id != null && who.id !== '' ? playerHref(who.sport, who.id) : null
  const gHref = c.game ? gameHref(who.sport, c.game) : null
  const tHref = c.team ? teamHref(who.sport, c.team) : null
  return createPortal(
    <div onClick={(e) => { e.stopPropagation(); onClose() }} role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 430, background: 'rgba(0,0,0,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'safe center', justifyContent: 'center', overflowY: 'auto', overscrollBehavior: 'contain', padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))' }}>
      <div role="dialog" aria-modal="true" aria-label={`${who.name || 'Player'}: ${c.kicker}`} onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, margin: 'auto', width: 'min(100%, 440px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
          <span style={{ color: C.text2, fontSize: 13, fontWeight: 700 }}>{`${c.tierWord} · ${c.kicker} · ${c.dayWord}`}</span>
          <button ref={ref} type="button" onClick={onClose} aria-label="Close the card" style={{ minWidth: 44, minHeight: 44, borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text, fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>{'✕'}</button>
        </div>
        <div style={{ position: 'relative', width: `min(100%, calc((100dvh - 250px) * 0.714))`, minWidth: 220, aspectRatio: '5 / 7', borderRadius: 14, overflow: 'hidden', background: C.bg3 }}>
          {showBack && !badBack
            ? <img key={`back-${side}-${collectBack}`} src={backSrc(720)} alt={isBrand ? 'The CALLED IT back of the card' : `${who.name || 'Player'}: the stat-table back of his card`} onError={() => { if (!isBrand && collectBack) setLegacy(true); else setBadBack(true) }} onClick={() => setSide('front')} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', cursor: 'pointer' }} />
            : !showBack
              ? <img key="front" src={specialUrl(c, 720)} alt={`${who.name || 'Player'}: ${c.kicker}, a ${c.tierWord} card`} onLoad={() => setLoaded((l) => ({ ...l, f: true }))} onClick={() => { setBadBack(false); setSide('back') }} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', opacity: loaded.f ? 1 : 0, transition: 'opacity .2s', cursor: 'pointer' }} />
              : null}
          {(showBack && badBack) || (!showBack && !loaded.f) ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', color: C.text2, fontSize: 14, lineHeight: 1.4 }}>
              {showBack && badBack ? 'His stat-table card is not available today. Cards are drawn only from a real board and real stats.' : 'Drawing the card…'}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button type="button" aria-pressed={!showBack} onClick={() => setSide('front')} style={{ ...btn, color: !showBack ? accent : C.text2, borderColor: !showBack ? accent : C.border2 }}>Front</button>
          <button type="button" aria-pressed={side === 'back'} onClick={() => { setBadBack(false); setSide('back') }} style={{ ...btn, color: side === 'back' ? accent : C.text2, borderColor: side === 'back' ? accent : C.border2 }}>Stat table</button>
          {c.moment && c.id ? <button type="button" aria-pressed={isBrand} onClick={() => { setBadBack(false); setSide('brand') }} style={{ ...btn, color: isBrand ? accent : C.text2, borderColor: isBrand ? accent : C.border2 }}>Card back</button> : null}
          <button type="button" onClick={() => downloadCard(showBack ? backSrc(1080) : specialUrl(c, 1080), `${slug(who.name, 'player')}-${slug(c.moment)}_${stamp(c.day)}${isBrand ? '-calledit' : showBack ? '-back' : ''}.png`)} aria-label="Save this card as a picture" style={btn}>{'\u{1F4F8} Save'}</button>
        </div>
        {stamps.length ? (
          <div data-stamps style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            {stamps.map((x) => (
              <div key={x.key} style={{ color: C.text2, fontSize: 13, lineHeight: 1.4 }}><b style={{ color: C.text }}>{x.text}</b>{` \u00B7 ${x.explain}`}</div>
            ))}
          </div>
        ) : null}
        {pHref || gHref || tHref ? (
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            {pHref ? <a href={pHref} onClick={onClose} style={{ ...btn, color: accent }}>{`${who.name ? who.name.split(' ').slice(-1)[0] : 'Player'}'s page`}</a> : null}
            {gHref ? <a href={gHref} onClick={onClose} style={{ ...btn, color: accent }}>{`The game${c.team && c.opp ? ` · ${c.team}-${c.opp}` : ''}`}</a> : null}
            {tHref ? <a href={tHref} onClick={onClose} style={{ ...btn, color: accent }}>{c.team}</a> : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
