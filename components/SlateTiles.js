'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, hrScore, median, hitScore, prodScore, nn } from '../lib/player'
import { isAligned } from '../lib/scoring'

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

function Tile({ label, value, delta, tone: toneKey = 'flat', dot }) {
  // Tinted to match the capture pill next door. Grey boxes read as chrome;
  // a tinted pill with a live dot reads as an instrument, which is what these
  // are -- they change during the night.
  const col = toneKey === 'up' ? '#4ade80'
    : toneKey === 'down' ? '#f87171'
    : toneKey === 'accent' ? C.orange
    : C.text3

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '4px 11px', borderRadius: 8, minWidth: 0,
      background: `${col}12`, border: `1px solid ${col}30`,
    }}>
      <div style={{
        fontSize: 8, textTransform: 'uppercase', letterSpacing: '.08em',
        color: C.text3, fontWeight: 700, whiteSpace: 'nowrap',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {dot && (
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: col, flexShrink: 0 }} />
        )}
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap',
      }}>
        <span style={{
          fontFamily: NUM_FONT, fontSize: 13, fontWeight: 800,
          color: toneKey === 'flat' ? C.text : col, letterSpacing: '-.02em',
        }}>{value}</span>
        {delta && (
          <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{delta}</span>
        )}
      </div>
    </div>
  )
}

export default function SlateTiles({ players = [], results, games = [] }) {
  const stats = useMemo(() => {
    if (!players.length) return null

    const confirmed = players.filter((p) => p?.lineup_confirmed).length
    const aligned = players.filter(isAligned).length
    const hot = players.filter((p) => hrScore(p) >= 70).length
    const weak = players.filter((p) => p?.weak_spot_flag).length

    const report = results?.hr_capture_report
    const actual = n(report?.total_hrs_on_slate, null)
    const onSheet = n(report?.caught_hrs_on_sheet, null)
    const settled = (results?.graded_slots || results?.results || [])
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

  return (
    <div style={{
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center',
    }}>
      <Tile label="Games" value={stats.gameCount} />
      <Tile
        label="Hitters"
        value={players.length}
        delta={pct(stats.confirmed)}
        tone={stats.confirmed === players.length ? 'up' : 'flat'}
        dot={stats.confirmed === players.length}
      />
      {stats.actual != null && (
        <Tile
          label="HR actual"
          value={stats.actual.toFixed(0)}
          delta={stats.onSheet != null ? `${stats.onSheet} on board` : null}
          tone="up"
          dot
        />
      )}
      {stats.best && (
        <Tile
          label="Best game"
          value={stats.best.label}
          delta={stats.best.gs.toFixed(1)}
          tone="accent"
          dot
        />
      )}
      <Tile label="70+" value={stats.hot} delta={pct(stats.hot)} />
      <Tile label="◆ Aligned" value={stats.aligned} />
      <Tile label="★ Weak" value={stats.weak} tone="accent" />
      {stats.settled > 0 && (
        <Tile label="Settled" value={stats.settled} delta="graded" />
      )}
    </div>
  )
}
