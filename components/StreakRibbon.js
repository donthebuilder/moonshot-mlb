'use client'
import { C, NUM_FONT } from '../lib/theme'
import { alpha, verdictInk } from '../lib/scales'

// ══ THE RIBBON ══════════════════════════════════════════════════════════════
//
// Donovan, 2026-08-23: "adds breask in streaks."
//
// A streak drawn as one number tells you he has cleared four straight and
// nothing else. This draws the SEQUENCE — every run of clears and every run of
// misses across his season, newest on the left — so the shape is the read:
//
//   ▉▉▉▉ ▏▏ ▉▉ ▏ ▉▉▉▉▉▉▉ ▏▏▏
//
// Four straight, then a two-game hole, then two, then one off… A bat that
// alternates every other night looks nothing like a bat that goes on
// seven-game tears, and both can sit at the same season rate. That difference
// is invisible in a percentage and obvious here.
//
// WARM IS CLEARED, COOL IS MISSED — the verdict pair, same as everywhere else
// on the site. Widths are proportional to run length with a floor, so a
// one-game blip is still tappable and a twelve-game tear still dominates.
//
// THE BREAKS ARE THE POINT. Every boundary between two segments is a break,
// and each segment's title names the exact game that ended the run before it —
// date, opponent and home/away. That is the fact he asked for: not "the streak
// is over" but "it died in Cincinnati on 7-14".

const gameLabel = (g) => {
  if (!g) return ''
  const where = g.home ? 'vs' : '@'
  return [g.date, g.opp ? `${where} ${g.opp}` : ''].filter(Boolean).join(' ')
}

export default function StreakRibbon({ streak, label = 'the bar', max = 40, height = 13, showEnds = true }) {
  if (!streak || !streak.runs?.length) return null
  const warm = verdictInk(true).color
  const cool = verdictInk(false).color

  // Only as far back as `max` games, because a 140-game season at one pixel a
  // game is a texture rather than a shape. The count under it says how far
  // back the ribbon actually goes, so nobody reads a 40-game window as a
  // career.
  const shown = []
  let used = 0
  for (const r of streak.runs) {
    if (used >= max) break
    const len = Math.min(r.len, max - used)
    shown.push({ ...r, drawn: len })
    used += len
  }
  const total = used || 1

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'stretch', minWidth: 0 }}>
        {shown.map((r, i) => (
          <span
            key={i}
            title={[
              r.ok ? `Cleared ${label} ${r.len} straight` : `Missed ${label} ${r.len} straight`,
              r.games?.[0] ? `newest: ${gameLabel(r.games[0])}` : '',
              // The break: the oldest game of this run is the night it turned.
              i < shown.length - 1 && r.broke
                ? `broke the previous run on ${gameLabel(r.broke)}`
                : '',
            ].filter(Boolean).join('\n')}
            style={{
              flex: `${r.drawn} 1 0`, minWidth: 3, height,
              borderRadius: 3, cursor: 'help',
              background: r.ok ? alpha(warm, 0.28 + 0.5 * Math.min(1, r.len / 6)) : alpha(cool, 0.22),
              border: `1px solid ${alpha(r.ok ? warm : cool, r.ok ? 0.55 : 0.3)}`,
            }}
          />
        ))}
      </div>
      {showEnds && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 8,
          fontSize: 8, fontFamily: NUM_FONT, color: C.text3, marginTop: 3,
        }}>
          <span>newest</span>
          <span>{total} games back</span>
        </div>
      )}
    </div>
  )
}

/** The three numbers a ribbon needs beside it, as one line. */
export function StreakLine({ streak, label = 'the bar' }) {
  if (!streak?.current) return null
  const cur = streak.current
  const warm = verdictInk(true).color
  const cool = verdictInk(false).color
  const col = cur.ok ? warm : cool
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap',
      fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3, minWidth: 0,
    }}>
      <span title={`His live run on ${label}, newest games first`} style={{ cursor: 'help' }}>
        <b style={{ color: col, fontSize: 12, fontWeight: 900 }}>{cur.len}</b>
        {' '}{cur.ok ? 'straight' : 'straight miss'}
      </span>
      {/* WHAT THE STREAK BROKE. The one fact a single streak number can never
          carry: the run that just ended, and the night it ended on. */}
      {streak.ended && (
        <span title={streak.ended.broke ? `ended on ${gameLabel(cur.broke || streak.ended.games?.[0])}` : ''}
          style={{ cursor: streak.ended.broke ? 'help' : 'inherit' }}>
          broke a {streak.ended.len}-game {streak.ended.ok ? 'run' : 'drought'}
          {cur.broke ? ` on ${cur.broke.date}` : ''}
        </span>
      )}
      <span title="His longest run of clears this season — the yardstick for whether tonight's streak is actually long for him">
        best <b style={{ color: C.text2 }}>{streak.best}</b>
      </span>
      <span title="His longest run of misses this season">
        worst <b style={{ color: C.text2 }}>{streak.drought}</b>
      </span>
    </div>
  )
}
