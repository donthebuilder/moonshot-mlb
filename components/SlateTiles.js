'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, hrScore, median, hitScore, prodScore, nn } from '../lib/player'
import { isAligned } from '../lib/scoring'
import { dedupeGraded } from '../lib/graded'

// The header strip — the two Streamlit tile rows merged into one.
//
// Streamlit had these twice: "Today's Slate" at the top and "Slate at a glance"
// on the Games tab, overlapping on Games, Projected HRs and Weak spots. One
// strip in the header, visible from every tab, is the version that earns the
// space.
//
// The tile that matters most is PROJECTED vs ACTUAL. Everything else on this
// site is the model talking about itself; that pair is the model being marked
// against the night. When projected sits well above actual late in a slate,
// the model was long and you should know it without opening Results.

const playerScore = (p) => median([
  hrScore(p), prodScore(p), nn(p?.hrw_score), nn(p?.damage_conversion_score),
])

function Tile({ label, value, delta, tone: toneKey = 'flat', dot, color, wide = false }) {
  // Tinted to match the capture pill next door. Grey boxes read as chrome;
  // a tinted pill with a live dot reads as an instrument, which is what these
  // are -- they change during the night.
  // Explicit colour wins. Each tile owning a hue makes the strip readable at a
  // glance and photographs better than one orange row — Games blue, Weak gold,
  // Settled green, Best game orange.
  const col = color || (toneKey === 'up' ? '#4ade80'
    : toneKey === 'down' ? '#f87171'
    : toneKey === 'accent' ? C.orange
    : C.text3)

  // Screenshot polish: a soft diagonal tint and a faint outer glow instead of a
  // flat fill. Same information, but the strip photographs as an instrument
  // panel rather than a row of grey boxes — this is the part of the page that
  // ends up in every clip, so it's worth the extra few bytes of CSS.
  return (
    <div className={wide ? 'slate-tile-wide' : undefined} style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '5px 12px', borderRadius: 9, minWidth: 0, height: '100%',
      background: `linear-gradient(135deg, ${col}22, ${col}08)`,
      border: `1px solid ${col}45`,
      boxShadow: (toneKey === 'flat' && !color) ? 'none' : `0 0 16px ${col}14`,
    }}>
      <div style={{
        fontSize: 8, textTransform: 'uppercase', letterSpacing: '.09em',
        color: C.text3, fontWeight: 800, whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {dot && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: col, flexShrink: 0,
            boxShadow: `0 0 6px ${col}`,
          }} />
        )}
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', minWidth: 0,
      }}>
        <span style={{
          fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, minWidth: 0,
          color: (toneKey === 'flat' && !color) ? C.text : col, letterSpacing: '-.02em',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{value}</span>
        {delta && (
          <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{delta}</span>
        )}
      </div>
    </div>
  )
}

export default function SlateTiles({ players = [], results, games = [], projected = null, capture = null }) {
  const stats = useMemo(() => {
    if (!players.length) return null

    const confirmed = players.filter((p) => p?.lineup_confirmed).length
    const aligned = players.filter(isAligned).length
    const hot = players.filter((p) => hrScore(p) >= 70).length
    const weak = players.filter((p) => p?.weak_spot_flag).length

    const report = results?.hr_capture_report
    const actual = n(report?.total_hrs_on_slate, null)
    const onSheet = n(report?.caught_hrs_on_sheet, null)
    // SETTLED PLAYERS, not settled slots (lib/graded.js). The graded file
    // publishes a row per pick CATEGORY, so a hitter designated twice counted
    // twice here and the tile could read higher than the number of hitters
    // actually finished — on a header tile sitting next to "Lineups ✓ 84 of
    // 143", a count that can exceed the field is a number nobody can read.
    const settled = dedupeGraded(results)
      .filter((r) => r && r.grade && r.grade !== 'PENDING').length

    // Best game by the same two-median Game Score the strip uses, so the
    // header and the Games tab can't disagree about which game is the one.
    let best = null
    games.forEach((g) => {
      const gp = g.players || []
      if (!gp.length) return
      const gs = median(gp.map(playerScore))
      if (!best || gs > best.gs) best = { label: `${g.away || '—'} vs ${g.home || '—'}`, gs }
    })

    const gameCount = games.length || new Set(players.map((p) => p?.game_pk)).size

    return { confirmed, aligned, hot, weak, actual, onSheet, settled, best, gameCount }
  }, [players, results, games])

  if (!stats) return null

  const pct = (x) => `${Math.round((100 * x) / Math.max(1, players.length))}%`

  // ── AN EVEN STRIP (2026-08-24) ────────────────────────────────────────────
  // Donovan: "the top needs to be even."
  //
  // It wasn't, and the reason is that every tile was content-width. "Games"
  // carries one digit and "Best game" carries a matchup plus a score, so a
  // flex-wrap row of them broke wherever the text happened to run out — most
  // nights that left LINEUPS ✓ stranded alone on a second line with two-thirds
  // of the row empty beside it. A header strip that changes shape with the
  // fixtures reads as broken layout rather than as information.
  //
  // Every tile is a flex CELL on the same basis now, so a row fills its width
  // edge to edge and whatever lands on the last row grows to close it out.
  //
  // The rule lives in CSS (.slate-tiles > *, components/MobileCSS.js) rather
  // than in a wrapper <div> around each child, and that is the whole trick:
  // two of these tiles are elements threaded in from Header.js which render
  // NULL on most slates (no projection published, no homer hit yet). A wrapper
  // div exists whether or not its child rendered, so wrapping would have left
  // one or two empty 148px cells holding open a gap in the middle of the
  // strip. A child selector matches only what actually made a DOM node.
  return (
    <div className="slate-tiles" style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch',
      width: '100%', minWidth: 0,
    }}>
      {/* FIXED ORDER AND HUES, alternating cool/warm so no two neighbours
          share a colour:
            Games BLUE · Projected ORANGE · HR tracking BLUE ·
            Best game ORANGE · Weak GOLD · Lineups GREEN · (Settled green)
          The projected and capture pills are built in Header.js and threaded
          in as elements so the whole strip is one row with one wrap order.

          LINEUPS was computed here from day one and never rendered. It's the
          certainty number for the whole slate — every score on the site is
          softer for a hitter who might not start, so how much of the board is
          locked belongs in the header. */}
      <Tile label="Games" value={stats.gameCount} color="#38bdf8" />
      {projected}
      {capture}
      {stats.best && (
        <Tile
          wide
          label="Best game"
          value={stats.best.label}
          delta={stats.best.gs.toFixed(1)}
          tone="accent"
          dot
        />
      )}
      <Tile label="★ Weak" value={stats.weak} color="#FCD34D" dot />
      <Tile
        label="Lineups ✓"
        value={`${stats.confirmed}`}
        delta={`of ${players.length} · ${pct(stats.confirmed)}`}
        color="#4ade80"
        dot
      />
      {stats.settled > 0 && (
        <Tile label="Settled" value={stats.settled} delta="graded" color="#4ade80" />
      )}
    </div>
  )
}
