'use client'
// THE STREAK VIEWS, EVERY SPORT (Donovan 10-18: he picked D and B for TUDDY's streaks, then "copy these to MLB, NHL").
// Pure drawing, the product's own theme passed in (C, accent, numFont); the numbers are the caller's.
//   HeatQuadrant  every player as a dot: across = his longer window (season / last 30), up = his last 5, on one scale
//                 (`max`). Up-left is heating up, up-right hot, down-right cooling, down-left cold; above the dashed
//                 diagonal = running hotter than his own norm. Names only where they clear the others. A tap picks him.
//   ValueBars     one player's recent games as their real values against a dashed line (the bar, or his own norm),
//                 so "by how much" shows, not only hit or miss.
import { alpha } from '../../lib/scales'

const W = 340, H = 230, PAD = { l: 30, r: 10, t: 14, b: 26 }
const nudge = (id, k) => { let h = 0; for (const ch of `${id}${k}`) h = (h * 31 + ch.charCodeAt(0)) % 997; return ((h % 11) - 5) * 1.1 }
const surname = (n) => String(n || '').trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).slice(-1)[0] || n

/** points: [{ id, name, x, y }]; max: the scale's top (100 for rates); fmt(v) for the axis ticks */
export function HeatQuadrant({ points, picked, onPick, labels = 6, side = 'over', max = 100, fmt = (v) => `${v}%`, xLabel = '→ this season', yLabel = '↑ last 5', C, accent, numFont }) {
  if (!points?.length) return null
  const sx = (v) => PAD.l + ((W - PAD.l - PAD.r) * Math.min(v, max)) / max
  const sy = (v) => H - PAD.b - ((H - PAD.t - PAD.b) * Math.min(v, max)) / max
  const mid = max / 2
  const named = new Set([...points].sort((a, b) => (side === 'over' ? (b.y - a.y) || (b.x - a.x) : (a.y - b.y) || (a.x - b.x))).slice(0, labels).map((r) => r.id))
  if (picked) named.add(picked)
  const corner = (x, y, anchor, t) => <text x={x} y={y} textAnchor={anchor} fontSize="10" fill={C.text3} style={{ fontFamily: numFont, letterSpacing: '.06em' }}>{t}</text>
  // NO NAME ON A NAME: right of the dot, then left, then below; a label that fits none is left off (the dot's title names him)
  // the four corner words take their space first, so no name lands on them
  const placed = [
    [sx(max * 0.02), sy(max * 0.96) - 10, sx(max * 0.02) + 70, sy(max * 0.96) + 2], [sx(max * 0.98) - 30, sy(max * 0.96) - 10, sx(max * 0.98), sy(max * 0.96) + 2],
    [sx(max * 0.98) - 60, sy(max * 0.04) - 10, sx(max * 0.98), sy(max * 0.04) + 2], [sx(max * 0.02), sy(max * 0.04) - 10, sx(max * 0.02) + 40, sy(max * 0.04) + 2],
  ]
  const sideOf = new Map()
  const tryBox = (b) => !placed.some((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]) && b[0] >= 0 && b[2] <= W
  const fits = (x, y, n, id) => {
    const w = 6.2 * n.length
    for (const [k, b] of [['r', [x + 7, y - 15, x + 7 + w, y - 3]], ['l', [x - 7 - w, y - 15, x - 7, y - 3]], ['rb', [x + 7, y + 3, x + 7 + w, y + 15]]]) {
      if (tryBox(b)) { placed.push(b); sideOf.set(id, k); return true }
    }
    return false
  }
  const pos = (p) => [sx(p.x) + nudge(p.id, 'x'), sy(p.y) + nudge(p.id, 'y')]
  const order = [...points].sort((a, b) => (b.id === picked) - (a.id === picked))
  const show = new Set(order.filter((p) => named.has(p.id) && fits(...pos(p), surname(p.name), p.id)).map((p) => p.id))
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Every player: ${xLabel.replace(/^\W+/, '')} against ${yLabel.replace(/^\W+/, '')}`} style={{ display: 'block', touchAction: 'manipulation' }}>
        <rect x={sx(mid)} y={sy(max)} width={sx(max) - sx(mid)} height={sy(mid) - sy(max)} fill={alpha(accent, 0.06)} />
        <line x1={sx(mid)} x2={sx(mid)} y1={sy(0)} y2={sy(max)} stroke={C.border2} />
        <line x1={sx(0)} x2={sx(max)} y1={sy(mid)} y2={sy(mid)} stroke={C.border2} />
        <line x1={sx(0)} x2={sx(max)} y1={sy(0)} y2={sy(max)} stroke={C.border} strokeDasharray="3 4" />
        {corner(sx(max * 0.02), sy(max * 0.96), 'start', 'HEATING UP')}
        {corner(sx(max * 0.98), sy(max * 0.96), 'end', 'HOT')}
        {corner(sx(max * 0.98), sy(max * 0.04), 'end', 'COOLING')}
        {corner(sx(max * 0.02), sy(max * 0.04), 'start', 'COLD')}
        {[0, mid, max].map((v) => <text key={`x${v}`} x={sx(v)} y={H - 10} textAnchor="middle" fontSize="10" fill={C.text3} style={{ fontFamily: numFont }}>{fmt(v)}</text>)}
        {[mid, max].map((v) => <text key={`y${v}`} x={PAD.l - 5} y={sy(v) + 3} textAnchor="end" fontSize="10" fill={C.text3} style={{ fontFamily: numFont }}>{fmt(v)}</text>)}
        {points.map((p) => {
          const [x, y] = pos(p); const up = p.y > p.x; const on = picked === p.id; const sd = sideOf.get(p.id)
          return (
            <g key={p.id} onClick={() => onPick(p.id)} style={{ cursor: 'pointer' }}>
              <title>{p.title || p.name}</title>
              <circle cx={x} cy={y} r="11" fill="transparent" />
              <circle cx={x} cy={y} r={on ? 6 : 4} fill={on ? C.text : up ? accent : alpha(C.text3, 0.7)} stroke={on ? accent : 'none'} strokeWidth="2" />
              {show.has(p.id) && <text x={sd === 'l' ? x - 7 : x + 7} y={sd === 'rb' ? y + 13 : y - 6} textAnchor={sd === 'l' ? 'end' : 'start'} fontSize="10.5" fontWeight="800" fill={on ? C.text : C.text2}>{surname(p.name)}</text>}
            </g>
          )
        })}
      </svg>
      <figcaption style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.text3, fontFamily: numFont, marginTop: 2 }}>
        <span>{xLabel}</span><span>{yLabel}</span><span><span style={{ color: accent }}>●</span> rising</span>
      </figcaption>
    </figure>
  )
}

/** values: [{ v, label }] oldest first; line: the dashed reference (his bar, or his norm) */
export function ValueBars({ values, line, ariaLabel = '', C, accent, numFont }) {
  if (!values?.length) return null
  const max = Math.max((Number(line) || 0) * 1.6, ...values.map((g) => g.v), 1)
  const BW = 300, BH = 110, gap = 4, w = (BW - gap * (values.length - 1)) / values.length
  const y = (v) => BH - 18 - ((BH - 34) * v) / max
  const has = Number.isFinite(Number(line))
  return (
    <svg viewBox={`0 0 ${BW} ${BH}`} width="100%" role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
      {values.map((g, i) => {
        const x = i * (w + gap), hit = has && g.v >= line
        return (
          <g key={i}>
            <rect x={x} y={y(g.v)} width={w} height={Math.max(2, BH - 18 - y(g.v))} rx="3" fill={hit ? accent : alpha(C.text3, 0.55)} />
            <text x={x + w / 2} y={y(g.v) - 3} textAnchor="middle" fontSize="10" fill={hit ? C.text : C.text3} style={{ fontFamily: numFont }}>{Math.round(g.v * 10) / 10}</text>
            <text x={x + w / 2} y={BH - 5} textAnchor="middle" fontSize="9.5" fill={C.text3} style={{ fontFamily: numFont }}>{g.label}</text>
          </g>
        )
      })}
      {has && <line x1="0" x2={BW} y1={y(line)} y2={y(line)} stroke={C.text2} strokeDasharray="4 4" />}
    </svg>
  )
}
