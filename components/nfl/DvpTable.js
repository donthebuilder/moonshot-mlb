'use client'
import { C, NUM_FONT, RAMP } from '../../lib/nfl/theme'
import { softRole } from '../../lib/nfl/dvpSignal'

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
//
// ── 2026-09-13: STRIPS, NOT A TABLE ─────────────────────────────────────────
// Donovan wanted a different shape for this entirely, and the grid deserved
// it: every cell carried the value AND a rank chip underneath, so eleven roles
// times seven stats was 154 things to read, each one asking to be read twice,
// and none of them saying which of the 77 cells mattered.
//
// Rank is the only thing worth encoding here — 66 receiving yards allowed
// means nothing until you know it is 4th-most in the league, which this file's
// own header has said since August. So the value moves to the tooltip and each
// cell keeps one number and one colour. Whole rows now read at a glance: TE2
// lights up across four stats, RB2 is dark across seven, and that comparison
// was invisible when every cell was a two-line block.
//
// Three other forms were rendered against the live payload first — a ranked
// list of the softest role/stat pairs, and roles drawn as nodes in a formation
// (dropped: where a tight end lines up has nothing to do with the number being
// encoded, so the field was decoration).

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


// Cells stop growing past this. Without it the modal's three-role tight-end
// view stretched four cells across the full width and read as an airy table
// rather than a strip.
const CELL_MAX = 56

// A cell is a rank and nothing else. Brighter = softer = better for you.
function Cell({ cell, stat, dim }) {
  const v = cell?.[stat]
  const r = cell?.[`${stat}_rank`]
  if (!Number.isFinite(r)) {
    // N/A rather than 0 — a receiver has no rushing line and a quarterback has
    // no receiving line, and printing a zero reads as a measurement.
    //
    // The full board keeps the column anyway, because comparing roles needs
    // every row on the same grid — but an empty cell then looks like missing
    // data rather than an inapplicable one. A faint hatch says "this does not
    // apply to this role", which is a different statement from "we don't know".
    return <div title="not a stat this role records" style={{
      flex: 1, minWidth: 30, maxWidth: CELL_MAX, height: 22, borderRadius: 4,
      background: `repeating-linear-gradient(-45deg, rgba(255,255,255,.045) 0 1px, transparent 1px 5px)`,
    }} />
  }
  const soft = (32 - r) / 31              // 1 = softest in the league
  const col = RAMP[Math.min(RAMP.length - 1, Math.floor(soft * RAMP.length))]
  return (
    <div
      title={`${stat}: ${Number.isInteger(v) ? v : Number(v).toFixed(1)} — ${r} of 32, rank 1 allows the most`}
      style={{
        flex: 1, minWidth: 30, maxWidth: CELL_MAX, height: 22, borderRadius: 4, position: 'relative',
        background: 'rgba(255,255,255,.04)', overflow: 'hidden',
        opacity: dim ? 0.45 : 1,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: col, opacity: 0.14 + soft * 0.78 }} />
      <span style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800,
        color: soft > 0.55 ? '#04120d' : C.text2,
      }}>{r}</span>
    </div>
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

  // The softest cell on the board, so the panel opens on an answer instead of
  // making you find one. Was its own inline minimum-rank loop -- the exact
  // bug lib/nfl/dvpSignal.js's own header describes fixing everywhere else
  // on 2026-09-13 (measured live: 18 of 32 defences landed at "1st softest
  // of 32," 11 more at 2nd -- the minimum of many ranked draws, not a real
  // signal). This file's own footer never got that fix. Now calls the same
  // shared softRole() every other "softest cell" sentence on the site uses,
  // scoped to `rows` so a role-restricted view (the player modal's own
  // position group) can't name a role that isn't even in the table above it.
  const best = softRole(data, team, win, rows)

  // The caller's minWidth was written for the old two-line cells and is now a
  // CEILING, not a floor: a strip needs 32px a column and 88 for the label, so
  // the full seven-stat board comes to ~312px and fits a phone without the
  // sideways scroll it used to force. Sideways scroll on a matrix is fair when
  // the matrix genuinely needs the room; it was not needed here.
  const width = Math.min(minWidth, stats.length * 32 + 88)

  return (
    <div style={{ padding: '10px 12px 12px' }}>
      <div className="dense-scroll" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: width }}>
          <div style={{ display: 'flex', gap: 3, marginBottom: 5, paddingLeft: 89 }}>
            {stats.map((s) => (
              <span key={s} style={{
                flex: 1, minWidth: 30, maxWidth: CELL_MAX, textAlign: 'center', fontFamily: NUM_FONT,
                fontSize: 8, fontWeight: 800, color: C.text3, letterSpacing: '.04em',
              }}>{labels[s] || s}</span>
            ))}
          </div>
          {rows.map((role) => {
            const on = role === highlight
            return (
              <div key={role} style={{
                display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3,
                paddingLeft: on ? 3 : 0,
                borderLeft: on ? `3px solid ${C.cyan}` : '3px solid transparent',
              }}>
                <span style={{
                  width: 83, flex: '0 0 83px', fontSize: 10.5, fontWeight: on ? 900 : 700,
                  color: on ? C.cyan : C.text, whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {role}{on && <span style={{
                    fontFamily: NUM_FONT, fontSize: 7.5, marginLeft: 5, letterSpacing: '.12em',
                  }}>HIM</span>}
                </span>
                {stats.map((s) => (
                  <Cell key={s} cell={blob[role]} stat={s} dim={Boolean(highlight) && !on} />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {best?.standout && (
        <div style={{ fontSize: 10.5, color: C.text2, marginTop: 9, lineHeight: 1.55 }}>
          Softest cell on this board: <b style={{ color: C.green }}>{best.role}</b> in
          {' '}<b style={{ color: C.green }}>{best.label}</b>, {best.rank} of 32.
        </div>
      )}
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
        One number per cell: where this defence ranks against that role, 1 to 32.
        Rank 1 allows the most, so brighter is a better matchup. The raw figure is
        on hover.
      </div>
    </div>
  )
}
