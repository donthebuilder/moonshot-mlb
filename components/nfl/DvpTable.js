'use client'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// Defence vs position, BY DEPTH ROLE.
//
// The distinction is the whole point. "What this defence allows to wide
// receivers" averages a WR1 and a fourth receiver into one number and is close
// to useless. What you need is what it allows to the guy in the role YOUR
// player occupies — hence WR1 / WR2 / WR3 / TE1 / TE2 / RB1 / RB2 / QB.
//
// Rank is the reading instrument, not the raw number: 66 receiving yards
// allowed means nothing until you know it's 4th-most in the league. Rank 1 =
// allows the most = the softest matchup, which is the direction a bettor
// reads, so rank 1 is green.
//
// Lifted out of tabs/Matchups.js on 2026-08-14 because the player modal needs
// the same rows scoped to one position group. Two copies of a heat scale is
// two places for the colours to drift apart.

export const GROUP = {
  WR: ['WR1', 'WR2', 'WR3', 'Other WR'],
  TE: ['TE1', 'TE2', 'Other TE'],
  RB: ['RB1', 'RB2', 'Other RB'],
  QB: ['QB'],
}

// 32 teams. Rank 1 is the softest spot on the board, 32 the hardest.
export function rankColor(rank) {
  if (!Number.isFinite(rank)) return null
  if (rank <= 5) return C.green
  if (rank <= 12) return C.lime
  if (rank <= 21) return C.yellow
  if (rank <= 27) return C.orange
  return C.red
}

function Cell({ cell, stat }) {
  const v = cell?.[stat]
  const r = cell?.[`${stat}_rank`]
  if (v === undefined || v === null) {
    // N/A rather than 0 — a receiver has no rushing line and a quarterback has
    // no receiving line, and printing a zero reads as a measurement.
    return <td style={{ padding: '7px 6px', textAlign: 'center', color: C.text3, fontSize: 10 }}>N/A</td>
  }
  const col = rankColor(r)
  return (
    <td style={{
      padding: '6px 6px', textAlign: 'center',
      background: col ? `${col}14` : 'transparent',
      borderRight: `1px solid ${C.bg}`,
    }}>
      <div style={{ fontFamily: NUM_FONT, fontSize: 12.5, fontWeight: 900, color: C.text }}>
        {Number.isInteger(v) ? v : v.toFixed(1)}
      </div>
      {Number.isFinite(r) && (
        <div style={{
          display: 'inline-block', marginTop: 2, fontFamily: NUM_FONT, fontSize: 8.5,
          fontWeight: 900, color: col, border: `1px solid ${col}55`,
          background: `${col}18`, borderRadius: 4, padding: '0 4px',
        }}>#{r}</div>
      )}
    </td>
  )
}

export default function DvpTable({ data, team, win = 'season', roles, highlight, minWidth = 620 }) {
  const order = roles || data?.dvp_roles || []
  const labels = data?.dvp_labels || {}
  const blob = data?.dvp?.[win]?.[team]
  const rows = order.filter((r) => blob?.[r])

  // Only the columns this group actually carries. The bot already masks stats
  // by role, so a receiver group otherwise ships four dead RUSH columns.
  const stats = (data?.dvp_stats || []).filter(
    (s) => rows.some((r) => blob[r]?.[s] !== undefined && blob[r]?.[s] !== null))

  if (!rows.length) {
    return <div style={{ color: C.text3, fontSize: 12, padding: 16 }}>
      No defence data for {team} in this window.
    </div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,.03)' }}>
            <th style={{
              padding: '7px 10px', fontSize: 9.5, fontWeight: 900, color: C.text3,
              textAlign: 'left', letterSpacing: '.08em', position: 'sticky', left: 0,
              background: C.bg2,
            }}>POSITION</th>
            {stats.map((s) => (
              <th key={s} style={{
                padding: '7px 6px', fontSize: 9.5, fontWeight: 900, color: C.text3,
                letterSpacing: '.06em',
              }}>{labels[s] || s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((role) => {
            const on = role === highlight
            return (
              <tr key={role} style={{
                borderTop: `1px solid ${C.border}`,
                background: on ? `${C.cyan}0f` : 'transparent',
                boxShadow: on ? `inset 3px 0 0 ${C.cyan}` : 'none',
              }}>
                <td style={{
                  padding: '6px 10px', fontSize: 11.5, fontWeight: 800,
                  color: on ? C.cyan : C.text,
                  position: 'sticky', left: 0, background: on ? C.bg3 : C.bg2,
                }}>{role}{on && <span style={{
                  fontFamily: NUM_FONT, fontSize: 8, marginLeft: 6, letterSpacing: '.12em',
                }}>HIM</span>}</td>
                {stats.map((s) => <Cell key={s} cell={blob[role]} stat={s} />)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
