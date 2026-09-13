'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { rankColor } from './DvpTable'
import ChartFrame from './ChartFrame'

// DVP DRIFT — where a defence's soft spot is MOVING.
//
// 2026-09-13. The DvP grid is eleven roles x seven stats of season averages,
// and a season average cannot say the one thing that decides a Week 12 bet:
// this defence did not used to leak to TE2 and now it does. A rank that has
// sat at #21 all year and a rank that was #21 in September and is #4 over the
// last three games print the same cell.
//
// A true week-by-week bump chart is not possible from what the bot publishes —
// matchup.json carries four WINDOWS (season, L10, L5, L3), not a weekly
// series. But those four are ordered, from the whole season to the last three
// games, and each point is already a multi-game average rather than one noisy
// Sunday. Read left to right and the line is the drift. If we later want real
// weeks, bots/nfl/nfl_dvp.py has to snapshot per week; nothing on this side
// changes when it does.
//
// Eleven lines at once is spaghetti, so the chart picks: the role your player
// occupies, plus whichever roles have moved most. Everything else stays as a
// dim trace, present for context and never competing for the eye.

const WINDOWS = [['season', 'SEASON'], ['l10', 'L10'], ['l5', 'L5'], ['l3', 'L3']]
const TEAMS = 32

// The viewBox is in real units and scales UNIFORMLY. The first version used a
// 100-wide box with preserveAspectRatio="none" so it would fill its container:
// the padding then ate 92 of the 100 units, leaving an 8-unit plot that got
// stretched six times sideways — four windows stacked on top of each other and
// every label smeared into the next one. Non-uniform scaling and text do not
// mix, and a 100-unit box invites exactly this arithmetic mistake.
const W = 330
const H = 190
const PAD = { t: 12, r: 74, b: 20, l: 30 }
const LABEL_GAP = 11   // minimum vertical space between two end labels

export default function DvpDrift({ data, team, roles, highlight }) {
  const order = (roles || data?.dvp_roles || [])
  const labels = data?.dvp_labels || {}

  const available = useMemo(() => (data?.dvp_stats || []).filter((s) => order.some(
    (r) => WINDOWS.some(([w]) => Number.isFinite(data?.dvp?.[w]?.[team]?.[r]?.[`${s}_rank`])))),
  [data, team, order])

  const [stat, setStat] = useState(() => (available.includes('td') ? 'td' : available[0]))

  const series = useMemo(() => order.map((role) => ({
    role,
    pts: WINDOWS.map(([w], i) => {
      const r = data?.dvp?.[w]?.[team]?.[role]?.[`${stat}_rank`]
      return Number.isFinite(r) ? { i, rank: r } : null
    }).filter(Boolean),
  })).filter((s) => s.pts.length >= 2), [data, team, order, stat])

  // ── IS THE MOVE REAL, OR IS IT THREE GAMES? ─────────────────────────────
  // In a 32-team rank over a three-game window, somebody is top-three in every
  // role every week by arithmetic alone. Rendering the first draft against the
  // live payload, all four teams I sampled showed a role rocketing from the
  // twenties into the top ten, and the chart asserted each one as "the spot
  // that has opened up". That is the site telling a story about noise.
  //
  // So a move is CORROBORATED only when the middle windows agree with the end
  // one — L10 and L5 also sitting softer than the season rank means the trend
  // survived three different spans, not just the shortest. An uncorroborated
  // move still draws, because it might be real and hiding it is its own lie;
  // it just gets said differently underneath.
  const moves = useMemo(() => series.map((s) => {
    const first = s.pts[0]; const last = s.pts[s.pts.length - 1]
    const mid = s.pts.slice(1, -1)
    const corroborated = mid.length > 0 && mid.every((p) => p.rank < first.rank)
    return {
      role: s.role, delta: last.rank - first.rank, from: first.rank, to: last.rank,
      corroborated,
    }
  }).sort((a, b) => a.delta - b.delta), [series])

  if (!series.length || !stat) return null

  const softening = moves.filter((m) => m.delta <= -4)
  const focus = new Set([
    ...(highlight ? [highlight] : []),
    ...softening.slice(0, 2).map((m) => m.role),
    ...(softening.length ? [] : [moves[0]?.role]),
  ].filter(Boolean))

  const x = (i) => PAD.l + (i / (WINDOWS.length - 1)) * (W - PAD.l - PAD.r)
  const y = (rank) => PAD.t + ((rank - 1) / (TEAMS - 1)) * (H - PAD.t - PAD.b)

  // End labels are placed at their line's last rank, then pushed apart just
  // enough not to overlap — NE's WR2 and RB1 both finish near #1 and printed
  // on top of one another.
  const placed = []
  const labelY = (rank) => {
    let yy = y(rank)
    for (const used of placed.slice().sort((a, b) => a - b)) {
      if (Math.abs(yy - used) < LABEL_GAP) yy = used + LABEL_GAP
    }
    placed.push(yy)
    return yy
  }

  const lead = moves[0]
  const hardening = moves[moves.length - 1]

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap', marginBottom: 7,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
        }}>DRIFT — WHERE {team}&apos;S SOFT SPOT IS MOVING</span>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {available.map((s) => (
            <button key={s} onClick={() => setStat(s)} style={{
              fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, cursor: 'pointer',
              padding: '2px 6px', borderRadius: 5,
              border: `1px solid ${s === stat ? C.green : C.border}`,
              background: s === stat ? `${C.green}30` : 'transparent',
              color: s === stat ? C.green : C.text3,
            }}>{labels[s] || s}</button>
          ))}
        </div>
      </div>

      <ChartFrame accent={C.green} live={Boolean(highlight)} pad="2px 4px">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
             style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* rank gridlines. 1 is at the top because 1 is the softest and soft
              is what you are hunting — the chart should read "up is good". */}
          {[1, 8, 16, 24, 32].map((r) => (
            <g key={r}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(r)} y2={y(r)}
                    stroke="rgba(255,255,255,.07)" strokeWidth="1" />
              <text x={PAD.l - 6} y={y(r) + 3} textAnchor="end"
                    fill={C.text3} fontSize="9" fontFamily={NUM_FONT}>#{r}</text>
            </g>
          ))}

          {series.map((s) => {
            const on = focus.has(s.role)
            const last = s.pts[s.pts.length - 1]
            const col = on ? rankColor(last.rank) || C.text2 : 'rgba(255,255,255,.10)'
            const d = s.pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.rank)}`).join(' ')
            return (
              <g key={s.role}>
                <path className={on ? 'dvp-line' : 'dvp-dim'} d={d} fill="none" stroke={col}
                      strokeWidth={on ? 2 : 1} strokeLinejoin="round" strokeLinecap="round"
                      style={on ? { filter: `drop-shadow(0 0 3px ${col}90)` } : undefined} />
                {on && s.pts.map((p) => (
                  <circle key={p.i} cx={x(p.i)} cy={y(p.rank)} r="2.8" fill={C.bg}
                          stroke={col} strokeWidth="1.8" />
                ))}
                {on && (() => {
                  const ly = labelY(last.rank)
                  return (
                    <>
                      {Math.abs(ly - y(last.rank)) > 1 && (
                        <line x1={x(last.i) + 3} y1={y(last.rank)} x2={x(last.i) + 7} y2={ly - 3}
                              stroke={col} strokeWidth="0.8" opacity="0.5" />
                      )}
                      <text x={x(last.i) + 8} y={ly} fill={col}
                            fontSize="10" fontWeight="900" fontFamily={NUM_FONT}
                            dominantBaseline="middle">
                        {s.role}{s.role === highlight ? ' ·HIM' : ''}
                      </text>
                    </>
                  )
                })()}
              </g>
            )
          })}

          {WINDOWS.map(([w, label], i) => (
            <text key={w} x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === WINDOWS.length - 1 ? 'end' : 'middle'}
                  fill={C.text3} fontSize="9" fontFamily={NUM_FONT}>{label}</text>
          ))}
          <style>{`
            /* On a phone the eight unhighlighted roles are eight faint lines
               in a box a third the width — texture, not context. The two or
               three that carry the read stay. */
            @media (max-width: 500px) { .dvp-dim { display: none } }
          `}</style>
        </svg>
      </ChartFrame>

      <div style={{ fontSize: 10.5, color: C.text2, marginTop: 7, lineHeight: 1.6 }}>
        {lead && lead.delta <= -4 && lead.corroborated ? (
          <><b style={{ color: C.green }}>{team}</b> has been getting softer against
            {' '}<b style={{ color: C.green }}>{lead.role}</b> in {labels[stat] || stat} all the
            way down: #{lead.from} on the season, <b style={{ color: C.green }}>#{lead.to}</b>
            {' '}over the last three. Every window agrees, so it is a trend and not a hot week.</>
        ) : lead && lead.delta <= -4 ? (
          <><b style={{ color: C.text }}>{team}</b> sits #{lead.to} against
            {' '}<b style={{ color: C.text }}>{lead.role}</b> in {labels[stat] || stat} over the
            last three games, against #{lead.from} on the season — but the L10 and L5 windows
            do not back it up, so that is three games talking, not a soft spot.</>
        ) : hardening && hardening.delta >= 4 ? (
          <>Nothing has softened. The move is the other way: <b style={{ color: C.text }}>{hardening.role}</b>
            {' '}has gone from #{hardening.from} to <b style={{ color: C.text }}>#{hardening.to}</b>
            {' '}in {labels[stat] || stat}.</>
        ) : (
          <>{team} has not moved much in {labels[stat] || stat} — the season ranks are still
            the read.</>
        )}
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 4, lineHeight: 1.55 }}>
        Rank 1 at the top = allows the most = softest. Four windows, not four
        weeks: each point is that whole span, so the last one is the last three
        games and not one Sunday. Dim lines are the other roles.
      </div>
    </div>
  )
}
