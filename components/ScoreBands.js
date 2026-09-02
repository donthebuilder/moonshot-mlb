'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import FreshnessStamp from './FreshnessStamp'
import {
  SCORE_BANDS, BAND_OUTCOMES, BAND_ORDER, bandWindow, baseRate,
} from '../lib/scoreBands'

// 📊 WHAT A SCORE IS WORTH — the band table, on screen.
//
// 2026-08-16, Donovan: "based on the data what band of hr score goes [yard]
// every... like 70 an up, 70-50, 50-30, 40 or lower, unscored... and if you
// can do that for each category too based on hitting a hr, and if you want you
// can do it for hits and hrr, well all the categories."
//
// He asked for one score against one outcome. What the archive actually
// supports is the whole matrix — seven scores x five outcomes — and the
// matrix is the more useful object, because the interesting cells are the ones
// nobody would have thought to ask for. hr_score sorting home runs is the
// expected answer; hr_score sorting hits BACKWARDS is the one that changes how
// you read a board.
//
// ── WHY THIS IS A HEATMAP AND NOT FIVE SENTENCES ────────────────────────────
//
// The house rule is that tiles lose to sentences, and it holds — for facts you
// read one at a time. This is not that. It is 35 cells whose whole meaning is
// in the COMPARISON between them, down a column and across a row, and a
// paragraph cannot hold a two-dimensional comparison. The dataviz rule for
// exactly this shape is a heatmap with the value printed in the cell, so it
// reads as a table when you want a number and as a picture when you want the
// pattern. Every cell still carries its own k/n, so nothing is a bare colour.
//
// ── COLOUR ENCODES LIFT, NOT RATE ───────────────────────────────────────────
//
// Colouring by raw rate would paint the whole "1+ hit" column bright (65.8%
// base) and the whole "HR" column dark (15.7% base) and say nothing except
// that hits are commoner than homers. What matters is the DEVIATION from that
// outcome's own base rate, so the ramp is diverging and centred on the base,
// per column. Cyan above, red below, and the number is always printed — colour
// is the second telling, never the only one.
//
// ── THE GREY CELLS ARE THE POINT ────────────────────────────────────────────
//
// A cell whose column trend fails (|z| < 1.96, or an adjacent band
// significantly out of order) is rendered in flat grey no matter how big its
// number looks. Those bands are not evidence about the score, and letting a
// 22.6%-off-93-rows cell glow like a finding is precisely the mistake this
// whole table exists to prevent.

const CELL_W = 108

function tint(lift, claims) {
  if (!claims || lift == null) return { bg: 'transparent', fg: C.text3 }
  // Saturate at 10 points, which is roughly the largest honest lift in the
  // table — beyond that the ramp would compress everything real into one hue.
  const t = Math.max(-1, Math.min(1, lift / 10))
  const a = Math.abs(t)
  if (a < 0.08) return { bg: 'transparent', fg: C.text2 }
  const hue = t > 0 ? '34,211,238' : '248,113,113'
  return {
    bg: `rgba(${hue},${(0.07 + 0.3 * a).toFixed(3)})`,
    fg: t > 0 ? C.cyan : C.red,
  }
}

export default function ScoreBands() {
  const [only, setOnly] = useState(null)   // null = every outcome
  const scores = Object.entries(SCORE_BANDS.scores || {})
  const outs = only ? BAND_OUTCOMES.filter((o) => o.key === only) : BAND_OUTCOMES

  return (
    <div>
      <FreshnessStamp
        label="Bands archive"
        from={SCORE_BANDS.from}
        to={SCORE_BANDS.to}
        count={SCORE_BANDS.nights}
      />
      <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.72, color: C.text2, maxWidth: 800 }}>
        Every score on the site, cut into bands, against what the hitters in that band{' '}
        <b style={{ color: C.text }}>actually did</b> —{' '}
        <b style={{ color: C.text }}>{SCORE_BANDS.judgeable.toLocaleString()}</b> graded plate
        appearances over <b style={{ color: C.text }}>{bandWindow()}</b>.{' '}
        {(SCORE_BANDS.rows - SCORE_BANDS.judgeable).toLocaleString()} more rows are void — the hitter
        never came to the plate, so he was not tested and is out of every denominator.
      </p>

      <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.7, color: C.text3, maxWidth: 800 }}>
        This is the one place a 0-100 score is allowed to wear a percentage, and only because the
        percentage is not the score — it is a <b style={{ color: C.text2 }}>measured frequency with its
        denominator attached</b>. Colour is the gap from that outcome&rsquo;s own base rate, per column.{' '}
        <b style={{ color: C.text2 }}>A grey cell is a cell that has a number but no claim</b>: its
        column&rsquo;s trend is inside the noise, or a band sits significantly out of order, and the
        table refuses to dress that as a finding.
      </p>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setOnly(null)} style={pill(only === null)}>all outcomes</button>
        {BAND_OUTCOMES.map((o) => (
          <button key={o.key} onClick={() => setOnly(o.key)} style={pill(only === o.key)}>
            {o.label} <span style={{ opacity: .6 }}>{fmt(baseRate(o.key))} base</span>
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: NUM_FONT, fontSize: 10.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: 128, position: 'sticky', left: 0, background: C.bg, zIndex: 2 }}>score</th>
              <th style={{ ...th, minWidth: 62 }}>band</th>
              {outs.map((o) => (
                <th key={o.key} style={{ ...th, minWidth: CELL_W }}>
                  {o.label}
                  <div style={{ fontWeight: 500, color: C.text3, fontSize: 9 }}>{o.bar}</div>
                  <div style={{ fontWeight: 700, color: C.text3, fontSize: 9 }}>base {fmt(baseRate(o.key))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map(([skey, s]) => {
              const bands = BAND_ORDER.filter((b) => s.bands?.[b])
              return bands.map((b, i) => (
                <tr key={`${skey}-${b}`}>
                  {i === 0 && (
                    <td rowSpan={bands.length} style={{
                      ...td, textAlign: 'left', verticalAlign: 'top', fontWeight: 800,
                      color: C.text, borderTop: `2px solid ${C.border2}`,
                      position: 'sticky', left: 0, background: C.bg, zIndex: 1,
                    }}>
                      {s.label}
                      <div style={{ fontWeight: 500, fontSize: 9, color: C.text3, marginTop: 2 }}>{skey}</div>
                    </td>
                  )}
                  <td style={{
                    ...td, fontWeight: 800,
                    color: b === 'unscored' ? C.text3 : C.text2,
                    borderTop: i === 0 ? `2px solid ${C.border2}` : `1px solid ${C.border}`,
                  }}>{b}</td>
                  {outs.map((o) => {
                    const cell = s.bands[b][o.key]
                    const t = s.trend?.[o.key] || {}
                    const claims = b !== 'unscored' && Math.abs(t.z ?? 0) >= 1.96 && !!t.ordered
                    const p = cell[1] ? (100 * cell[0]) / cell[1] : null
                    const lift = p == null ? null : p - baseRate(o.key)
                    const { bg, fg } = tint(lift, claims)
                    return (
                      <td key={o.key}
                        title={`${s.label} ${b} → ${o.bar}: ${cell[0]} of ${cell[1]}`
                          + `\nBase rate for this outcome: ${fmt(baseRate(o.key))}`
                          + `\nColumn trend z = ${t.z}, bands ${t.ordered ? 'in order' : 'OUT OF ORDER'}`
                          + (claims ? '' : '\nGrey: this column does not support a claim about the score.')}
                        style={{
                          ...td, background: bg,
                          borderTop: i === 0 ? `2px solid ${C.border2}` : `1px solid ${C.border}`,
                        }}>
                        <span style={{ fontWeight: 800, color: fg }}>{fmt(p)}</span>
                        <span style={{ color: C.text3, fontSize: 9 }}> {cell[0]}/{cell[1]}</span>
                      </td>
                    )
                  })}
                </tr>
              ))
            })}
          </tbody>
        </table>
      </div>
      {/* No trend footer. The first draft had one, and it was filler: the
          trend is per score x outcome, not per column, so a single row under
          the table cannot hold it and ended up saying "hover a cell" five
          times. The z lives in each cell's tooltip, the claim/no-claim call is
          already carried by colour vs grey, and the interpretation is in
          sentences below. A row that exists to look complete is worse than no
          row. */}

      {/* THE FINDINGS, IN SENTENCES. The matrix is for comparing; this is for
          the five things a reader should leave with, which a grid cannot say.
          Every figure here is in the table above — nothing new, just named. */}
      <div style={{ marginTop: 18, maxWidth: 800, fontSize: 12, lineHeight: 1.75, color: C.text2 }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: C.text3, marginBottom: 7 }}>
          WHAT THIS SAYS
        </div>
        <Point n={1} color={C.cyan}>
          <b style={{ color: C.text }}>The HR score does sort home runs</b>, cleanly and in order —
          19.8% at 70+, then 16.5, 15.4, 10.7, against a 15.7% base (z = +5.67). But read the size of
          it: the top band is a <b style={{ color: C.text }}>1.26&times;</b> lift, not a
          transformation. A 70 is a lean, not a lock.
        </Point>
        <Point n={2} color={C.red}>
          <b style={{ color: C.text }}>The HR score runs BACKWARDS on contact.</b> Hitters at 70+ get
          a hit 62.8% of the time; hitters under 30 get one 68.4% (z = &minus;2.96, in order). Same
          story for multi-hit. That is correct behaviour for a power score — big swings miss more —
          and it is a trap if you read a high HR score as &ldquo;good hitter tonight&rdquo;.
        </Point>
        <Point n={3} color={C.cyan}>
          <b style={{ color: C.text }}>The HRR score is the best number on this site</b>, and it is
          not close. It is significant AND in order on <b style={{ color: C.text }}>all five</b>{' '}
          outcomes, including home runs (18.7% down to 5.9%). Nothing else manages more than three.
        </Point>
        <Point n={4} color={C.text3}>
          <b style={{ color: C.text }}>The hit score does not predict home runs at all</b> (z =
          &minus;0.24) — which is the coherence rule holding rather than a fault. Each score owns its
          own market, and this is what that looks like when it works.
        </Point>
        <Point n={5} color={C.red}>
          <b style={{ color: C.text }}>Top board v2 is inverted on everything except home runs.</b>{' '}
          It sorts HR (z = +3.32) and actively mis-sorts 1+ hit, multi-hit and total bases. Consistent
          with the earlier multi-hit finding: the TOP pick is the worst place on the board to look for
          a contact night.
        </Point>
      </div>

      <p style={{ marginTop: 14, fontSize: 10, color: C.text3, lineHeight: 1.6, maxWidth: 800 }}>
        Measured off the graded archive, not the live slate, and <b style={{ color: C.text2 }}>baked
        into the build</b> — the 2.5 GB archive lives on the machine that runs the bot, not somewhere
        a browser can reach. Regenerate with <code>mock/gen_bands_js.py</code> when the archive grows.
        Window and denominators are printed above so a stale figure cannot hide.
      </p>
    </div>
  )
}

function Point({ n, color, children }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'baseline', marginBottom: 8 }}>
      <span style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        background: `${color}22`, border: `1px solid ${color}66`, color,
        fontSize: 9.5, fontWeight: 900, fontFamily: NUM_FONT,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transform: 'translateY(2px)',
      }}>{n}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

const fmt = (v) => (v == null ? '—' : `${v.toFixed(1)}%`)

const th = {
  padding: '5px 9px', textAlign: 'right', fontSize: 9.5, fontWeight: 800,
  color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '.06em',
  borderBottom: '1px solid #27272a', whiteSpace: 'nowrap',
}
const td = {
  padding: '5px 9px', textAlign: 'right', whiteSpace: 'nowrap',
}

function pill(on) {
  return {
    padding: '4px 11px', borderRadius: 8, cursor: 'pointer',
    fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
    border: `1px solid ${on ? C.cyan : C.border}`,
    background: on ? 'rgba(34,211,238,.13)' : 'transparent',
    color: on ? C.cyan : C.text3,
  }
}
