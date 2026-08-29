'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, n } from '../../lib/player'
import { edgeOf, fairOdds, fmtOdds, hrPerGame, impliedPct, normName } from '../../lib/odds'
import { hrOverlayRead } from '../../lib/hrOverlay'
import DenseTable from '../DenseTable'
import OddsTimeline from '../OddsTimeline'
import { btnStyle } from '../ui'

const LARGE_MOVE_PP = 3
const WATCH_MOVE_PP = 1.5
const MIN_HR_PA = 150

const MARKET_LABEL = {
  batter_home_runs: 'HR',
  batter_hits: 'Hits',
  batter_hits_runs_rbis: 'H+R+RBI',
  batter_total_bases: 'Bases',
  batter_runs_scored: 'Runs',
  batter_rbis: 'RBI',
  batter_doubles: '2B',
  batter_triples: '3B',
}

const quoteSet = (odds, p) => (
  odds?.by_player_id?.[String(p?.player_id ?? p?.id)]
  || odds?.by_name?.[normName(nameOf(p))]
  || null
)

const one = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—'
const lineText = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—'
const timeText = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function OddsSignals({ players = [], odds = null, onPlayerClick }) {
  const [mode, setMode] = useState('gaps')
  const [moveFilter, setMoveFilter] = useState('large')

  const gaps = useMemo(() => {
    const out = []
    players.forEach((p) => {
      const q = quoteSet(odds, p)?.batter_home_runs
      if (!q || Math.abs(Number(q.line) - 0.5) > 1e-9) return
      const pa = n(p?.season_pa, 0)
      const rate = hrPerGame(p)
      const over = Number(q.over)
      if (pa < MIN_HR_PA || rate == null || !Number.isFinite(over)) return
      const edge = edgeOf(q, rate)
      if (!edge || edge.need > 40) return
      out.push({
        _key: `gap-${p?.player_id}-${p?.game_pk}`,
        _raw: p,
        player: nameOf(p), tm: teamOf(p), opp: oppOf(p),
        price: over,
        need: edge.need,
        modelRate: edge.have,
        gap: edge.diff,
        fair: fairOdds(rate),
        pa,
        verdict: edge.verdict === 'value' ? 'VALUE'
          : edge.verdict === 'priced_out' ? 'PRICED OUT' : 'FAIR',
      })
    })
    return out
  }, [players, odds])

  const movements = useMemo(() => {
    const out = []
    players.forEach((p) => {
      const quotes = quoteSet(odds, p)
      if (!quotes) return
      Object.entries(quotes).forEach(([market, q]) => {
        const m = q?.movement
        const history = Array.isArray(m?.history) ? m.history : []
        if (!m || (history.length < 2 && !m.line_changed)) return
        // Number(null) is 0. A changed line deliberately carries a null
        // price delta because 0.5 and 1.5 are different bets; treating that
        // null as zero would falsely announce "no move".
        const hasOpenMove = m.from_open_pp != null && Number.isFinite(Number(m.from_open_pp))
        const hasLastMove = m.from_previous_pp != null && Number.isFinite(Number(m.from_previous_pp))
        const openMove = hasOpenMove ? Number(m.from_open_pp) : null
        const lastMove = hasLastMove ? Number(m.from_previous_pp) : null
        const magnitude = m.line_changed
          ? 100
          : Math.max(hasOpenMove ? Math.abs(openMove) : 0, hasLastMove ? Math.abs(lastMove) : 0)
        const direction = m.line_changed ? 'LINE CHANGED'
          : openMove >= LARGE_MOVE_PP ? 'SHORTENED'
            : openMove <= -LARGE_MOVE_PP ? 'DRIFTED'
              : magnitude >= WATCH_MOVE_PP ? 'WATCH' : 'SMALL'
        const isStandardHr = market === 'batter_home_runs'
          && Math.abs(Number(q.line) - 0.5) < 1e-9
          && n(p?.season_pa, 0) >= MIN_HR_PA
        const hrRate = isStandardHr ? hrPerGame(p) : null
        const hrEdge = hrRate != null ? edgeOf(q, hrRate) : null
        const modelGap = hrEdge?.diff ?? null
        const overlay = isStandardHr ? hrOverlayRead(p) : null
        const alignment = m.line_changed ? 'NEW BET'
          : modelGap >= 5 && openMove >= WATCH_MOVE_PP ? 'MODEL + MARKET'
            : modelGap >= 5 && openMove <= -WATCH_MOVE_PP ? 'MODEL VALUE + DRIFT'
              : modelGap <= -5 && openMove >= WATCH_MOVE_PP ? 'MARKET ONLY'
                : modelGap != null ? 'MODEL CHECKED' : 'MOVE ONLY'
        out.push({
          _key: `move-${p?.player_id}-${market}`,
          _raw: p,
          player: nameOf(p), tm: teamOf(p), opp: oppOf(p),
          market: MARKET_LABEL[market] || market,
          opening: m.opening_over == null ? null : Number(m.opening_over),
          current: q.over == null ? null : Number(q.over),
          moveOpen: hasOpenMove ? openMove : null,
          moveLast: hasLastMove ? lastMove : null,
          magnitude,
          openingLine: m.opening_line == null ? null : Number(m.opening_line),
          currentLine: q.line == null ? null : Number(q.line),
          direction,
          points: history.length,
          openedAt: m.opened_at || null,
          changedAt: history.at(-1)?.at || null,
          modelGap,
          hrTier: overlay?.tierLabel || null,
          alignment,
          frozen: q.frozen ? 1 : 0,
          _quote: q,
        })
      })
    })
    return out.sort((a, b) => b.magnitude - a.magnitude)
  }, [players, odds])

  const shownMoves = useMemo(() => {
    if (moveFilter === 'all') return movements
    if (moveFilter === 'line') return movements.filter((r) => r.direction === 'LINE CHANGED')
    if (moveFilter === 'short') return movements.filter((r) => Number(r.moveOpen) >= WATCH_MOVE_PP)
    if (moveFilter === 'drift') return movements.filter((r) => Number(r.moveOpen) <= -WATCH_MOVE_PP)
    if (moveFilter === 'model') return movements.filter((r) => r.alignment === 'MODEL + MARKET' || r.alignment === 'MODEL VALUE + DRIFT')
    return movements.filter((r) => r.direction === 'LINE CHANGED' || r.magnitude >= LARGE_MOVE_PP)
  }, [movements, moveFilter])

  const large = movements.filter((r) => r.direction === 'LINE CHANGED' || r.magnitude >= LARGE_MOVE_PP)
  const biggestShorten = movements.filter((r) => Number(r.moveOpen) >= LARGE_MOVE_PP)
    .sort((a, b) => b.moveOpen - a.moveOpen)[0] || null
  const biggestDrift = movements.filter((r) => Number(r.moveOpen) <= -LARGE_MOVE_PP)
    .sort((a, b) => a.moveOpen - b.moveOpen)[0] || null
  const values = gaps.filter((r) => r.gap >= 5)
  const pricedOut = gaps.filter((r) => r.gap <= -5)
  const modelAligned = movements.filter((r) => r.alignment === 'MODEL + MARKET' || r.alignment === 'MODEL VALUE + DRIFT')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>⚡ Odds signals</h2>
        <span style={{ fontSize: 10.5, color: C.text3 }}>
          shrunk season-rate-versus-book discrepancies and real intraday market movement
        </span>
      </div>
      <div style={{ fontSize: 10.5, lineHeight: 1.65, color: C.text2, maxWidth: 780, marginBottom: 11 }}>
        A <b style={{ color: C.green }}>shortening</b> means the price now requires a higher break-even probability;
        a <b style={{ color: C.blue }}>drift</b> means it requires less. A large move is an alert to investigate—not
        proof of professional betting action. Price gaps are shown only for the standard 0.5 HR market and hitters
        with at least {MIN_HR_PA} plate appearances. <b style={{ color: C.orange }}>Model + market</b> means that
        restricted HR estimate and the price direction agree; it is still a screen, not proof or a wager instruction.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 13 }}>
        <button onClick={() => setMode('gaps')} style={btnStyle(C.orange, mode === 'gaps')}>
          Price gaps · {values.length} value / {pricedOut.length} expensive
        </button>
        <button onClick={() => setMode('moves')} style={btnStyle(C.orange, mode === 'moves')}>
          Line moves · {large.length} large
        </button>
      </div>

      {mode === 'gaps' ? (
        gaps.length ? (
          <DenseTable
            heatMode="sorted"
            rows={gaps}
            columns={[
              { key: 'player', label: 'Hitter', heat: false, w: 152, bold: true, sticky: true },
              { key: 'tm', label: 'TM', heat: false, w: 34, mono: true, dim: true },
              { key: 'opp', label: 'vs', heat: false, w: 34, mono: true, dim: true },
              { key: 'price', label: 'BOOK', w: 58, heat: false,
                fmt: (v) => <b style={{ fontFamily: NUM_FONT }}>{fmtOdds(v)}</b> },
              { key: 'fair', label: 'FAIR', w: 58, heat: false,
                fmt: (v) => <span style={{ fontFamily: NUM_FONT }}>{fmtOdds(v)}</span> },
              { key: 'need', label: 'NEED %', w: 58, dp: 1, invert: true },
              { key: 'modelRate', label: 'RATE %', w: 58, dp: 1 },
              { key: 'gap', label: 'GAP', w: 52, dp: 1,
                fmt: (v) => <b style={{ fontFamily: NUM_FONT, color: v >= 5 ? C.green : v <= -5 ? C.red : C.text2 }}>{v > 0 ? '+' : ''}{one(v)}</b> },
              { key: 'verdict', label: 'READ', w: 82, heat: false,
                fmt: (v) => <b style={{ color: v === 'VALUE' ? C.green : v === 'PRICED OUT' ? C.red : C.text3 }}>{v}</b> },
              { key: 'pa', label: 'PA', w: 42, heat: false, dim: true },
            ]}
            onRowClick={onPlayerClick}
            initialSort="gap"
            maxHeight={560}
            caption="GAP is the hitter's small-sample-shrunk season HR/PA estimate minus the book's break-even probability. It is a screening signal, not a guarantee or a calibrated model forecast."
          />
        ) : (
          <EmptySignals text="No standard-line HR prices have enough season sample to compare right now." />
        )
      ) : (
        <>
          {(biggestShorten || biggestDrift) && (
            <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.7, margin: '0 0 10px' }}>
              {biggestShorten && (
                <span><b style={{ color: C.green }}>Largest rise:</b>{' '}
                  <b style={{ color: C.text }}>{biggestShorten.player}</b> {biggestShorten.market}{' '}
                  {fmtOdds(biggestShorten.opening)} → {fmtOdds(biggestShorten.current)}{' '}
                  <b style={{ color: C.green }}>+{one(biggestShorten.moveOpen)} pp</b>.</span>
              )}
              {biggestShorten && biggestDrift ? '  ' : ''}
              {biggestDrift && (
                <span><b style={{ color: C.blue }}>Largest fall:</b>{' '}
                  <b style={{ color: C.text }}>{biggestDrift.player}</b> {biggestDrift.market}{' '}
                  {fmtOdds(biggestDrift.opening)} → {fmtOdds(biggestDrift.current)}{' '}
                  <b style={{ color: C.blue }}>{one(biggestDrift.moveOpen)} pp</b>.</span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
            {[
              ['large', `Large ${large.length}`], ['short', 'Shortening'], ['drift', 'Drifting'],
              ['model', `Model aligned ${modelAligned.length}`], ['line', 'Line changed'], ['all', `All ${movements.length}`],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setMoveFilter(k)} style={btnStyle(C.blue, moveFilter === k)}>{label}</button>
            ))}
          </div>
          {shownMoves.length ? (
            <DenseTable
              heatMode="sorted"
              rows={shownMoves}
              columns={[
                { key: 'player', label: 'Hitter', heat: false, w: 152, bold: true, sticky: true },
                { key: 'market', label: 'Market', heat: false, w: 66, bold: true },
                { key: '_quote', label: 'TREND', heat: false, w: 100,
                  fmt: (v, row) => <OddsTimeline quote={row._quote} compact marketLabel={row.market} /> },
                { key: 'opening', label: 'OPEN', w: 58, heat: false,
                  fmt: (v) => <span style={{ fontFamily: NUM_FONT }}>{fmtOdds(v)}</span> },
                { key: 'current', label: 'NOW', w: 58, heat: false,
                  fmt: (v) => <b style={{ fontFamily: NUM_FONT }}>{fmtOdds(v)}</b> },
                { key: 'openingLine', label: 'OPEN LINE', w: 64, heat: false,
                  fmt: (v) => <span style={{ fontFamily: NUM_FONT }}>{lineText(v)}</span> },
                { key: 'currentLine', label: 'NOW LINE', w: 60, heat: false,
                  fmt: (v) => <b style={{ fontFamily: NUM_FONT }}>{lineText(v)}</b> },
                { key: 'moveOpen', label: 'FROM OPEN', w: 76, dp: 1,
                  title: 'Change in break-even probability points. Positive means shorter; negative means longer. Blank when the betting line changed.',
                  fmt: (v) => v == null ? '—' : <b style={{ fontFamily: NUM_FONT, color: v >= LARGE_MOVE_PP ? C.green : v <= -LARGE_MOVE_PP ? C.blue : C.text2 }}>{v > 0 ? '+' : ''}{one(v)} pp</b> },
                { key: 'moveLast', label: 'LAST MOVE', w: 70, dp: 1,
                  fmt: (v) => v == null ? '—' : <span style={{ fontFamily: NUM_FONT }}>{v > 0 ? '+' : ''}{one(v)} pp</span> },
                { key: 'direction', label: 'ALERT', w: 92, heat: false,
                  fmt: (v) => <b style={{ color: v === 'SHORTENED' ? C.green : v === 'DRIFTED' ? C.blue : v === 'LINE CHANGED' ? C.yellow : C.text3 }}>{v}</b> },
                { key: 'modelGap', label: 'HR GAP', w: 58, heat: false,
                  title: 'Only populated for the standard 0.5 HR line with at least 150 season PA.',
                  fmt: (v) => v == null ? '—' : <span style={{ fontFamily: NUM_FONT, color: v >= 5 ? C.green : v <= -5 ? C.red : C.text3 }}>{v > 0 ? '+' : ''}{one(v)}</span> },
                { key: 'hrTier', label: 'HR TIER', w: 92, heat: false, dim: true,
                  fmt: (v) => v || '—' },
                { key: 'alignment', label: 'READ', w: 126, heat: false,
                  fmt: (v) => <b style={{ color: v === 'MODEL + MARKET' ? C.green : v === 'MODEL VALUE + DRIFT' ? C.blue : v === 'MARKET ONLY' ? C.yellow : C.text3 }}>{v}</b> },
                { key: 'openedAt', label: 'OPENED', w: 62, heat: false, dim: true,
                  fmt: (v) => <span style={{ fontFamily: NUM_FONT }}>{timeText(v)}</span> },
                { key: 'changedAt', label: 'CHANGED', w: 62, heat: false, dim: true,
                  fmt: (v) => <span style={{ fontFamily: NUM_FONT }}>{timeText(v)}</span> },
                { key: 'points', label: 'SNAPS', w: 42, heat: false, dim: true },
                { key: 'frozen', label: '❄', w: 30, flag: true, mark: '❄', title: 'Frozen at first pitch.' },
              ]}
              onRowClick={onPlayerClick}
              initialSort="magnitude"
              maxHeight={560}
              caption={`Large means at least ${LARGE_MOVE_PP.toFixed(1)} break-even probability points from the opening snapshot, or a changed betting line. Prices are frozen at each player's first pitch.`}
            />
          ) : (
            <EmptySignals text={movements.length
              ? 'No prices meet this movement filter.'
              : 'Movement tracking starts after the odds bot publishes a second changed snapshot for this slate.'} />
          )}
        </>
      )}
    </div>
  )
}

function EmptySignals({ text }) {
  return (
    <div style={{ border: `1px dashed ${C.border2}`, background: C.bg2, borderRadius: 12, padding: '14px 16px', color: C.text3, fontSize: 11, lineHeight: 1.6 }}>
      {text}
    </div>
  )
}
