'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fmtOdds } from '../lib/odds'
import { Empty } from './ui'
import {
  BLANK_MARKETS, MIN_N, blankRows, blankPool, blankDataPublished,
} from '../lib/blankBoard'

// 🧊 AFTER A BLANK — the board and its chart.
//
// The derivation, the definitions and the reason a value verdict is allowed
// here at all live in lib/blankBoard.js. This file is the view.
//
// ── THE CHART IS A PAIRED DOT PLOT, AND THAT IS THE WHOLE POINT ─────────────
//
// The question is not "who has the highest rate" — that is a column, and it is
// in the table below. The question is "where does his own record disagree with
// what the book is charging", which is a COMPARISON, and a comparison of two
// probabilities on the same 0-100 scale is a dumbbell: a hollow ring for what
// the price demands, a filled dot for what he actually does, and the segment
// between them IS the edge. Sorted by that gap, the board reads top-down as
// best-priced to worst with no number-hunting.
//
// Deliberate choices, each of which a bar chart would have got wrong:
//   · ONE SCALE, both marks. Two y-axes for "his rate" and "implied" would be
//     the classic dual-axis lie; they are the same unit, so they share an axis.
//   · The gap is DIRECT-LABELLED and signed, and its direction is positional
//     (dot right of ring = value). Colour is a third telling, not the only
//     one — green and red sit at ΔE 7.9 under deuteranopia, which is legal
//     only with exactly this kind of secondary encoding.
//   · Rings, not a second colour, for the price. It is a reference, not a
//     series, and giving it a hue would imply two competing measurements
//     rather than a measurement against a threshold.
//   · Only rows with BOTH a real sample and a matching price are plotted.
//     Everything else is in the table, and the caption says how many — a
//     chart that silently drops half its subjects reads as coverage.

const W = 820
const ROW_H = 23
const PAD_L = 148
const PAD_R = 74
const MAX_ROWS = 14

const pctX = (v) => PAD_L + (Math.max(0, Math.min(100, v)) / 100) * (W - PAD_L - PAD_R)

function Chart({ rows, marketLabel }) {
  const [hover, setHover] = useState(null)
  const plot = rows.slice(0, MAX_ROWS)
  const H = plot.length * ROW_H + 34
  if (!plot.length) return null

  return (
    <div style={{ overflowX: 'auto', marginBottom: 14 }}>
      {/* Two mark types, both named here rather than in a legend box — the
          skill's rule is that identity is never colour-alone, and a shape
          named in words is stronger than a swatch. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 10, color: C.text3, marginBottom: 6, fontFamily: NUM_FONT }}>
        <span><svg width="11" height="11" style={{ verticalAlign: -1 }}><circle cx="5.5" cy="5.5" r="4" fill="none" stroke={C.text3} strokeWidth="1.6" /></svg> what the book&apos;s price needs</span>
        <span><svg width="11" height="11" style={{ verticalAlign: -1 }}><circle cx="5.5" cy="5.5" r="4.5" fill={C.cyan} /></svg> what he does after a blank</span>
        <span style={{ color: C.text3 }}>— the segment between them is the edge</span>
      </div>
      <svg width={W} height={H} role="img" aria-label={`Measured ${marketLabel} rate after a blank versus the price's implied rate, per hitter`}>
        {/* recessive grid */}
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={pctX(t)} y1={4} x2={pctX(t)} y2={H - 24} stroke={C.border} strokeWidth="1" />
            <text x={pctX(t)} y={H - 10} textAnchor="middle" fontSize="9" fill={C.text3} fontFamily={NUM_FONT}>{t}%</text>
          </g>
        ))}
        {plot.map((r, i) => {
          const y = 14 + i * ROW_H
          const xNeed = pctX(r.need)
          const xRate = pctX(r.rate)
          const good = r.edge >= 0
          const col = good ? C.green : C.red
          const on = hover === r.id
          return (
            <g key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
              <title>
                {`${r.name} (${r.team} vs ${r.opp}) — ${r.line} last game${r.streak > 1 ? `, ${r.streak} straight blanks` : ''}\n`
                  + `After a blank he has ${marketLabel} in ${r.count} of ${r.den} games (${Math.round(r.rate)}%)\n`
                  + `Book ${fmtOdds(r.over)} needs ${Math.round(r.need)}%${r.book ? ` · ${r.book}` : ''}\n`
                  + `His true price at that rate: ${fmtOdds(r.fair)}`}
              </title>
              {on && <rect x={0} y={y - 11} width={W} height={ROW_H - 2} fill="rgba(255,255,255,.04)" rx="4" />}
              <text x={PAD_L - 10} y={y + 3.5} textAnchor="end" fontSize="11" fontWeight="700"
                fill={on ? C.text : C.text2}>{r.name}</text>
              {/* the gap. 2px, with a surface-coloured gap either side so the
                  marks never bleed into the connector. */}
              <line
                x1={Math.min(xNeed, xRate) + 6} y1={y}
                x2={Math.max(xNeed, xRate) - 6} y2={y}
                stroke={col} strokeWidth="2" strokeLinecap="round"
                opacity={Math.abs(r.edge) < 1 ? 0 : 1}
              />
              {/* ORDER MATTERS. The dot carries a 2px surface ring so it never
                  bleeds into the connector — which also means it paints over
                  anything beneath it. When his rate and the price land on the
                  same number the two marks coincide, and drawing the reference
                  first made it disappear entirely: the row rendered as a lone
                  dot claiming nothing. The reference is hollow, so drawing it
                  LAST shows both — the dot fills its centre. */}
              <circle cx={xRate} cy={y} r="5" fill={C.cyan} stroke={C.bg2} strokeWidth="2" />
              <circle cx={xNeed} cy={y} r="4.5" fill="none" stroke={C.text3} strokeWidth="1.8" />
              <text x={W - PAD_R + 12} y={y + 3.5} fontSize="10.5" fontWeight="800"
                fill={Math.abs(r.edge) < 0.5 ? C.text3 : col} fontFamily={NUM_FONT}>
                {Math.abs(r.edge) < 0.5 ? 'level' : `${good ? '+' : '−'}${Math.abs(Math.round(r.edge))} pts`}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Row({ r, marketLabel, onPlayerClick }) {
  const has = r.edge != null
  const col = !has ? C.text3 : r.edge >= 0 ? C.green : C.red
  return (
    <button
      onClick={() => onPlayerClick?.(r.p)}
      style={{
        display: 'grid', width: '100%', textAlign: 'left', cursor: 'pointer',
        gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1.5fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) minmax(0,.8fr)',
        gap: 8, alignItems: 'center', padding: '7px 10px',
        borderTop: `1px solid ${C.border}`, background: 'transparent',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{r.name}</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {r.team} vs {r.opp}</span>
      </span>
      <span style={{ fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT }}>
        {r.line}
        {r.streak > 1 && <span title={`${r.streak} straight games without a hit`} style={{ color: '#38bdf8' }}> · {r.streak} straight</span>}
      </span>
      <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: r.thin ? C.text3 : C.text2 }}>
        <b style={{ color: r.thin ? C.text3 : C.cyan }}>{r.count}</b> of {r.den}
        {r.rate != null
          ? <span style={{ color: C.text3 }}> · {Math.round(r.rate)}%</span>
          : <span title={`Fewer than ${MIN_N} games after a blank — too thin to quote a rate off`} style={{ color: C.text3 }}> · thin</span>}
      </span>
      <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text2 }}>
        {r.fair != null
          ? <span title={`What ${marketLabel} would have to pay to be worth taking at his own measured rate`}>{fmtOdds(r.fair)}</span>
          : <span style={{ color: C.text3 }}>—</span>}
      </span>
      <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text2 }}>
        {r.over != null
          ? <span title={r.book ? `Best price: ${r.book}` : 'Book price'}>{fmtOdds(r.over)}
            {r.need != null && <span style={{ color: C.text3 }}> · needs {Math.round(r.need)}%</span>}</span>
          : <span style={{ color: C.text3 }}>no price</span>}
      </span>
      <span style={{ fontSize: 11, fontFamily: NUM_FONT, fontWeight: 800, color: has && Math.abs(r.edge) >= 0.5 ? col : C.text3, textAlign: 'right' }}>
        {!has ? '—' : Math.abs(r.edge) < 0.5 ? 'level' : `${r.edge >= 0 ? '+' : '−'}${Math.abs(Math.round(r.edge))}`}
      </span>
    </button>
  )
}

export default function BlankBoard({ players = [], odds = null, onPlayerClick }) {
  const [market, setMarket] = useState('hit')
  const m = BLANK_MARKETS.find((x) => x.key === market) || BLANK_MARKETS[0]

  const published = useMemo(() => blankDataPublished(players), [players])
  const rows = useMemo(() => blankRows(players, odds, market), [players, odds, market])
  const pool = useMemo(() => blankPool(rows), [rows])

  // THE BOT MAY NOT HAVE SHIPPED THIS YET. It deploys on its own schedule from
  // another repo, so an honest "not published" beats "0 hitters blanked", which
  // is a claim and a false one.
  if (!published) {
    return (
      <Empty text={'The bot has not published last-game lines yet. This board reads last_game_* / after_blank_* off the slate — '
        + 'they arrive with the next run of the bot that carries compute_blank_profile.'} />
    )
  }
  if (!rows.length) return <Empty text="Nobody on tonight's slate went hitless in his last game." />

  const plotted = rows.filter((r) => r.edge != null)
  const hidden = rows.length - Math.min(plotted.length, MAX_ROWS)

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {BLANK_MARKETS.map((x) => (
          <button key={x.key} onClick={() => setMarket(x.key)} style={{
            padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 10.5, fontWeight: 800,
            fontFamily: NUM_FONT,
            border: `1px solid ${market === x.key ? C.cyan : C.border}`,
            background: market === x.key ? 'rgba(34,211,238,.13)' : 'transparent',
            color: market === x.key ? C.cyan : C.text3,
          }}>{x.label}</button>
        ))}
      </div>

      {/* The read, in a sentence — this board's facts, not a tile row. */}
      <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.72, color: C.text2, maxWidth: 760 }}>
        <b style={{ color: C.text }}>{rows.length}</b> hitter{rows.length === 1 ? '' : 's'} on tonight&apos;s slate
        went hitless in the last game {rows.length === 1 ? 'he' : 'they'} batted in.
        {pool.pct != null && (
          <> Pooled across every one of their careers-to-date after a blank, this group has
            {' '}<b style={{ color: C.cyan }}>{m.label}</b> in <b style={{ color: C.text2 }}>{pool.k}</b> of
            {' '}<b style={{ color: C.text2 }}>{pool.n}</b> such games — <b style={{ color: C.text2 }}>{Math.round(pool.pct)}%</b>.</>
        )}
        {plotted.length > 0
          ? <> <b style={{ color: C.text2 }}>{plotted.length}</b> of them have both a deep enough
            record ({MIN_N}+ games) and a book price on this exact bar, so those are the ones the chart can compare.</>
          : <> None of them has both a {MIN_N}-game record and a matching book price yet, so there is nothing honest to chart —
            the table below is the whole board.</>}
      </p>

      <Chart rows={plotted} marketLabel={m.label} />
      {/* NO SILENT CAPS. Both numbers that the chart leaves out are stated:
          the chartable rows below the top 14, and the rows that could never be
          charted. A chart that quietly shows a sixth of its subjects reads as
          coverage of all of them. */}
      {hidden > 0 && (
        <div style={{ fontSize: 10, color: C.text3, marginBottom: 12, lineHeight: 1.6 }}>
          Charted: the <b style={{ color: C.text2 }}>{Math.min(plotted.length, MAX_ROWS)}</b> widest gaps
          {plotted.length > MAX_ROWS && <> of the <b style={{ color: C.text2 }}>{plotted.length}</b> comparable rows</>}.
          {' '}Not charted: <b style={{ color: C.text2 }}>{rows.length - plotted.length}</b> hitter{rows.length - plotted.length === 1 ? '' : 's'}
          {' '}with no comparison to make — no book price on this bar, or fewer than {MIN_N} games after a blank.
          {' '}Every one of the {rows.length} is in the table.
        </div>
      )}

      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1.5fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr) minmax(0,.8fr)',
          gap: 8, padding: '7px 10px', fontSize: 8, letterSpacing: '.09em', textTransform: 'uppercase',
          color: C.text3, fontFamily: NUM_FONT, fontWeight: 900, background: 'rgba(255,255,255,.02)',
        }}>
          <span>hitter</span>
          <span>last game</span>
          <span title={`How often he has ${m.label} in the game after a blank`}>after a blank</span>
          <span title="What this bet must pay to be worth taking at his own measured rate">his true price</span>
          <span>book</span>
          <span style={{ textAlign: 'right' }}>edge</span>
        </div>
        {rows.map((r) => <Row key={r.id} r={r} marketLabel={m.label} onPlayerClick={onPlayerClick} />)}
      </div>

      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6, marginTop: 10, maxWidth: 760 }}>
        A <b style={{ color: C.text2 }}>blank</b> is a game he batted in and got no hit; a pinch-run or walk-only
        appearance is skipped rather than counted either way. <b style={{ color: C.text2 }}>After a blank</b> counts every
        game whose previous batted game was a blank — his own record, not the league&apos;s.
        Under {MIN_N} such games no rate is quoted and no edge is claimed, because a 3-for-4 is the most
        confident-looking wrong number on a board like this.
      </div>
    </div>
  )
}
