'use client'
// THE "CARDS EARNED" SHELF (2026-10-12; shared by MOONSHOT, TUDDY and LAMP; the sport's colours come from the sport theme).
// The special cards a player has earned (lib/cards/moments.js: a goal, a hat trick, a 3-point night, a multi-homer game, 2+ touchdowns, a 100-yard game, a
// called pick that cashed at +750 or longer), read from his REAL stored history by /api/card/earned: RAREST FIRST then newest: the top three as small tiles, "+N more" opens his page in the BINDER, and BASE cards (a plain goal) are folded under "Base cards (N)".
// A player with none gets NO section at all (nothing is drawn, nothing reserves space), and the shelf sits at the END of his page, so the first useful
// row never moves. Tap a tile to open the card: tap the card (or the button) to flip to his stat-table back, save it as a picture.
//   - the tiles and every button are >= 44px; Escape closes the sheet; the sheet scrolls on a short screen (landscape) and respects the safe areas
//   - the pictures are the site's own image routes (/api/card/special, /api/card/image): the card is drawn once, on the server
import { useEffect, useState } from 'react'
import { useSportTheme } from '../SportTheme'
import { binderHref } from '../../lib/routes'
import { useSportOpen } from '../../lib/useVisibleSports'
import { CARD_SPORTS, PREVIEW_CARD_SPORTS } from '../../lib/card/core'
import CardSheet, { specialUrl } from './CardSheet'

const SHOWN = 3

/** The shelf. Draws nothing until the server says he has earned a card. */
export default function CardsEarned({ sport, id, name = '' }) {
  const { C, accent } = useSportTheme()
  const [shelf, setShelf] = useState(null)
  const [base, setBase] = useState(false)
  const [open, setOpen] = useState(null)
  const allowed = useSportOpen(sport) === true   // BUCKETS: only once its gate has let this visitor in (admin, early access, public)
  const live = (CARD_SPORTS.includes(String(sport)) || PREVIEW_CARD_SPORTS.includes(String(sport))) && allowed && id != null && id !== ''
  useEffect(() => {
    if (!live) return undefined
    let on = true
    setShelf(null); setBase(false)
    fetch(`/api/card/earned?sport=${encodeURIComponent(sport)}&id=${encodeURIComponent(String(id))}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (on && j && j.total > 0) setShelf(j) }).catch(() => {})
    return () => { on = false }
  }, [live, sport, id])
  if (!live || !shelf) return null
  // RAREST FIRST, then newest (the server sends them that way); BASE cards are folded away
  const rare = shelf.cards.filter((c) => c.tier !== 'base')
  const plain = shelf.cards.filter((c) => c.tier === 'base')
  const shown = rare.slice(0, SHOWN)
  const more = rare.length - SHOWN
  const tile = (c) => (
    <button key={`${c.moment}:${c.id}`} type="button" onClick={(e) => { e.stopPropagation(); setOpen(c) }} aria-haspopup="dialog" aria-label={`Open the ${c.tierWord} card: ${c.kicker}, ${c.dayWord}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 'calc((100% - 16px) / 3)', maxWidth: 160, minWidth: 96, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: C.text }}>
      <img src={specialUrl(c, 360)} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '5 / 7', display: 'block', borderRadius: 8, background: C.bg3, border: `1px solid ${C.border2}` }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: accent, lineHeight: 1.2 }}>{c.tierWord}</span>
      <span style={{ fontSize: 12, color: C.text2, lineHeight: 1.25 }}>{`${c.kicker} · ${c.dayWord}`}</span>
    </button>
  )
  const linkBtn = { display: 'inline-flex', alignItems: 'center', marginTop: 8, minHeight: 44, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: accent, fontSize: 13, fontWeight: 800, cursor: 'pointer', textDecoration: 'none' }
  return (
    <section aria-label="Cards earned" style={{ margin: '16px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: accent }}>CARDS EARNED</span>
        <span style={{ fontSize: 12, color: C.text3 }}>{`${shelf.total} from his real games · rarest first`}</span>
      </div>
      {shown.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{shown.map(tile)}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {more > 0 ? <a href={binderHref(sport, id)} style={linkBtn}>{`+${more} more in his binder`}</a> : null}
        {plain.length && !base ? <button type="button" aria-expanded={false} onClick={() => setBase(true)} style={{ ...linkBtn, color: C.text2 }}>{`Base cards (${plain.length})`}</button> : null}
      </div>
      {base && plain.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{plain.slice(0, 12).map(tile)}</div> : null}
      {base && plain.length > 12 ? <a href={binderHref(sport, id)} style={linkBtn}>{`+${plain.length - 12} more base cards in his binder`}</a> : null}
      {open ? <CardSheet c={open} sport={sport} id={id} name={name} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}
