'use client'
import { useEffect, useRef } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { useIsPhone } from './MobileFold'

// ══ THE GAME SWITCHER ═════════════════════════════════════════════════════
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
// Asked where the switcher should live, he first said "1 at the bottom", and
// it shipped welded to the bottom edge. Living with it, 2026-08-23: "on mobile
// the games dial thing at the bottom is no good, it messes with closing the
// app. we have to figure something else out."
//
// He is right, and it is not a taste call. A bar pinned to the bottom edge of
// a phone viewport sits exactly where the OS puts the home-swipe gesture, so
// every attempt to leave the app starts by grabbing our rail. Nothing about
// this rail is worth costing someone the gesture that closes their phone.
//
// Asked where instead, he chose: sticky under the header.
//
// So it is a STICKY element in the page flow now rather than a fixed overlay.
// It takes real layout space directly under the game grid and pins itself at
// the live header height -- var(--hdr-h), which components/Header.js measures
// and writes to the document root on every resize and every condense -- the
// moment you scroll past it. Same rail, same chips, same ‹ › steppers, same
// auto-centring, same phone-only gate. It just lives at the top of the screen,
// where nothing else is competing for the touch, and costs the bottom of the
// viewport nothing at all.
//
// Sticky rather than fixed matters beyond the gesture: a fixed bar overlays
// content forever and needs the page padded around it, which is exactly what
// .dashboard-main was carrying (74px of bottom padding) and what PairTray was
// lifting itself over. A sticky element in flow needs no room made for it
// anywhere, so both of those compensations came out with it.
//
// PHONE ONLY, and deliberately. On a desktop the strip at the top is visible
// beside the read and a second selector would be chrome solving a problem that
// does not exist there. useIsPhone is the honest tool for this (see
// MobileFold's own note on why a media query cannot do it).

const timeText = (t) => {
  if (!t) return 'TBD'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')
}

export default function GameSwitcher({ games = [], activeGame, onSelect, live = null }) {
  const isPhone = useIsPhone(760)
  const activeRef = useRef(null)
  const barRef = useRef(null)

  // Centre the open game inside the rail whenever it changes — including when
  // it changed because ‹ › moved it, which is the case that would otherwise
  // walk the lit chip straight off the edge.
  useEffect(() => {
    const el = activeRef.current
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) } catch { /* older Safari */ }
    }
  }, [activeGame, isPhone])

  // ── THE SECOND FLOOR (2026-08-23) ────────────────────────────────────────
  // This rail is not the only thing that pins under the header: the open
  // game's own section pills (The read / Lineups / Head-to-head / Picks, in
  // tabs/Games.js) stick at the header height too. Two sticky bars at the same
  // offset do not stack, they OVERLAP — caught in a 390px render where the
  // pills sat exactly on top of this rail and hid it completely.
  //
  // So this one publishes its own live height the same way Header.js publishes
  // --hdr-h, and the pills sit at hdr + gsw. It writes 0 when the rail is not
  // rendered (desktop, no slate, no open game), so the pills fall back flush
  // under the header with nothing to compensate for.
  const shown = isPhone && games.length > 0 && activeGame != null
  useEffect(() => {
    const root = typeof document !== 'undefined' ? document.documentElement : null
    if (!root) return undefined
    const write = () => {
      const h = shown && barRef.current ? Math.round(barRef.current.getBoundingClientRect().height) : 0
      root.style.setProperty('--gsw-h', `${h}px`)
    }
    write()
    const ro = (shown && barRef.current && typeof ResizeObserver !== 'undefined')
      ? new ResizeObserver(write) : null
    if (ro) ro.observe(barRef.current)
    return () => {
      if (ro) ro.disconnect()
      // Leaving the tab must not leave a phantom offset behind.
      root.style.setProperty('--gsw-h', '0px')
    }
  }, [shown, games.length])

  if (!shown) return null

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
        flexShrink: 0, width: 28, height: 28, minHeight: 28, borderRadius: 9, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${C.border}`, background: 'transparent',
        color: disabled ? C.border2 : C.text2, fontSize: 15, fontWeight: 900, lineHeight: 1,
      }}
    >{label}</button>
  )

  return (
    <div
      ref={barRef}
      className="game-switcher"
      style={{
        // --hdr-h is written by components/Header.js. The fallback is roughly
        // the condensed bar, so a first paint before the observer has fired
        // still lands under the header rather than sliding beneath the logo.
        position: 'sticky', top: 'var(--hdr-h, 96px)', zIndex: 40,
        margin: '0 -8px 10px', padding: '7px 8px',
        background: C.bg, borderBottom: `1px solid ${C.border2}`,
        boxShadow: `0 10px 24px -16px ${alpha(C.orange, 0.55)}`,
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
                flexShrink: 0, cursor: 'pointer', borderRadius: 999, padding: '4px 10px',
                display: 'flex', alignItems: 'baseline', gap: 5,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? alpha(C.orange, 0.14) : 'transparent',
              }}
            >
              {/* ONE LINE, NOT TWO (2026-08-23). Stacked matchup-over-time
                  made every chip 34px tall and the whole rail 52px — and this
                  bar now shares the top of a phone with the header AND the
                  section pills, so every pixel it spends is a pixel of slate
                  nobody can see. Same two facts, one line, 40px of bar. */}
              <span style={{
                fontSize: 11, fontWeight: 900, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
                letterSpacing: '-.02em', color: on ? C.orange : C.text2,
              }}>{g.away || '—'}<span style={{ opacity: 0.5, fontWeight: 400 }}>@</span>{g.home || '—'}</span>
              <span style={{
                fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 700, whiteSpace: 'nowrap',
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
