'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, hrScore, median, hitScore, prodScore, nn, teamOf } from '../lib/player'
import { easternToday } from '../lib/data'
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

// The tile row, factored out so the ticker below can render it twice — once
// real, once a visual echo — without hand-duplicating six JSX blocks that
// have to stay byte-identical or the loop seam shows.
function TileSet({ stats, projected, capture, staleSlate }) {
  return (
    <>
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
        label={staleSlate ? 'Previous lineups' : 'Lineups ✓'}
        value={`${stats.confirmedTeams}/${stats.lineupTeams}`}
        delta="teams"
        color={staleSlate ? C.text3 : '#4ade80'}
        wide={staleSlate}
        dot
      />
      {stats.settled > 0 && (
        <Tile label="Settled" value={stats.settled} delta="graded" color={C.green} />
      )}
    </>
  )
}

export default function SlateTiles({ players = [], results, games = [], projected = null, capture = null, slateDate = '', mode = 'today' }) {
  const [tickerPaused, setTickerPaused] = useState(false)
  const stats = useMemo(() => {
    if (!players.length) return null

    const lineupTeamsSet = new Set(players.map(teamOf).filter(Boolean))
    const confirmedTeamsSet = new Set(players.filter((p) => p?.lineup_confirmed).map(teamOf).filter(Boolean))
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

    return {
      confirmedTeams: confirmedTeamsSet.size,
      lineupTeams: lineupTeamsSet.size,
      aligned, hot, weak, actual, onSheet, settled, best, gameCount,
    }
  }, [players, results, games])

  if (!stats) return null

  const expectedDate = mode === 'tomorrow'
    ? new Date(new Date(`${easternToday()}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10)
    : easternToday()
  const staleSlate = !!slateDate && slateDate < expectedDate

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
  // FIRST FIX made every tile a flex cell on the same basis and let whatever
  // landed on a wrapped last row grow to close it out — LINEUPS ✓ stopped
  // being a stranded sliver, but it was still A SECOND ROW, now just a full-
  // width one: on a real slate the header's vitals column measures ~620px and
  // six tiles at their measured bases run past that, so something always
  // wrapped.
  //
  // ONE LINE, NOT TWO (2026-08-24, later the same day). Donovan: "fix the
  // header mix it one line not two." Wrapping was the wrong tool no matter
  // how the leftover cell was styled — the fix is to never wrap at all. The
  // strip is flex-nowrap now and scrolls sideways instead, the same pattern
  // the tab rail below it already uses (Header.js's `.rail`): every tile
  // keeps its full, measured, legible width, the header stays one line at
  // any slate size, and nothing that doesn't fit is lost — it's a swipe
  // away instead of a second row.
  //
  // The rule lives in CSS (.slate-tiles > *, components/MobileCSS.js) rather
  // than in a wrapper <div> around each child, and that is the whole trick:
  // two of these tiles are elements threaded in from Header.js which render
  // NULL on most slates (no projection published, no homer hit yet). A wrapper
  // div exists whether or not its child rendered, so wrapping would have left
  // one or two empty 148px cells holding open a gap in the middle of the
  // strip. A child selector matches only what actually made a DOM node.
  // ── A TICKER, NOT A SHELF (2026-08-24, later still) ────────────────────────
  // Donovan: "make it moving like espn or like stock tickers ... something
  // that changes, giving data on the slate — home runs, projected, lineups,
  // games, all that." The scroll-on-overflow fix above solved "stays one
  // line"; this is a different ask — the strip should read as a live
  // instrument, not a shelf you have to swipe.
  //
  // Nothing here is clickable (Tile is a plain div, never a button), so
  // there is no target an animated strip could steal a tap from — the usual
  // reason a ticker is a bad idea on a real UI doesn't apply.
  //
  // TileSet's own content renders twice, back to back, inside a track twice
  // as wide as the viewport that clips it. Animating that track from 0 to
  // -50% is the standard seamless-loop trick: because both halves are
  // byte-identical, the moment the first copy has scrolled fully out of
  // view the second is sitting exactly where the first started, and the
  // animation restarts invisibly. The duplicate is `aria-hidden` — it
  // exists to be looked at, not read twice by a screen reader.
  //
  // Hover still pauses for a mouse, and the visible button below gives touch
  // and keyboard users the same control. When paused the echo disappears and
  // the real tiles become a manually scrollable row.
  return (
    <div
      className={`slate-tiles-shell${tickerPaused ? ' ticker-paused' : ''}`}
      style={{ position: 'relative', width: '100%', minWidth: 0 }}
    >
      <div className="slate-tiles-viewport" style={{ width: '100%', minWidth: 0, overflow: 'hidden', paddingRight: 38 }}>
        <div className="slate-tiles" style={{
          display: 'flex', gap: 0, flexWrap: 'nowrap', alignItems: 'stretch',
          width: 'max-content',
        }}>
        {/* FIXED ORDER AND HUES, alternating cool/warm so no two neighbours
            share a colour:
              Games BLUE · Projected ORANGE · HR tracking BLUE ·
              Best game ORANGE · Weak GOLD · Lineups GREEN · (Settled green)
            The projected and capture pills are built in Header.js and
            threaded in as elements so the whole strip is one row with one
            order — same tiles, just laid out twice now for the loop.

            LINEUPS was computed here from day one and never rendered. It's
            the certainty number for the whole slate — every score on the
            site is softer for a hitter who might not start, so how much of
            the board is locked belongs in the header. */}
          <div className="slate-tiles-set">
            <TileSet stats={stats} projected={projected} capture={capture} staleSlate={staleSlate} />
          </div>
          <div className="slate-tiles-set slate-tiles-echo" aria-hidden="true">
            <TileSet stats={stats} projected={projected} capture={capture} staleSlate={staleSlate} />
          </div>
        </div>
      </div>
      <button
        type="button"
        className="slate-ticker-toggle"
        aria-pressed={tickerPaused}
        aria-label={tickerPaused ? 'Resume moving slate ticker' : 'Pause moving slate ticker'}
        title={tickerPaused ? 'Resume ticker' : 'Pause ticker'}
        onClick={() => setTickerPaused((paused) => !paused)}
        style={{
          position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
          zIndex: 2, width: 32, height: 32, minHeight: 32, padding: 0,
          display: 'grid', placeItems: 'center', borderRadius: 999,
          border: `1px solid ${C.border}`, background: C.bg2, color: C.text2,
          cursor: 'pointer', fontSize: 11, fontWeight: 900,
        }}
      >{tickerPaused ? '▶' : 'Ⅱ'}</button>
    </div>
  )
}
