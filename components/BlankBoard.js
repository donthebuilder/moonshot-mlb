'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { fmtOdds } from '../lib/odds'
import { Empty } from './ui'
import {
  BLANK_MARKETS, MIN_N, blankRows, blankPool, blankLift,
  blankDataPublished, controlPublished,
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
// SORTED BY THE GAP THAT SURVIVES THE SAMPLE (2026-08-16). The gap it ranks on
// is measured from the BOTTOM of each rate's 95% Wilson interval, not from the
// dot — otherwise a 4-for-12 fluke with a big headline number outranks a
// 30-for-50 record, which is precisely backwards. The dot still shows the
// measured rate and the whisker through it shows the interval, so the ordering
// is legible rather than applied behind the reader's back. lib/interval.js has
// the arithmetic; lib/blankBoard.js has the sort.
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
  const hasBase = plot.some((r) => r.baseRate != null)
  if (!plot.length) return null

  return (
    <div style={{ overflowX: 'auto', marginBottom: 14 }}>
      {/* Two mark types, both named here rather than in a legend box — the
          skill's rule is that identity is never colour-alone, and a shape
          named in words is stronger than a swatch. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 10, color: C.text3, marginBottom: 6, fontFamily: NUM_FONT }}>
        <span><svg width="11" height="11" style={{ verticalAlign: -1 }}><circle cx="5.5" cy="5.5" r="4" fill="none" stroke={C.text3} strokeWidth="1.6" /></svg> what the book&apos;s price needs</span>
        <span><svg width="11" height="11" style={{ verticalAlign: -1 }}><circle cx="5.5" cy="5.5" r="4.5" fill={C.cyan} /></svg> what he does after a blank</span>
        <span><svg width="20" height="11" style={{ verticalAlign: -1 }}><line x1="1" y1="5.5" x2="19" y2="5.5" stroke={C.cyan} strokeWidth="1.5" opacity="0.45" strokeLinecap="round" /></svg> where his true rate plausibly sits</span>
        {/* Only named when it is actually drawn. A legend entry for a mark
            that never appears is a promise the chart does not keep — and on a
            slate from a bot that predates the control cohorts, it never
            appears. Caught by rendering that state rather than assuming it. */}
        {hasBase && <span><svg width="11" height="12" style={{ verticalAlign: -2 }}><line x1="5.5" y1="1" x2="5.5" y2="11" stroke={C.text2} strokeWidth="1.6" /></svg> his normal rate, every game</span>}
        <span style={{ color: C.text3 }}>— the coloured segment is the edge that survives his sample size</span>
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
          // THE SEGMENT AND THE LABEL BOTH SHOW THE *SURVIVING* EDGE, because
          // that is what the board is sorted by (2026-08-16). The first cut of
          // this change sorted on the floor but kept drawing and labelling the
          // point-estimate gap, and the screenshot immediately showed why that
          // is wrong: the right-hand column read +52, +51, +24, +10, +12, +9,
          // +13 — visibly unsorted, on a chart whose caption promised order.
          // A chart ranked by a number it does not draw is a chart that looks
          // broken. So the drawn gap runs from the price to the NEAR END OF
          // THE INTERVAL, the label is that gap, and both descend with the
          // sort. The dot still marks his measured rate, so nothing is lost —
          // you read "the book needs 44, his worst case is 48, his record says
          // 69" left to right in one pass.
          const xFloor = pctX(r.floor)
          const shown = r.edgeFloor
          const good = shown >= 0
          const col = good ? C.green : C.red
          const on = hover === r.id
          return (
            <g key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
              <title>
                {`${r.name} (${r.team} vs ${r.opp}) — ${r.line} last game${r.streak > 1 ? `, ${r.streak} straight blanks` : ''}\n`
                  + `After a blank he has ${marketLabel} in ${r.count} of ${r.den} games (${Math.round(r.rate)}%)\n`
                  + (r.ci ? `On ${r.den} games the true rate plausibly sits between ${Math.round(r.ci[0])}% and ${Math.round(r.ci[1])}% — the board ranks on the low end\n` : '')
                  + (r.baseRate != null ? `His normal rate, all ${r.baseN} batted games: ${Math.round(r.baseRate)}%\n` : '')
                  + `Book ${fmtOdds(r.over)} needs ${Math.round(r.need)}%${r.book ? ` · ${r.book}` : ''}\n`
                  + `His true price at that rate: ${fmtOdds(r.fair)}`}
              </title>
              {on && <rect x={0} y={y - 11} width={W} height={ROW_H - 2} fill="rgba(255,255,255,.04)" rx="4" />}
              <text x={PAD_L - 10} y={y + 3.5} textAnchor="end" fontSize="11" fontWeight="700"
                fill={on ? C.text : C.text2}>{r.name}</text>
              {/* the gap: price → near end of the interval. 2px, inset either
                  side so the marks never bleed into the connector. */}
              <line
                x1={Math.min(xNeed, xFloor) + 5} y1={y}
                x2={Math.max(xNeed, xFloor) - 5} y2={y}
                stroke={col} strokeWidth="2" strokeLinecap="round"
                opacity={Math.abs(shown) < 1 ? 0 : 1}
              />
              {/* ORDER MATTERS. The dot carries a 2px surface ring so it never
                  bleeds into the connector — which also means it paints over
                  anything beneath it. When his rate and the price land on the
                  same number the two marks coincide, and drawing the reference
                  first made it disappear entirely: the row rendered as a lone
                  dot claiming nothing. The reference is hollow, so drawing it
                  LAST shows both — the dot fills its centre. */}
              {/* THE INTERVAL, DRAWN BECAUSE THE BOARD SORTS ON IT
                  (2026-08-16). Rows are ordered by the BOTTOM of this whisker
                  minus the price, not by the dot minus the price, so that a
                  thin 8-for-12 cannot outrank a settled 30-for-50 on a bigger
                  headline number. Sorting on something invisible is worse than
                  not sorting on it, so the uncertainty is on the chart: the
                  dot is still his measured rate, and the line through it is
                  where his true rate plausibly lives. Drawn UNDER both marks
                  and at 45% so it recedes — it is context for the dot, not a
                  third series competing with it. */}
              {r.ci && (
                <line
                  x1={pctX(r.ci[0])} y1={y} x2={pctX(r.ci[1])} y2={y}
                  stroke={C.cyan} strokeWidth="1.5" opacity="0.45" strokeLinecap="round"
                />
              )}
              {/* HIS NORMAL RATE (2026-08-16). A bare vertical tick, no fill,
                  no hue of its own — it is a second reference like the price
                  ring, not a third series. Read dot-vs-tick and you have the
                  blank's effect on this hitter; read dot-vs-ring and you have
                  the market's. Per-row the first of those is far too noisy to
                  put a number on, which is why this is a mark and not a
                  column of deltas — the number only appears pooled, in the
                  sentence above the chart. */}
              {r.baseRate != null && (
                <line
                  x1={pctX(r.baseRate)} y1={y - 6} x2={pctX(r.baseRate)} y2={y + 6}
                  stroke={C.text2} strokeWidth="1.6" strokeLinecap="round"
                />
              )}
              <circle cx={xRate} cy={y} r="5" fill={C.cyan} stroke={C.bg2} strokeWidth="2" />
              <circle cx={xNeed} cy={y} r="4.5" fill="none" stroke={C.text3} strokeWidth="1.8" />
              <text x={W - PAD_R + 12} y={y + 3.5} fontSize="10.5" fontWeight="800"
                fill={Math.abs(shown) < 0.5 ? C.text3 : col} fontFamily={NUM_FONT}>
                {Math.abs(shown) < 0.5 ? 'level' : `${good ? '+' : '−'}${Math.abs(Math.round(shown))} pts`}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Row({ r, marketLabel, onPlayerClick }) {
  // THE TABLE QUOTES THE SAME EDGE THE CHART DOES (2026-08-16). For one render
  // it did not: the chart had moved to the surviving edge while this column
  // still showed the point-estimate gap, so JJ Wetherholt read +39 on the chart
  // and +52 in the table, four inches apart, about the same bet. That is the
  // two-answers disease this repo keeps catching, and a screenshot caught it
  // again. Both are edgeFloor now. Nothing is hidden -- the raw comparison is
  // still on the row in full (his 75% beside the price's "needs 24%"), which is
  // where a reader who wants the point estimate should be reading it anyway.
  const has = r.edgeFloor != null
  const shown = r.edgeFloor
  const col = !has ? C.text3 : shown >= 0 ? C.green : C.red
  return (
    <button
      onClick={() => onPlayerClick?.(r.p)}
      style={{
        display: 'grid', width: '100%', textAlign: 'left', cursor: 'pointer',
        gridTemplateColumns: 'minmax(0,1.9fr) minmax(0,1.3fr) minmax(0,1.6fr) minmax(0,.8fr) minmax(0,.9fr) minmax(0,1fr) minmax(0,.8fr)',
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
          ? <>
            <span style={{ color: C.text3 }}> · {Math.round(r.rate)}%</span>
            {/* The interval, on the row, because the EDGE column is measured
                from its low end and a reader is entitled to see why a 69% can
                rank below a 60%. */}
            {r.ci && (
              <span title={`On ${r.den} games his true rate plausibly sits in this range. The edge column is measured from the low end.`}
                style={{ color: C.text3, opacity: .75 }}> ({Math.round(r.ci[0])}–{Math.round(r.ci[1])})</span>
            )}
          </>
          : <span title={`Fewer than ${MIN_N} games after a blank — too thin to quote a rate off`} style={{ color: C.text3 }}> · thin</span>}
      </span>
      {/* HIS NORMAL RATE, beside the after-a-blank one. Same bar, same PA
          gate, every batted game — so the two are directly comparable and the
          reader can see for himself whether the blank moved anything. No
          delta printed: per hitter that difference is inside its own noise,
          and the pooled version is stated once, above the chart. */}
      <span style={{ fontSize: 10.5, fontFamily: NUM_FONT, color: C.text3 }}>
        {r.baseRate != null
          ? <span title={`His rate over all ${r.baseN} batted games — ${r.baseCount} of ${r.baseN}. The after-a-blank column beside it is the same bar in the same games' worth of chances.`}>
            {Math.round(r.baseRate)}%<span style={{ opacity: .6 }}> of {r.baseN}</span>
          </span>
          : <span title="The bot has not published the all-games baseline yet">—</span>}
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
      <span style={{ fontSize: 11, fontFamily: NUM_FONT, fontWeight: 800, color: has && Math.abs(shown) >= 0.5 ? col : C.text3, textAlign: 'right' }}>
        {!has ? '—' : Math.abs(shown) < 0.5 ? 'level' : `${shown >= 0 ? '+' : '−'}${Math.abs(Math.round(shown))}`}
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
  const hasControl = useMemo(() => controlPublished(players), [players])
  const lift = useMemo(() => (hasControl ? blankLift(rows) : null), [hasControl, rows])

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

  // edgeFloor, not edge — a row without an interval has nothing the chart can
  // draw now that the drawn gap runs from the price to the interval's near end.
  // In practice the two filters select the same rows (both need a rate and a
  // matching price), but keying on what is actually drawn is what stops the
  // chart and its caption drifting apart the next time one of them changes.
  const plotted = rows.filter((r) => r.edgeFloor != null)
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

      {/* ── THE SECOND COMPARISON (2026-08-16) ─────────────────────────────
          Donovan: "do the board compare side to the book as well i like that."

          Everything else here measures these hitters against the SPORTSBOOK,
          which answers "is he mispriced". It leaves the board's own name
          untested: a 68% after a blank looks like a bounce-back, but 68% may
          simply be his rate. The control for that is not a book, it is him.

          Stated POOLED and nowhere else. One hitter has ~30 games after a
          blank against ~90 after a hit, and the interval on that difference is
          wide enough to swallow the effect — a per-row column would be a noise
          generator with a heading. Across the whole board the denominators run
          to thousands, which is where a few points becomes visible.

          The control is after_hit, not overall: `overall` CONTAINS the
          after-blank games, so testing against it tests a group against a
          superset of itself. */}
      {lift && (
        <p style={{
          margin: '0 0 14px', fontSize: 12, lineHeight: 1.72, maxWidth: 760,
          color: C.text2, paddingLeft: 11,
          borderLeft: `2px solid ${lift.real ? (lift.diff >= 0 ? C.green : C.red) : C.border}`,
        }}>
          <b style={{ color: C.text }}>And against themselves:</b> the same hitters have{' '}
          <b style={{ color: C.cyan }}>{m.label}</b> in{' '}
          <b style={{ color: C.text }}>{Math.round(lift.afterBlank.pct)}%</b> of the{' '}
          <b style={{ color: C.text2 }}>{lift.afterBlank.n.toLocaleString()}</b> games that followed a blank,
          against <b style={{ color: C.text }}>{Math.round(lift.afterHit.pct)}%</b> of the{' '}
          <b style={{ color: C.text2 }}>{lift.afterHit.n.toLocaleString()}</b> that followed a game they did hit in.
          {' '}
          {lift.real ? (
            <>That is <b style={{ color: lift.diff >= 0 ? C.green : C.red }}>
              {lift.diff >= 0 ? '+' : '−'}{Math.abs(lift.diff).toFixed(1)} points
            </b> at <b style={{ color: C.text2, fontFamily: NUM_FONT }}>z&nbsp;=&nbsp;{Math.abs(lift.z).toFixed(2)}</b> —
            a real difference, not noise.{' '}
            {lift.diff >= 0
              ? <><b style={{ color: C.text2 }}>The blank really does precede a better night</b> for these bats,
                so the bounce-back the board is named for is doing some of the work here, not just the price.</>
              : <><b style={{ color: C.text2 }}>These bats are WORSE after a blank, not due</b> — whatever the board
                finds above is the price being wrong, and the blank is an argument against them, not for them.</>}</>
          ) : (
            <>A gap of <b style={{ color: C.text2 }}>{lift.diff >= 0 ? '+' : '−'}{Math.abs(lift.diff).toFixed(1)} points</b>{' '}
            at <b style={{ color: C.text2, fontFamily: NUM_FONT }}>z&nbsp;=&nbsp;{Math.abs(lift.z).toFixed(2)}</b>, which is
            inside the noise. <b style={{ color: C.text2 }}>On this evidence the blank predicts nothing</b> —
            so the edges above are a story about the PRICE, not about a bounce-back.</>
          )}
        </p>
      )}
      {!hasControl && (
        <p style={{ margin: '0 0 14px', fontSize: 10.5, lineHeight: 1.6, color: C.text3, maxWidth: 760 }}>
          The against-themselves comparison needs <code style={{ fontFamily: NUM_FONT }}>overall_*</code> and{' '}
          <code style={{ fontFamily: NUM_FONT }}>after_hit_*</code>, which arrive with the next run of the bot that
          carries them. Until then this board can say whether these hitters are mispriced, but not whether the blank
          itself predicts anything.
        </p>
      )}

      <Chart rows={plotted} marketLabel={m.label} />
      {/* NO SILENT CAPS. Both numbers that the chart leaves out are stated:
          the chartable rows below the top 14, and the rows that could never be
          charted. A chart that quietly shows a sixth of its subjects reads as
          coverage of all of them. */}
      {hidden > 0 && (
        <div style={{ fontSize: 10, color: C.text3, marginBottom: 12, lineHeight: 1.6 }}>
          Charted: the <b style={{ color: C.text2 }}>{Math.min(plotted.length, MAX_ROWS)}</b> biggest edges
          {' '}that survive their own sample size
          {plotted.length > MAX_ROWS && <> — of <b style={{ color: C.text2 }}>{plotted.length}</b> comparable rows</>}.
          {' '}Not charted: <b style={{ color: C.text2 }}>{rows.length - plotted.length}</b> hitter{rows.length - plotted.length === 1 ? '' : 's'}
          {' '}with no comparison to make — no book price on this bar, or fewer than {MIN_N} games after a blank.
          {' '}Every one of the {rows.length} is in the table.
        </div>
      )}

      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.9fr) minmax(0,1.3fr) minmax(0,1.6fr) minmax(0,.8fr) minmax(0,.9fr) minmax(0,1fr) minmax(0,.8fr)',
          gap: 8, padding: '7px 10px', fontSize: 8, letterSpacing: '.09em', textTransform: 'uppercase',
          color: C.text3, fontFamily: NUM_FONT, fontWeight: 900, background: 'rgba(255,255,255,.02)',
        }}>
          <span>hitter</span>
          <span>last game</span>
          <span title={`How often he has ${m.label} in the game after a blank, then the range his true rate plausibly sits in given that many games`}>after a blank</span>
          <span title={`How often he has ${m.label} in ALL his batted games — the control. If this is the same as the column beside it, the blank did nothing.`}>normally</span>
          <span title="What this bet must pay to be worth taking at his own measured rate">his true price</span>
          <span>book</span>
          <span style={{ textAlign: 'right' }} title="The low end of his rate range minus what the price needs — the edge that survives his sample size. The board is sorted by it.">edge <span style={{ opacity: .6 }}>(worst case)</span></span>
        </div>
        {rows.map((r) => <Row key={r.id} r={r} marketLabel={m.label} onPlayerClick={onPlayerClick} />)}
      </div>

      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6, marginTop: 10, maxWidth: 760 }}>
        A <b style={{ color: C.text2 }}>blank</b> is a game he came to the plate in and got no hit — a walk-only
        night counts, because he batted and did not hit. A pinch-runner who never came to the plate is skipped, not
        counted either way. <b style={{ color: C.text2 }}>After a blank</b> counts every game whose previous
        plate-appearance game was a blank — his own record, not the league&apos;s.
        Under {MIN_N} such games no rate is quoted and no edge is claimed, because a 3-for-4 is the most
        confident-looking wrong number on a board like this.{' '}
        <b style={{ color: C.text2 }}>Order is by the conservative end of each rate, not the rate itself.</b>{' '}
        Twelve games is a floor, not a guarantee: 8-for-12 reads 67% but its 95% interval runs 39–86%, while
        30-for-50 reads 60% on an interval of 46–72%. Ranked by the bottom of those intervals the second one
        wins, which is the order you would put money in — so that is the order the board is in, and the
        whisker through each dot on the chart is the interval it was ranked on.
      </div>
    </div>
  )
}
