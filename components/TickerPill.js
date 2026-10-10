'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../lib/theme'
import { explain } from '../lib/explain'
import TeamMark, { asLogos, gameParts } from './TeamMark'

// ── THE TICKER PILL, ONE SHAPE FOR BOTH HEADERS (2026-09-18) ───────────────
// Donovan: "why dont the score rail on headers dont match."
//
// The SCROLL was already shared — both headers call lib/headlines.js's
// useAutoScroll at the same literal 55px/s (round 4 fixed that). What never
// got shared was the tile itself, so the two strips still read differently
// even moving at the same speed:
//
//   MOONSHOT's Pill (components/Header.js)   TUDDY's Tile (NflHeader.js)
//   height 26, radius 6                      padding 5/13, radius 9
//   flat  ${color}10 fill                    135deg gradient fill
//   border ${color}33                        border ${color}4d
//   a dot column ALWAYS reserved — filled    a dot only when live, inline in
//     and pulsing live, hollow ring when       the label, so every non-live
//     not — so labels line up down the rail    tile's text starts further left
//   value clipped at 150px with an ellipsis  value uncapped, long names push
//     (uncapped too since 10-05)                 the tile wide
//   always a <button>                        a <div> unless given onClick
//
// This is MOONSHOT's shape, because MOONSHOT is the reference product. The
// one thing kept from TUDDY's side is the inert variant: the static slate
// tiles (Games, Proj TD, Pool) have nowhere to navigate to, so they render as
// a <div> rather than a button that does nothing — same box, no tap
// affordance. `theme`/`numFont` are optional props defaulting to MOONSHOT's,
// the same sport-adapter pattern ScoreRail and PageHeader use.

export default function TickerPill({
  label,
  value,
  icon = null,
  color: color0 = null,
  live = false,
  title = null,
  onClick = null,
  echo = false,
  theme = null,
  numFont = null,
  accent = null,  // set: ONE-ACCENT mode -- any colour that is not a grey ink draws in this accent (2026-10-07 sweep)
  sport = null,   // set: a value that is a game or a club draws as logos (components/TeamMark asLogos)
  game = false,   // set (a score item): a value that parses as a game draws as THE GAME CHIP -- logo-first, status small
}) {
  const T = theme || MLB_C
  const NF = numFont || MLB_NUM
  const color = accent && color0 && ![T.text, T.text2, T.text3].includes(color0) ? accent : color0
  const col = color || T.text3
  const parts = game ? gameParts(sport, value) : null
  if (parts && typeof onClick === 'function') {
    return <GameChip parts={parts} label={label} T={T} NF={NF} color={color} col={col} live={live} title={title} onClick={onClick} echo={echo} value={value} sport={sport} />
  }
  const box = {
    display: 'inline-grid', gridTemplateColumns: '8px auto', alignItems: 'center', columnGap: 6,
    height: 26, whiteSpace: 'nowrap', padding: '0 10px 0 8px', marginRight: 6, borderRadius: 6,
    flexShrink: 0, background: `${col}10`, border: `1px solid ${color || T.border}33`,
    color: 'inherit', font: 'inherit', transition: 'background .12s',
  }
  const inner = (
    <>
      <span aria-hidden="true" style={{
        width: 5, height: 5, borderRadius: '50%',
        background: live ? col : 'transparent',
        border: live ? 'none' : `1px solid ${col}66`,
        animation: live ? 'pulse 2s infinite' : 'none',
      }} />
      <span style={{ display: 'grid', lineHeight: 1.05 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: T.text3 }}>
          {icon ? `${icon} ` : ''}{label}
        </span>
        <span style={{
          // no width cap (2026-10-05): the strip scrolls sideways, so a long value ("2TD · 67 rec yd ·
          // 80 rush yd") widens its pill instead of being cut to an ellipsis (check-mobile CLIPPED)
          fontFamily: NF, fontSize: 11, fontWeight: 900, color: color || T.text, letterSpacing: '-.01em',
        }}>
          {asLogos(sport, value, { px: 14 })}
        </span>
      </span>
    </>
  )
  // A static pill WITH an explanation (Games, Proj TD, LOCKED...) is a tap
  // now: its title goes to the fixed explain panel (lib/explain.js) -- a
  // phone can't hover, and a popover can't ride a moving strip. With no
  // title it stays an inert box.
  if (typeof onClick !== 'function' && title) {
    return (
      <button type="button" tabIndex={echo ? -1 : 0} aria-hidden={echo || undefined} title={title}
        onClick={() => explain(label, title)} style={{ ...box, cursor: 'help' }}>
        {inner}
      </button>
    )
  }
  if (typeof onClick !== 'function') {
    return <div style={box}>{inner}</div>
  }
  return (
    <button
      type="button"
      tabIndex={echo ? -1 : 0}
      aria-hidden={echo || undefined}
      onClick={onClick}
      title={title || undefined}
      style={{ ...box, cursor: 'pointer' }}
    >
      {inner}
    </button>
  )
}

// ── THE GAME CHIP (2026-10-10, Donovan: "team logos in the header ... can be bigger while the
// text can be smaller") ─ the score strip's one shape for a game: away logo, the score over a
// small status line, home logo. The logo says the club (its code rides the title and the
// accessible name), so the abbreviations are gone from the face; the status is 11px, the score
// keeps NUM_FONT. Same tint / border / live dot as the pill beside it. The button is a transparent
// box with the visible chip inside, so a phone gets its 44px tap height from padding
// (.tp-game in components/header/HeaderShell.js) without the chip itself growing.
const LOGO_PX = 26
function GameChip({ parts, label, T, NF, color, col, live, title, onClick, echo, value, sport }) {
  // the status word without the leading emoji TUDDY's tiles carry in their label (the logos are the sport now)
  const status = String(label || '').replace(/^[^\p{L}\p{N}]+/u, '').trim()
  const scored = parts.score
  return (
    <button type="button" className="tp-game" tabIndex={echo ? -1 : 0} aria-hidden={echo || undefined}
      aria-label={`${value}${status ? `, ${status}` : ''}`} title={title || value} onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, padding: 0, marginRight: 6, background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 8px', borderRadius: 8,
        background: `${col}10`, border: `1px solid ${color || T.border}33`,
      }}>
        <TeamMark sport={sport} abbr={parts.away} variant="logo" px={LOGO_PX} />
        <span style={{ display: 'grid', justifyItems: 'center', gap: 1, lineHeight: 1.05, minWidth: 30 }}>
          <span style={{ fontFamily: NF, fontSize: scored ? 14 : 12, fontWeight: 900, letterSpacing: '-.01em', color: color || T.text }}>
            {scored ? `${scored[0]}–${scored[1]}` : '@'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: TYPE.label, fontWeight: 600, letterSpacing: 0, color: live ? col : T.text3 }}>
            {live ? <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: col, animation: 'pulse 2s infinite', flexShrink: 0 }} /> : null}
            {status}
          </span>
        </span>
        <TeamMark sport={sport} abbr={parts.home} variant="logo" px={LOGO_PX} />
      </span>
    </button>
  )
}
