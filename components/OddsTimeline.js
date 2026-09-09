'use client'
import { C, NUM_FONT } from '../lib/theme'
import { fmtOdds, impliedPct } from '../lib/odds'

const finite = (value) => value == null || value === ''
  ? null
  : Number.isFinite(Number(value)) ? Number(value) : null

function pointOf(raw, fallback = {}) {
  const price = finite(raw?.over ?? raw?.price ?? raw?.odds ?? raw?.best_over ?? fallback.over)
  const implied = finite(raw?.implied ?? raw?.implied_pct) ?? impliedPct(price)
  if (price == null || implied == null) return null
  return {
    at: raw?.at || raw?.time || raw?.timestamp || raw?.collected_at || fallback.at || null,
    checkpoint: raw?.checkpoint || raw?.label || fallback.checkpoint || '',
    line: finite(raw?.line ?? fallback.line),
    price,
    implied,
  }
}

export function oddsTimelinePoints(quote) {
  if (!quote) return []
  const published = Array.isArray(quote.line_timeline) ? quote.line_timeline : []
  const intraday = Array.isArray(quote.movement?.history) ? quote.movement.history : []
  let points = (published.length ? published : intraday).map((point) => pointOf(point)).filter(Boolean)

  if (points.length < 2) {
    const opening = pointOf({
      at: quote.movement?.opened_at,
      checkpoint: 'Open',
      line: quote.movement?.opening_line,
      over: quote.movement?.opening_over,
    })
    const current = pointOf(quote, { checkpoint: quote.frozen ? 'Game start' : 'Now' })
    points = [opening, current].filter(Boolean)
  }

  const seen = new Set()
  return points.filter((point) => {
    const key = `${point.at || point.checkpoint}|${point.line}|${point.price}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function segmentsFor(points) {
  const segments = []
  points.forEach((point) => {
    const last = segments.at(-1)
    if (!last || last[0].line !== point.line) segments.push([point])
    else last.push(point)
  })
  return segments
}

const timeLabel = (point, index) => {
  if (point.checkpoint) return point.checkpoint
  if (point.at) {
    const date = new Date(point.at)
    if (Number.isFinite(date.getTime())) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return index === 0 ? 'Open' : `#${index + 1}`
}

export default function OddsTimeline({ quote, compact = false, marketLabel = 'price' }) {
  const points = oddsTimelinePoints(quote)
  if (points.length < 2) return null

  const width = compact ? 92 : 520
  const height = compact ? 34 : 122
  const padX = compact ? 3 : 18
  const padTop = compact ? 3 : 18
  const padBottom = compact ? 3 : 28
  const values = points.map((point) => point.implied)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const spread = Math.max(1, high - low)
  const x = (index) => padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2)
  const y = (value) => padTop + ((high - value) / spread) * (height - padTop - padBottom)
  const plotted = points.map((point, index) => ({ ...point, x: x(index), y: y(point.implied), index }))
  const segments = segmentsFor(plotted)
  const change = points.at(-1).implied - points[0].implied
  const tone = change > 0.05 ? C.green : change < -0.05 ? C.blue : C.text3
  const changedLine = new Set(points.map((point) => point.line).filter((line) => line != null)).size > 1

  if (compact) {
    return (
      <span title={`${marketLabel}: ${fmtOdds(points[0].price)} to ${fmtOdds(points.at(-1).price)} (${change >= 0 ? '+' : ''}${change.toFixed(1)} implied-probability points)${changedLine ? '; line changed, so the chart breaks between bets' : ''}`}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${marketLabel} odds trend`}>
          {segments.map((segment, index) => segment.length > 1 && (
            <polyline key={index} points={segment.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={tone} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {plotted.map((point) => <circle key={`${point.index}-${point.price}`} cx={point.x} cy={point.y} r="2" fill={tone} />)}
        </svg>
      </span>
    )
  }

  return (
    <section style={{ margin: '4px 0 12px', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 11, background: C.bg2 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <b style={{ color: C.text, fontSize: 11.5 }}>Price timeline · {marketLabel}</b>
        <span style={{ color: tone, fontFamily: NUM_FONT, fontSize: 10, fontWeight: 900 }}>
          {fmtOdds(points[0].price)} → {fmtOdds(points.at(-1).price)} · {change >= 0 ? '+' : ''}{change.toFixed(1)} pp
        </span>
        <span style={{ marginLeft: 'auto', color: C.text3, fontSize: 9 }}>{points.length} snapshots</span>
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${marketLabel} price from ${fmtOdds(points[0].price)} to ${fmtOdds(points.at(-1).price)}`}>
        <line x1={padX} x2={width - padX} y1={y(points[0].implied)} y2={y(points[0].implied)} stroke={C.border2} strokeDasharray="3 3" />
        {segments.map((segment, index) => segment.length > 1 && (
          <polyline key={index} points={segment.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {plotted.map((point) => (
          <g key={`${point.index}-${point.price}`}>
            <circle cx={point.x} cy={point.y} r="3.2" fill={tone} />
            <text x={point.x} y={height - 12} fill={C.text3} fontFamily={NUM_FONT} fontSize="8" textAnchor={point.index === 0 ? 'start' : point.index === points.length - 1 ? 'end' : 'middle'}>{timeLabel(point, point.index)}</text>
            <title>{timeLabel(point, point.index)} · {fmtOdds(point.price)} · {point.implied.toFixed(1)}% implied{point.line != null ? ` · line ${point.line}` : ''}</title>
          </g>
        ))}
      </svg>
      <div style={{ color: C.text3, fontSize: 9.5, lineHeight: 1.45 }}>
        Vertical movement is break-even probability, not cents. {changedLine ? 'A break marks a changed betting line—a new bet, not one continuous price.' : 'Dots are published snapshots; no price is interpolated between them.'}
      </div>
    </section>
  )
}
