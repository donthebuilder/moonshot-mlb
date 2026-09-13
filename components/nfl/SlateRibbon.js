'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import ChartFrame from './ChartFrame'

// THE SLATE AS A CLOCK.
//
// The Live page opened on sixteen identical tiles reading "Sun 10:00 AM" —
// a schedule printed as a list, which is the one shape a schedule should never
// take. A list cannot answer the questions you actually have on a Sunday: what
// is running right now, how long until the next window, how much of my card is
// still to come, and when am I done for the day.
//
// So: time on the x-axis. Each game is a block at its kickoff, roughly three
// and a quarter hours wide, in its own lane when it overlaps a neighbour. Live
// games glow, finals go quiet, and a cyan rule marks now. Underneath each
// block sits the number of your rungs riding on it, because exposure over time
// is the thing a list of kickoff strings hides completely.

const GAME_MS = 3.25 * 60 * 60 * 1000
const LANE_H = 20
const DAY = { weekday: 'short', timeZone: undefined }

const dayKey = (t) => new Date(t).toDateString()

export default function SlateRibbon({ games, picks, now = Date.now(), onGame }) {
  const model = useMemo(() => {
    const rows = (games || [])
      .filter((g) => g.kickoff && Number.isFinite(Date.parse(g.kickoff)))
      .map((g) => ({ g, t: Date.parse(g.kickoff) }))
      .sort((a, b) => a.t - b.t)
    if (!rows.length) return null

    // How many of the card's rungs ride on each team, so a block can say what
    // it costs you. A rung names a team, not a game, so both sides count.
    const perTeam = {}
    Object.values(picks?.card || {}).forEach((blk) => {
      (blk.rungs || []).forEach((r) => { if (r.team) perTeam[r.team] = (perTeam[r.team] || 0) + 1 })
    })

    const days = []
    for (const row of rows) {
      const k = dayKey(row.t)
      let d = days.find((x) => x.key === k)
      if (!d) { d = { key: k, label: new Date(row.t).toLocaleDateString(undefined, DAY), rows: [] }; days.push(d) }
      d.rows.push(row)
    }

    for (const d of days) {
      d.lo = d.rows[0].t - 20 * 60 * 1000
      d.hi = Math.max(...d.rows.map((r) => r.t)) + GAME_MS + 20 * 60 * 1000
      // A day with one game had its span set to that one game, so a lone
      // Monday night filled the whole ribbon and read as if it ran all day.
      // Every day gets at least a seven-hour window, so a single kickoff is a
      // block inside an evening rather than the evening itself.
      const MIN_SPAN = 7 * 60 * 60 * 1000
      if (d.hi - d.lo < MIN_SPAN) d.hi = d.lo + MIN_SPAN
      // Lane packing: a block drops into the first lane whose last block has
      // already finished. Ten one-o'clock kickoffs stack instead of colliding.
      const lastEnd = []
      for (const row of d.rows) {
        let lane = lastEnd.findIndex((e) => e <= row.t)
        if (lane === -1) { lane = lastEnd.length; lastEnd.push(0) }
        lastEnd[lane] = row.t + GAME_MS
        row.lane = lane
        row.rungs = (perTeam[row.g.away] || 0) + (perTeam[row.g.home] || 0)
      }
      d.lanes = Math.max(...d.rows.map((r) => r.lane)) + 1
    }
    return { days, totalRungs: Object.values(perTeam).reduce((a, b) => a + b, 0) }
  }, [games, picks])

  if (!model) return null

  return (
    <div style={{ marginBottom: 10 }}>
      {model.days.map((d) => {
        const span = d.hi - d.lo || 1
        const pct = (t) => ((t - d.lo) / span) * 100
        const nowIn = now >= d.lo && now <= d.hi
        const live = d.rows.filter((r) => r.g.state === 'in').length
        return (
          <div key={d.key} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5,
              fontFamily: NUM_FONT, fontSize: 9, color: C.text3, letterSpacing: '.1em',
            }}>
              <b style={{ color: C.text, fontSize: 10 }}>{d.label.toUpperCase()}</b>
              <span>{d.rows.length} game{d.rows.length === 1 ? '' : 's'}</span>
              {live > 0 && <span style={{ color: C.green }}>{live} live</span>}
            </div>

            <ChartFrame accent={C.green} live={live > 0} pad="8px 9px">
              <div style={{ position: 'relative', height: d.lanes * LANE_H + 14 }}>
                {/* hour rules, so the width of a block means something */}
                {Array.from({ length: Math.ceil(span / 3600000) + 1 }, (_, i) => d.lo + i * 3600000)
                  .filter((t) => t <= d.hi)
                  .map((t) => (
                    <div key={t} style={{
                      position: 'absolute', left: `${pct(t)}%`, top: 0, bottom: 14,
                      width: 1, background: 'rgba(255,255,255,.05)',
                    }} />
                  ))}

                {d.rows.map((r) => {
                  const g = r.g
                  const isLive = g.state === 'in'
                  const done = g.completed || g.state === 'post'
                  const tone = isLive ? C.green : done ? 'rgba(255,255,255,.16)' : C.cyan
                  return (
                    <div
                      key={g.game_id}
                      onClick={onGame ? () => onGame(g) : undefined}
                      title={`${g.away} @ ${g.home} · ${new Date(r.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${r.rungs ? ` · ${r.rungs} of your rungs` : ''}`}
                      style={{
                        position: 'absolute', left: `${pct(r.t)}%`, width: `${(GAME_MS / span) * 100}%`,
                        top: r.lane * LANE_H, height: LANE_H - 4, borderRadius: 4,
                        background: isLive ? `${tone}2e` : done ? 'rgba(255,255,255,.05)' : `${tone}18`,
                        border: `1px solid ${isLive ? tone : done ? 'rgba(255,255,255,.12)' : `${tone}55`}`,
                        boxShadow: isLive ? `0 0 12px -3px ${tone}` : 'none',
                        display: 'flex', alignItems: 'center', gap: 5, padding: '0 5px',
                        overflow: 'hidden', cursor: onGame ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{
                        fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900,
                        color: done ? C.text3 : C.text, whiteSpace: 'nowrap',
                      }}>{g.away}@{g.home}</span>
                      {r.rungs > 0 && (
                        <span style={{
                          fontFamily: NUM_FONT, fontSize: 8, fontWeight: 900,
                          color: isLive ? C.green : C.text3, marginLeft: 'auto',
                        }}>{r.rungs}</span>
                      )}
                    </div>
                  )
                })}

                {nowIn && (
                  <div style={{
                    position: 'absolute', left: `${pct(now)}%`, top: -2, bottom: 12, width: 0,
                    borderLeft: `1px solid ${C.cyan}`, zIndex: 4,
                    filter: `drop-shadow(0 0 4px ${C.cyan})`,
                  }} />
                )}

                {/* clock, three ticks */}
                {[d.lo, d.lo + span / 2, d.hi].map((t, i) => (
                  <span key={i} style={{
                    position: 'absolute', bottom: 0, left: `${pct(t)}%`,
                    transform: i === 0 ? 'none' : i === 2 ? 'translateX(-100%)' : 'translateX(-50%)',
                    fontFamily: NUM_FONT, fontSize: 7.5, color: C.text3,
                  }}>{new Date(t).toLocaleTimeString([], { hour: 'numeric' })}</span>
                ))}
              </div>
            </ChartFrame>
          </div>
        )
      })}
      <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5 }}>
        Each block is a game on the clock, about three and a quarter hours wide;
        the number on it is how many of your rungs ride on that game.
        {model.totalRungs > 0 && ` ${model.totalRungs} rungs across the slate.`}
      </div>
    </div>
  )
}
