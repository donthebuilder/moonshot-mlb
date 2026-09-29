'use client'
import { useEffect, useState } from 'react'
import { nameOf, teamOf, oppOf } from '../../lib/player'
import { useSportTheme } from '../SportTheme'

// THE CARD'S TAB ROW AND PEER ARROWS, SHARED (2026-09-29, player cards step 5).
// Moved verbatim out of components/PlayerModal.js so TUDDY's card stops
// carrying its own copies (it had a TabBtn and a Navigator without the game
// grouping). Colours come from the sport theme (components/SportTheme.js):
// MOONSHOT has none set, so its orange and its markup are unchanged.
// idOf: how the sport keys a player (MOONSHOT: numeric id; TUDDY: gsis string).
// noun: the word in the tooltips ('hitter' on MOONSHOT).
const mlbIdOf = (x) => Number(x?.player_id ?? x?.id)

export function TabBtn({ active, onClick, children }) {
  const { C, accent } = useSportTheme()
  return (
    <button onClick={onClick} style={{
      padding: '5px 13px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
      border: `1px solid ${active ? accent : C.border}`,
      background: active ? `${accent}22` : 'transparent',
      color: active ? accent : C.text3,
      whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

// ── 👥 THE NAVIGATOR (2026-08-09, Donovan: "in the player modal we should be
// able to change players if need to, or at least access other players") ──────
//
// Opening a card used to be a dead end: to compare two hitters you closed the
// modal, found the board you came from, scrolled back to where you were and
// opened the next one. Three of those four steps are the site's fault.
//
// Two ways through, because there are two different intentions:
//   ‹ › walks the list you CAME FROM, in its order. If you opened Murakami
//       from the HR board at #3, › is #4 on that board — the ranking is the
//       thing you were reading, so it's the thing the arrows follow.
//   🔍  jumps to anyone on the slate by name, for when you already know who
//       you want and the list you're in doesn't contain him.
//
// Arrow keys drive the same thing, and are deliberately ignored while a text
// field has focus so typing "Judge" in the search box doesn't skip you two
// hitters sideways on the 'e'.
export function Navigator({ peers, cur, onNavigate, idOf = mlbIdOf, noun = 'hitter' }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  // 👥 THE OTHER DUGOUT (2026-08-29, Donovan: "should be easy to select other
  // player from the other team on the player modal"). `peers` is the whole
  // filtered slate list, so the search box already reaches anyone — but
  // finding the guy standing 60'6" away meant typing his name. This groups
  // peers down to just tonight's game and splits them by side, so the swap
  // you actually make constantly (pitcher ↔ the guy he's facing, or hitter ↔
  // hitter) is a tap, not a search.
  const [lineupOpen, setLineupOpen] = useState(false)
  const curId = idOf(cur)
  const idx = peers.findIndex((x) => idOf(x) === curId)
  const go = (d) => {
    if (idx < 0) return
    const next = peers[idx + d]
    if (next) onNavigate(next)
  }

  const curGamePk = cur?.game_pk
  const curTeam = teamOf(cur)
  const curOpp = oppOf(cur)
  // Prefer game_pk (unambiguous, survives a slate with two same-team-name
  // errors); fall back to the team/opponent pair for anything api-only or
  // pre-game-pk in the payload.
  const gameMates = peers.filter((x) => {
    if (x === cur) return false
    if (curGamePk != null && x?.game_pk != null) return x.game_pk === curGamePk
    const xTeam = teamOf(x)
    return xTeam === curTeam || xTeam === curOpp
  })
  const mine = gameMates.filter((x) => teamOf(x) === curTeam)
  const theirs = gameMates.filter((x) => teamOf(x) !== curTeam)
  const hasLineup = mine.length > 0 || theirs.length > 0

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const t = e.target
      // A hitter's name is not a keyboard shortcut.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      go(e.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hits = q.trim().length < 2 ? [] : peers.filter((x) => {
    const nm = nameOf(x).toLowerCase()
    return nm.includes(q.trim().toLowerCase())
  }).slice(0, 8)

  const btn = (enabled) => ({
    background: 'transparent', border: `1px solid ${enabled ? C.border2 : C.border}`,
    color: enabled ? C.text2 : C.text3, borderRadius: 7, padding: '3px 9px',
    fontSize: 13, lineHeight: 1, cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.4, minWidth: 34, minHeight: 32,   // past the 32px tap floor (mobile pass C)
  })

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 5, alignItems: 'center' }}>
      <button onClick={() => go(-1)} disabled={idx <= 0} title={`Previous ${noun} in this list (←)`} style={btn(idx > 0)}>‹</button>
      <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, minWidth: 44, textAlign: 'center' }}>
        {idx >= 0 ? `${idx + 1} / ${peers.length}` : 'off list'}
      </span>
      <button onClick={() => go(1)} disabled={idx < 0 || idx >= peers.length - 1} title={`Next ${noun} in this list (→)`} style={btn(idx >= 0 && idx < peers.length - 1)}>›</button>
      {hasLineup && (
        <button onClick={() => { setLineupOpen((v) => !v); setOpen(false) }}
          title="Everyone else in tonight's game, both sides"
          style={{ ...btn(true), fontSize: 11, borderColor: lineupOpen ? accent : C.border2, color: lineupOpen ? accent : C.text2 }}>
          👥
        </button>
      )}
      <button onClick={() => { setOpen((v) => !v); setLineupOpen(false) }} title={`Jump to any ${noun} on the slate`} style={{ ...btn(true), fontSize: 11 }}>🔍</button>
      {lineupOpen && hasLineup && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 5, width: 260,
          background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 10,
          padding: 8, boxShadow: '0 10px 30px rgba(0,0,0,.5)', maxHeight: 320, overflowY: 'auto',
        }}>
          {[[curTeam, mine], [curOpp || 'Opponent', theirs]].map(([label, list]) => list.length > 0 && (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em',
                padding: '2px 6px', fontFamily: NUM_FONT,
              }}>{label || 'Team'}</div>
              {list.map((x) => (
                <button key={String(x?.player_id ?? x?.id)}
                  onClick={() => { onNavigate(x); setLineupOpen(false) }}
                  className="tap-row"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                    border: 'none', color: C.text2, fontSize: 11, padding: '5px 6px',
                    cursor: 'pointer', borderRadius: 6,
                  }}>
                  {nameOf(x)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 5, width: 230,
          background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 10,
          padding: 7, boxShadow: '0 10px 30px rgba(0,0,0,.5)',
        }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Jump to a ${noun}…`}
            style={{
              width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7,
              padding: '5px 9px', fontSize: 11, color: C.text, outline: 'none', fontFamily: NUM_FONT,
            }} />
          {hits.map((x) => (
            <button key={String(x?.player_id ?? x?.id)}
              onClick={() => { onNavigate(x); setOpen(false); setQ('') }}
              className="tap-row"
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                border: 'none', color: C.text2, fontSize: 11, padding: '5px 6px',
                cursor: 'pointer', borderRadius: 6,
              }}>
              {nameOf(x)} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}>{teamOf(x)}</span>
            </button>
          ))}
          {q.trim().length >= 2 && !hits.length && (
            <div style={{ fontSize: 10, color: C.text3, padding: '6px 6px 2px' }}>Nobody on this slate by that name.</div>
          )}
        </div>
      )}
    </div>
  )
}
