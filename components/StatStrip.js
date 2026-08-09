'use client'
import { C, NUM_FONT } from '../lib/theme'
import { statLineFor, hrRateBoxes, useSlateScale, toneFor, toneTitle, TONE_COLOR } from '../lib/statline'

// 📊 The stat row that now leads every card. See lib/statline.js for why.
//
// Design rules, all of them learned from staring at the two sites people find
// easier to read than ours:
//
//   1. LABEL ABOVE, NUMBER BELOW. Not "Barrel 24.3%" on one line — the eye
//      scans a column of numbers far faster than it parses label-value pairs,
//      and the label only has to be read once.
//   2. COLOUR IS THE WHOLE POINT. Green helps this bat tonight, red doesn't,
//      grey is middling. Ranked against tonight's slate, never against an
//      invented league baseline. Every chip's tooltip says so.
//   3. NOTHING RENDERS EMPTY. A stat with no published value is dropped, not
//      dashed. Four dashes in a row is worse than three stats.

export default function StatStrip({ p, type = 'hr', count = 4, size = 'md', style }) {
  const scale = useSlateScale()
  const stats = statLineFor(p, type, count)
  if (!stats.length) return null

  const sm = size === 'sm'
  return (
    <div
      className="stat-strip"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        gap: sm ? 4 : 6,
        ...style,
      }}
    >
      {stats.map((s) => {
        const tone = toneFor(scale, s)
        const col = tone ? TONE_COLOR[tone] : C.text2
        return (
          <div
            key={s.id}
            title={toneTitle(tone, scale, s)}
            style={{
              minWidth: 0, textAlign: 'center', cursor: 'help',
              background: tone === 'mid' || !tone ? 'rgba(255,255,255,.03)' : `${col}12`,
              border: `1px solid ${tone === 'mid' || !tone ? C.border : `${col}44`}`,
              borderRadius: 7, padding: sm ? '3px 2px 4px' : '4px 3px 5px',
            }}
          >
            <div style={{
              fontSize: sm ? 7.5 : 8, letterSpacing: '.05em', textTransform: 'uppercase',
              color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
            }}>{s.label}</div>
            <div style={{
              fontSize: sm ? 11 : 12.5, fontWeight: 800, color: col,
              fontFamily: NUM_FONT, lineHeight: 1.2, whiteSpace: 'nowrap',
            }}>{s.text}</div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * HR rate over the published windows.
 *
 * The competitors' most-copied element, built honestly: L5 and L10 are per
 * GAME, season is per PLATE APPEARANCE, and each box prints its own
 * denominator underneath so the two units are never silently compared.
 */
export function HitRateBoxes({ p, style }) {
  const boxes = hrRateBoxes(p)
  if (!boxes.length) return null
  return (
    <div className="stat-strip" style={{
      display: 'grid', gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))`,
      gap: 5, ...style,
    }}>
      {boxes.map((b) => {
        // Colour is on the COUNT, not the rate: "he has gone deep recently" is
        // the fact. No thresholds pretending to be a probability.
        const hot = b.num > 0
        const col = hot ? C.orange : C.text3
        return (
          <div key={b.id}
            title={`${b.num} home run${b.num === 1 ? '' : 's'} in his last ${b.den} ${b.unit === 'G' ? 'games' : 'plate appearances'}.`}
            style={{
              minWidth: 0, textAlign: 'center', cursor: 'help',
              background: hot ? `${C.orange}12` : 'rgba(255,255,255,.03)',
              border: `1px solid ${hot ? `${C.orange}44` : C.border}`,
              borderRadius: 7, padding: '4px 3px 5px',
            }}>
            <div style={{
              fontSize: 8, letterSpacing: '.05em', textTransform: 'uppercase',
              color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.3,
            }}>{b.label}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: col, fontFamily: NUM_FONT, lineHeight: 1.2 }}>
              {b.num} HR
            </div>
            <div style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.3 }}>
              in {b.den} {b.unit}
            </div>
          </div>
        )
      })}
    </div>
  )
}
