'use client'
import { useMemo, useState } from 'react'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'
import { groupCalled, calledText, CALLED_PER_CARD } from '../lib/calledList'
import { nbaCalled, nhlCalled, nflCalled } from '../lib/calledGather'
import { useMemberState } from './MemberGate'
import { withMemberFeed } from '../lib/members/boardGate'
import { useGameCalls } from './nfl/GameCalls'
import ShareCardButton from './card/ShareCardButton'

// 📋 COPY CALLED + 🃏 CARDS (2026-10-25, Donovan: "export all the names ... of all the players that are called for each game ... do the
// text first", then "a Card button beside Copy called ... one card per game"). Two chips on a slate:
//   Copy called  every CALLED man of the day, by game, with the lanes he is CALLED in, as text (lib/calledList.js)
//   Cards        one CALLED card per game (lib/cards/calledCard.js, /api/card/called), each with a preview and the site's Save button
// Both read lib/calledGather.js -- the boards' own statuses -- so the text and the picture cannot disagree. MEMBERS ONLY: before the
// lock a CALLED pick is members' (components/MemberGate); the card route checks it again on the server.
// The text opens in a panel with a Copy button: a phone (iOS Safari) refuses a copy that waits on a fetch, so the copy is its own
// tap; where the browser allows it, the first tap copies too.

// a member's export reads the full board feed (m=1, lib/members/boardGate.js); everyone else the gated one
const getJSONFor = (member) => (u) => fetch(withMemberFeed(u, member)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
// the sports read here, by key (the registry rule: no sport ternaries)
const READERS = { nba: (date, member) => nbaCalled(getJSONFor(member), date), nhl: (date, member) => nhlCalled(getJSONFor(member), date) }

/** TUDDY's: its week file + pick card are already on the page; the game calls are read here (NFL only). */
export function NflCalledExport({ data, picks, C, NUM_FONT, accent }) {
  const gameCalls = useGameCalls()
  const prepared = useMemo(() => (data ? nflCalled(data, picks, gameCalls) : null), [data, picks, gameCalls])
  return <CalledExport sport="nfl" prepared={prepared} C={C} NUM_FONT={NUM_FONT} accent={accent} />
}

/** sport: 'nba' | 'nhl' (read here, for `date`; null = tonight), or `prepared` entries (TUDDY's NflCalledExport). */
export default function CalledExport({ sport, date = null, prepared = null, C, NUM_FONT, accent }) {
  const member = useMemberState() === 'member'
  const [open, setOpen] = useState(null)      // null | 'text' | 'cards'
  const [got, setGot] = useState(null)        // { r, games, text }
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!member) return null

  const gather = async () => {
    const r = prepared || (READERS[sport] ? await READERS[sport](date, member) : null)
    const games = groupCalled(r?.entries || [])
    return { r, games, text: calledText({ head: r?.head || '', games, weekday: Boolean(r?.weekday) }) }
  }
  const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1800) }
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); flash() } catch { /* the panel still shows it */ } }
  const show = async (which) => {
    if (open === which) { setOpen(null); return }
    setOpen(which)
    if (got) return
    setBusy(true)
    const p = gather()
    if (which === 'text') {
      // inside the tap: where the browser lets a copy wait on the fetch (ClipboardItem with a promise), it copies now
      try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItem({ 'text/plain': p.then((x) => new Blob([x.text || ''], { type: 'text/plain' })) })])
          flash()
        }
      } catch { /* copy from the panel */ }
    }
    setGot(await p); setBusy(false)
  }
  const cardUrl = (g, part, w) => `/api/card/called?${new URLSearchParams({ sport, game: g.key, part: String(part), ...(date ? { date } : {}), ...(w ? { w: String(w) } : {}) })}`
  const slug = (t) => String(t).toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')
  const panel = { width: 'min(92vw, 420px)', border: `1px solid ${C.border2}`, borderRadius: 10, background: C.bg2, padding: 10, display: 'grid', gap: 8 }

  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className={FLAT_CHIP_CLASS} onClick={() => show('text')} aria-expanded={open === 'text'} style={flatChip(open === 'text', accent, C, NUM_FONT)}>
          {busy && open === 'text' ? 'Reading…' : copied ? 'Copied' : '📋 Copy called'}
        </button>
        <button type="button" className={FLAT_CHIP_CLASS} onClick={() => show('cards')} aria-expanded={open === 'cards'} style={flatChip(open === 'cards', accent, C, NUM_FONT)}>
          {busy && open === 'cards' ? 'Reading…' : '🃏 Cards'}
        </button>
      </div>
      {open === 'text' && got ? (
        <div style={panel}>
          <pre style={{ margin: 0, maxHeight: '50vh', overflow: 'auto', whiteSpace: 'pre-wrap', font: `600 12px/1.45 ${NUM_FONT}`, color: C.text }}>{got.text || 'Nobody is CALLED on this day yet.'}</pre>
          {got.text ? <button type="button" className={FLAT_CHIP_CLASS} onClick={() => copy(got.text)} style={{ ...flatChip(copied, accent, C, NUM_FONT), justifySelf: 'start' }}>{copied ? 'Copied' : 'Copy text'}</button> : null}
        </div>
      ) : null}
      {open === 'cards' && got ? (
        <div style={{ ...panel, maxHeight: '70vh', overflow: 'auto' }}>
          {!got.games.length ? <span style={{ fontSize: 12, color: C.text3 }}>Nobody is CALLED on this day yet.</span> : null}
          {got.games.flatMap((g) => {
            const parts = Math.max(1, Math.ceil(g.men.length / CALLED_PER_CARD))
            return Array.from({ length: parts }, (_, i) => (
              <div key={`${g.key}-${i}`} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
                <img src={cardUrl(g, i + 1, 360)} alt={`CALLED card, ${g.title}`} width={96} height={120} loading="lazy" style={{ borderRadius: 6, background: C.bg3, objectFit: 'cover' }} />
                <div style={{ display: 'grid', gap: 6, minWidth: 0, justifyItems: 'start' }}>
                  <span style={{ font: `800 13px/1.2 ${NUM_FONT}`, color: C.text }}>{g.title}{parts > 1 ? ` · ${i + 1} of ${parts}` : ''}</span>
                  <span style={{ fontSize: 12, color: C.text3 }}>{g.men.length} CALLED</span>
                  <ShareCardButton sport={sport} url={cardUrl(g, i + 1)} filename={`called-${sport}-${slug(g.title)}${parts > 1 ? `-${i + 1}` : ''}.png`} what="this card" />
                </div>
              </div>
            ))
          })}
        </div>
      ) : null}
    </div>
  )
}
