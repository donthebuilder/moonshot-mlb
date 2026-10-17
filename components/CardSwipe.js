'use client'
import { useEffect, useRef, useState } from 'react'
import CallStatusBadge from './CallStatusBadge'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { playerHref } from '../lib/routes'
import { useCallGate } from './MemberGate'
import { lockedFor, storyLockKey } from '../lib/members/gate'
import { CardLockLine } from './MemberGate'

// ONE FULL-WIDTH CARD AT A TIME, SWIPE FOR THE NEXT (Donovan, phone app Today). Each slide is the player's real card (/api/card/image, the renderer the
// X posts use). Tap a card to flip it: the back says why he was called. Images past the second load as they come near. A card that cannot be drawn shows
// the name and his calls as text, never a broken picture. The status word is lib/callStatus's, through CallStatusBadge.
const src = (sport, id, side) => `/api/card/image?sport=${sport}&id=${encodeURIComponent(id)}&side=${side}&w=540`

// MEMBERS LOCK (components/MemberGate.js): the key a board uses for this man, so the free four here are the tables' free four
const keyOf = (sport, it) => storyLockKey(sport, it.id, it.gameId)

function Slide({ sport, item, index, flipped, onFlip, gate = null }) {
  const [bad, setBad] = useState(false)
  // a CALLED, not-started pick the viewer may not see: the real card image (rendered by the server) is not asked for, and the roles are not said
  const locked = Boolean(gate) && lockedFor({ status: item.status || 'called', started: gate.started, graded: gate.graded, key: gate.key, free: gate.free, memberState: 'free' })
  const [when, setWhen] = useState('')
  useEffect(() => {
    try { if (item.firstPitch) setWhen(new Date(item.firstPitch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) } catch { setWhen('') }
  }, [item.firstPitch])
  return (
    <li style={{ flex: '0 0 100%', minWidth: 0, scrollSnapAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text2 }}>
        <CallStatusBadge status={item.status || 'called'} size={11} gate={gate} />
        {item.roles?.length && !locked ? <span>{item.roles.join(' · ')}</span> : null}
        {when ? <span style={{ color: C.text3 }}>{when}</span> : null}
      </div>
      {locked ? (
        <div style={{ width: '100%', maxWidth: 360, aspectRatio: '4 / 5', display: 'grid', placeItems: 'center', border: `1px solid ${C.border}`, borderRadius: 14, background: C.bg2, textAlign: 'center', padding: 16 }}>
          <div><a href={playerHref(sport, item.id)} style={{ display: 'inline-block', minHeight: 44, lineHeight: '44px', fontSize: TYPE.title, fontWeight: 800, color: C.text, textDecoration: 'none' }}>{item.name}</a></div>
        </div>
      ) : bad ? (
        <div style={{ width: '100%', maxWidth: 360, aspectRatio: '4 / 5', display: 'grid', placeItems: 'center', border: `1px solid ${C.border}`, borderRadius: 14, background: C.bg2, textAlign: 'center', padding: 16 }}>
          <div><a href={playerHref(sport, item.id)} style={{ display: 'inline-block', minHeight: 44, lineHeight: '44px', fontSize: TYPE.title, fontWeight: 800, color: C.text, textDecoration: 'none' }}>{item.name}</a><div style={{ color: C.text2, fontSize: TYPE.body, marginTop: 4 }}>{item.roles?.length ? `Called: ${item.roles.join(', ')}` : ''}</div></div>
        </div>
      ) : (
        <button type="button" onClick={onFlip} aria-label={`${item.name}, ${flipped ? 'showing why. Tap for the front' : 'tap to see why'}`}
          style={{ padding: 0, border: 'none', background: C.bg2, color: C.text3, borderRadius: 14, cursor: 'pointer', width: '100%', maxWidth: 360, aspectRatio: '4 / 5' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src(sport, item.id, flipped ? 'back' : 'front')} alt={`${item.name}'s card`} width={540} height={675} loading={index < 2 ? 'eager' : 'lazy'} onError={() => setBad(true)}
            style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '4 / 5', borderRadius: 14 }} />
        </button>
      )}
      {gate && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ justifyContent: 'center' }} />}
      <div style={{ color: C.text3, fontSize: TYPE.body }}>{locked || bad ? '' : flipped ? 'Why he was called. Tap to flip back.' : 'Tap the card to see why.'}</div>
    </li>
  )
}

export default function CardSwipe({ sport = 'mlb', items = [] }) {
  const rail = useRef(null)
  const [at, setAt] = useState(0)
  const [flip, setFlip] = useState({})
  const gateOf = useCallGate({ rows: items, statusOf: (it) => it.status || 'called', keyOf: (it) => keyOf(sport, it), timeOf: (it) => it.firstPitch ?? null, rankOf: (it) => items.indexOf(it) })
  const onScroll = () => {
    const el = rail.current
    if (el && el.clientWidth) setAt(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / el.clientWidth))))
  }
  const go = (i) => { const el = rail.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' }) }
  if (!items.length) return null
  return (
    <div style={{ minWidth: 0, maxWidth: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 8px', fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text2 }}>
        <span>{at + 1} OF {items.length}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" aria-label="Previous card" disabled={at === 0} onClick={() => go(at - 1)} style={navBtn(at === 0)}>‹</button>
          <button type="button" aria-label="Next card" disabled={at === items.length - 1} onClick={() => go(at + 1)} style={navBtn(at === items.length - 1)}>›</button>
        </span>
      </div>
      <ul ref={rail} onScroll={onScroll} aria-label="Tonight's calls" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', gap: 0, maxWidth: '100%' }}>
        {items.map((it, i) => (
          <Slide key={it.id} sport={sport} item={it} index={i} gate={gateOf ? gateOf(it) : null} flipped={Boolean(flip[it.id])} onFlip={() => setFlip((f) => ({ ...f, [it.id]: !f[it.id] }))} />
        ))}
      </ul>
    </div>
  )
}

const navBtn = (off) => ({ minWidth: 44, minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2, color: off ? C.text3 : C.text, fontSize: 20, fontWeight: 800, cursor: off ? 'default' : 'pointer' })
