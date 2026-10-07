'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { useIsPhone } from './MobileFold'
import { MatchLogos } from './TeamMark'
import { localTime } from '../lib/localTime'

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
  return localTime(d, { zone: false }).replace(/\s?[AP]M$/i, '')
}

export default function GameSwitcher({ games = [], activeGame, onSelect, live = null, accent = C.orange, stickyTop = 'var(--hdr-h, 96px)', sport = 'mlb' }) {
  const isPhone = useIsPhone(760)
  const activeRef = useRef(null)
  const [open, setOpen] = useState(false)
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

  // ── THE SCORE STRIP (2026-09-28) ──────────────────────────────────────────
  // Donovan: "I don't really like the arrow switcher, do something better
  // overall." The ‹ › steppers and the one-line pills are gone. Same place
  // (sticky under the header, his call), same job: each game is a two-line
  // chip -- the matchup, then the time or the score -- 44px tall so a thumb
  // lands it, the open one filled in the product's colour, the rail fading at
  // its edges so it reads as swipeable. The last button, All, opens every
  // game as a grid: on a 15-game slate that is one tap to any game instead of
  // a swipe hunt. Picking one closes it.
  const subOf = (g) => {
    const l = live?.[g.game_pk] || null
    return l && (l.away_score != null || l.home_score != null)
      ? `${l.away_score ?? 0}-${l.home_score ?? 0}`
      : timeText(g.game_time)
  }
  const chip = (g, { inGrid = false } = {}) => {
    const on = g.game_pk === activeGame
    return (
      <button
        key={g.game_pk}
        ref={on && !inGrid ? activeRef : undefined}
        onClick={() => { onSelect(g.game_pk); setOpen(false) }}
        aria-pressed={on}
        title={`${g.away || '—'} @ ${g.home || '—'}`}
        style={{
          flexShrink: 0, minHeight: 44, minWidth: inGrid ? 0 : 76, padding: '5px 12px', borderRadius: 12, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          border: `1px solid ${on ? accent : C.border}`,
          background: on ? alpha(accent, 0.16) : C.bg2,
          scrollSnapAlign: 'center',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 900, fontFamily: NUM_FONT, whiteSpace: 'nowrap', letterSpacing: '-.01em', color: on ? accent : C.text }}>
          {/* logos (Donovan 10-02); the codes ride the chip's title */}
          <MatchLogos sport={sport} away={g.away} home={g.home} px={22} gap={3} />
        </span>
        <span style={{ fontSize: 11, fontFamily: NUM_FONT, fontWeight: 700, whiteSpace: 'nowrap', color: on ? C.text2 : C.text3 }}>{subOf(g)}</span>
      </button>
    )
  }

  return (
    <div
      ref={barRef}
      className="game-switcher"
      style={{
        // --hdr-h is written by components/Header.js; the fallback is roughly
        // the condensed bar, so a first paint lands under the header.
        // stickyTop: TUDDY's and LAMP's headers scroll away on a phone, so their
        // Slates pin this to the very top (0px); MOONSHOT's header stays.
        position: 'sticky', top: stickyTop, zIndex: 40,
        margin: '0 -8px 10px', padding: '7px 8px',
        background: C.bg, borderBottom: `1px solid ${C.border2}`,
        boxShadow: `0 10px 24px -16px ${alpha(accent, 0.55)}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="game-switcher-rail" style={{
          flex: 1, minWidth: 0, display: 'flex', gap: 6, overflowX: 'auto', scrollSnapType: 'x proximity',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
          maskImage: 'linear-gradient(90deg, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent 0, black 14px, black calc(100% - 14px), transparent 100%)',
          padding: '0 10px',
        }}>
          {games.map((g) => chip(g))}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Show every game"
          style={{
            flexShrink: 0, minWidth: 48, minHeight: 44, borderRadius: 12, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            border: `1px solid ${open ? accent : C.border}`, background: open ? alpha(accent, 0.16) : 'transparent',
            color: open ? accent : C.text2, fontFamily: NUM_FONT,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 900 }}>{open ? '✕' : 'All'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text3 }}>{idx + 1}/{games.length}</span>
        </button>
      </div>
      {open && (
        <div style={{
          marginTop: 8, display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          maxHeight: '55vh', overflowY: 'auto', paddingBottom: 2,
        }}>
          {games.map((g) => chip(g, { inGrid: true }))}
        </div>
      )}
      <style>{'.game-switcher-rail::-webkit-scrollbar{display:none}'}</style>
    </div>
  )
}
