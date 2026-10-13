'use client'
// A CLUB'S "CARDS" SECTION (2026-10-12): the special cards its players earned in the last 30 days, rarest first then newest, from /api/card/recent (the league list,
// kept five minutes on the CDN; this reads the same list the Binder's ALL CARDS tab reads, filtered to the club). Real stored history only: a club with none says so.
// Slot of the shared team page (lib/team/registry.js 'cards'); BASE cards fold under "Base cards (N)". Tap a card for the sheet.
import { useEffect, useMemo, useState } from 'react'
import { useSportTheme } from '../SportTheme'
import { groupByRarity, cardKey, SEEN_KEY, parseSeen, isNew } from '../../lib/cards/binder'
import { binderHref } from '../../lib/routes'
import CardSheet from '../player/CardSheet'
import { Tile } from './Binder'

const PREVIEW = 6

export default function TeamCards({ sport, team }) {
  const { C, accent, NUM_FONT } = useSportTheme()
  const [cards, setCards] = useState(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(null)
  const [all, setAll] = useState(false)
  const [base, setBase] = useState(false)
  const [seen, setSeen] = useState(null)
  useEffect(() => {
    let on = true
    setCards(null); setFailed(false)
    try { setSeen(parseSeen(localStorage.getItem(SEEN_KEY))) } catch { /* no storage */ }
    fetch(`/api/card/recent?sport=${encodeURIComponent(sport)}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('recent')))).then((j) => { if (on) setCards((j.cards || []).filter((c) => String(c.team).toUpperCase() === String(team).toUpperCase())) }).catch(() => { if (on) setFailed(true) })
    return () => { on = false }
  }, [sport, team])
  const sections = useMemo(() => groupByRarity(cards || []), [cards])
  if (failed) return <p style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>The cards could not be loaded just now.</p>
  if (!cards) return <p style={{ color: C.text3, fontSize: 13 }}>Opening the binder…</p>
  if (!cards.length) return <p style={{ color: C.text2, fontSize: 13, lineHeight: 1.5 }}>No card has been earned by a {team} player in the last 30 days. A card is earned in a real game: a hat trick, a multi-homer game, 2+ touchdowns, a 100-yard game, an overtime goal.</p>
  const rare = sections.filter((s) => s.tier !== 'base')
  const plain = sections.find((s) => s.tier === 'base')
  const flat = rare.flatMap((s) => s.cards)
  const shown = all ? flat : flat.slice(0, PREVIEW)
  const btn = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2, color: accent, textDecoration: 'none', font: `800 12px/1 ${NUM_FONT}`, letterSpacing: '.05em', cursor: 'pointer' }
  return (
    <div data-team-cards style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ color: C.text2, fontSize: 13 }}>{`${cards.length} ${cards.length === 1 ? 'card' : 'cards'} in the last 30 days · rarest first`}</div>
      {shown.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{shown.map((c) => <Tile key={cardKey(c)} c={c} C={C} accent={accent} NUM_FONT={NUM_FONT} fresh={isNew(c, seen)} onOpen={() => setOpen(c)} />)}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {flat.length > PREVIEW && !all ? <button type="button" onClick={() => setAll(true)} style={btn}>{`+${flat.length - PREVIEW} more`}</button> : null}
        {plain && !base ? <button type="button" onClick={() => setBase(true)} style={{ ...btn, color: C.text2 }}>{`Base cards (${plain.cards.length})`}</button> : null}
        <a href={binderHref(sport)} style={btn}>Open the binder ›</a>
      </div>
      {base && plain ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{plain.cards.slice(0, 12).map((c) => <Tile key={cardKey(c)} c={c} C={C} accent={accent} NUM_FONT={NUM_FONT} fresh={false} onOpen={() => setOpen(c)} />)}</div> : null}
      {open ? <CardSheet c={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}
