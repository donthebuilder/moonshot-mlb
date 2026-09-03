'use client'

// ── TWO KINDS OF CHOICE SHOULD NOT LOOK THE SAME (2026-09-03) ───────────────
//
// Boards was thirteen pills on one wrapping row with a hairline divider in the
// middle. Four of them chose WHICH TOOL you were in (Boards, Power, Patterns,
// Steals); the other nine chose WHICH BOARD within the first tool. Two levels
// of navigation, identical weight, identical shape, one thin line between
// them — so the row read as thirteen equal options and picking any of them
// was a guess.
//
// This is the second tier: a named row. The name is the point. "MARKET" over
// [Top][HR][Hits][HRR][Contact] says these five are alternatives to each other
// and subordinate to the thing above them, which is what the divider was
// trying and failing to say.
//
// Nine became MARKET (five) and ANGLE (four) because that is a real split, not
// a way of making the row shorter: the markets are bet types you already came
// here to back, the angles are screens over the same field. Somebody who wants
// a home run pick should not have to read past "Matchup Edge" to find HR.

import { C, NUM_FONT } from '../lib/theme'

export default function LensRow({ label, options = [], value, onChange, title }) {
  if (!options.length) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      flexWrap: 'wrap', marginBottom: 6,
    }}>
      <span style={{
        // Fixed width so two stacked rows line their pills up with each other.
        // It wraps to its own line on a narrow screen rather than squeezing the
        // pills, which is the failure mode a fixed label usually has.
        flex: '0 0 auto', minWidth: 54,
        fontSize: 8, fontWeight: 900, letterSpacing: '.14em',
        textTransform: 'uppercase', color: C.text3, fontFamily: NUM_FONT,
      }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: '1 1 auto' }}>
        {options.map((o) => {
          const on = o.key === value
          const accent = o.color || C.orange
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange?.(o.key)}
              aria-pressed={on}
              title={o.title || title}
              style={{
                padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
                whiteSpace: 'nowrap',
                border: `1px solid ${on ? accent : C.border}`,
                background: on ? `${accent}22` : 'transparent',
                color: on ? accent : C.text3,
              }}
            >{o.label}</button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The sentence that says what you are looking at.
 *
 * It already existed — every board on this page has had a one-line answer
 * written for it since August. It was rendered inside `WhatThis`, a <details>
 * COLLAPSED BY DEFAULT behind a 9px summary reading "what this answers", and
 * duplicated into a `title=` tooltip that a phone cannot show at all.
 *
 * So the single sentence written specifically to stop people feeling lost was,
 * on the device where most of them are lost, unreachable. It is printed now.
 * The receipts clause that used to sit beside it still folds; a measured
 * record is worth a tap, an orientation sentence is not.
 */
export function LensAnswer({ children, maxWidth = 840 }) {
  if (!children) return null
  return (
    <p style={{
      margin: '2px 0 10px', maxWidth,
      fontSize: 11, color: C.text2, lineHeight: 1.6,
    }}>{children}</p>
  )
}
