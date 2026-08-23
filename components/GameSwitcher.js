'use client'
import { useEffect, useRef } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { useIsPhone } from './MobileFold'

// ══ THE BOTTOM GAME SWITCHER ════════════════════════════════════════════════
//
// Donovan, 2026-08-23: "games on mobile is hella scrolling and if you want to
// change the game you have to go all the way back up to the top idk everyhing
// on the games for moble needs to be fixed."
//
// He is describing a real, structural thing, not a preference. The Games tab
// puts the selector (GameStrip) at the TOP and the open game's whole read —
// deep dive, lineups, slot matchups, panels — BELOW it. On a phone that read
// is several screens tall, so the moment you have scrolled far enough to
// actually use it, the only control that changes which game you are reading
// is off-screen behind everything you just scrolled past. Every game switch
// costs a full scroll up and a full scroll back down.
//
// Asked where the switcher should live, he said: "1 at the bottom."
//
// So: a fixed rail on the bottom edge, PHONE ONLY, holding every game in
// first-pitch order with the open one lit. It is thumb-height by construction,
// it never scrolls away, and ‹ › step through the slate one game at a time
// without aiming at anything. The active chip scrolls itself into view inside
// the rail, so "where am I in the slate" is answered without hunting.
//
// PHONE ONLY, and deliberately. On a desktop the strip at the top is visible
// beside the read and a bar welded to the bottom of the viewport would be
// chrome solving a problem that does not exist there. useIsPhone is the honest
// tool for this (see MobileFold's own note on why a media query cannot do it).
//
// The page has to give the rail its room: MobileCSS adds bottom padding to
// .dashboard-main so the last card can still be scrolled clear of it, and the
// rail carries env(safe-area-inset-bottom) for the home-bar generation.

const timeText = (t) => {
  if (!t) return 'TBD'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')
}

export default function GameSwitcher({ games = [], activeGame, onSelect, live = null }) {
  const isPhone = useIsPhone(760)
  const activeRef = useRef(null)

  // Centre the open game inside the rail whenever it changes — including when
  // it changed because ‹ › moved it, which is the case that would otherwise
  // walk the lit chip straight off the edge.
  useEffect(() => {
    const el = activeRef.current
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) } catch { /* older Safari */ }
    }
  }, [activeGame, isPhone])

  if (!isPhone || !games.length || activeGame == null) return null

  const idx = games.findIndex((g) => g.game_pk === activeGame)
  const step = (d) => {
    const next = games[idx + d]
    if (next) onSelect(next.game_pk)
  }

  const arrow = (label, d, disabled) => (
    <button
      onClick={disabled ? undefined : () => step(d)}
      aria-label={d < 0 ? 'Previous game' : 'Next game'}
      style={{
        flexShrink: 0, width: 30, height: 34, borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${C.border}`, background: 'transparent',
        color: disabled ? C.border2 : C.text2, fontSize: 15, fontWeight: 900, lineHeight: 1,
      }}
    >{label}</button>
  )

  return (
    <div
      className="game-switcher"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90,
        background: C.bg, borderTop: `1px solid ${C.border2}`,
        boxShadow: `0 -10px 24px -14px ${alpha(C.orange, 0.55)}`,
        padding: '7px 8px calc(7px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', alignItems: 'center', gap: 7,
      }}
    >
      {arrow('‹', -1, idx <= 0)}
      <div
        className="game-switcher-rail"
        style={{
          flex: 1, minWidth: 0, display: 'flex', gap: 6, overflowX: 'auto',
          WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        }}
      >
        {games.map((g) => {
          const on = g.game_pk === activeGame
          const l = live?.[g.game_pk] || null
          // A game in progress says the score; one that has not started says
          // its first pitch. Both are what you would ask the rail for.
          const sub = l && (l.away_score != null || l.home_score != null)
            ? `${l.away_score ?? 0}-${l.home_score ?? 0}`
            : timeText(g.game_time)
          return (
            <button
              key={g.game_pk}
              ref={on ? activeRef : undefined}
              onClick={() => onSelect(g.game_pk)}
              title={`${g.away || '—'} @ ${g.home || '—'}`}
              style={{
                flexShrink: 0, cursor: 'pointer', borderRadius: 11, padding: '5px 10px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? alpha(C.orange, 0.14) : 'transparent',
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
                letterSpacing: '-.02em', color: on ? C.orange : C.text2,
              }}>{g.away || '—'}<span style={{ opacity: 0.5, fontWeight: 400 }}>@</span>{g.home || '—'}</span>
              <span style={{
                fontSize: 8, fontFamily: NUM_FONT, fontWeight: 700, whiteSpace: 'nowrap',
                color: on ? C.text2 : C.text3,
              }}>{sub}</span>
            </button>
          )
        })}
      </div>
      {arrow('›', 1, idx < 0 || idx >= games.length - 1)}
    </div>
  )
}
