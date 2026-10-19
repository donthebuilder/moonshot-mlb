'use client'
// THE STREAKS PAGE'S THREE VIEWS (Donovan 10-18, he picked them: D, C and B). Pure drawing; the numbers are lib/nfl/streaks.js
// rateRows (his game logs at the chosen line). Theme colours only.
//   HeatQuadrant  every player as a dot: across = how often he cleared the line this season, up = his last 5. Up-left is
//                 heating up, up-right hot, down-right cooling, down-left cold. A tap picks the player.
//   ValueBars     one player's last 10 games: each game's real value as a bar against the dashed line, so "by how much"
//                 shows, not only hit or miss.
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { alpha } from '../../lib/scales'

const W = 340, H = 230, PAD = { l: 30, r: 10, t: 14, b: 26 }
const sx = (pct) => PAD.l + ((W - PAD.l - PAD.r) * pct) / 100
const sy = (pct) => H - PAD.b - ((H - PAD.t - PAD.b) * pct) / 100
// rates are steps of 20 / 10: a small, stable nudge per player keeps dots on one spot apart (never random)
const nudge = (id, k) => { let h = 0; for (const ch of `${id}${k}`) h = (h * 31 + ch.charCodeAt(0)) % 997; return ((h % 11) - 5) * 1.1 }
const surname = (n) => String(n || '').trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).slice(-1)[0] || n

export function HeatQuadrant({ rows, picked, onPick, labels = 6, side = 'over' }) {
  if (!rows.length) return null
  // the names worth printing: the hottest by last 5 then season (or the coldest, on the cold side)
  const named = new Set([...rows].sort((a, b) => (side === 'over' ? (b.l5.pct - a.l5.pct) || (b.szn.pct - a.szn.pct) : (a.l5.pct - b.l5.pct) || (a.szn.pct - b.szn.pct))).slice(0, labels).map((r) => r.player.player_id))
  if (picked) named.add(picked)
  const corner = (x, y, anchor, t) => <text x={x} y={y} textAnchor={anchor} fontSize="10" fill={C.text3} style={{ fontFamily: NUM_FONT, letterSpacing: '.06em' }}>{t}</text>
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Every player: how often he cleared the line this season against his last five games" style={{ display: 'block', touchAction: 'manipulation' }}>
        <rect x={sx(50)} y={sy(100)} width={sx(100) - sx(50)} height={sy(50) - sy(100)} fill={alpha(C.green, 0.06)} />
        <line x1={sx(50)} x2={sx(50)} y1={sy(0)} y2={sy(100)} stroke={C.border2} />
        <line x1={sx(0)} x2={sx(100)} y1={sy(50)} y2={sy(50)} stroke={C.border2} />
        <line x1={sx(0)} x2={sx(100)} y1={sy(0)} y2={sy(100)} stroke={C.border} strokeDasharray="3 4" />
        {corner(sx(2), sy(96), 'start', 'HEATING UP')}
        {corner(sx(98), sy(96), 'end', 'HOT')}
        {corner(sx(98), sy(4), 'end', 'COOLING')}
        {corner(sx(2), sy(4), 'start', 'COLD')}
        {[0, 50, 100].map((v) => <text key={`x${v}`} x={sx(v)} y={H - 10} textAnchor="middle" fontSize="10" fill={C.text3} style={{ fontFamily: NUM_FONT }}>{v}%</text>)}
        {[50, 100].map((v) => <text key={`y${v}`} x={PAD.l - 5} y={sy(v) + 3} textAnchor="end" fontSize="10" fill={C.text3} style={{ fontFamily: NUM_FONT }}>{v}</text>)}
        {(() => {
          // NO NAME ON A NAME (10-18: overlapping text is a bug site-wide): a label is drawn only where it clears the ones placed before it
          const placed = []
          // right of the dot first, then left of it; a label that fits neither is left off (the dot's title still names him)
          const side = new Map()
          const tryBox = (box) => !placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]) && box[0] >= 0 && box[2] <= W
          const fits = (x, y, n, id) => {
            const w = 6.2 * n.length
            for (const [k, box] of [['r', [x + 7, y - 15, x + 7 + w, y - 3]], ['l', [x - 7 - w, y - 15, x - 7, y - 3]], ['rb', [x + 7, y + 3, x + 7 + w, y + 15]]]) {
              if (tryBox(box)) { placed.push(box); side.set(id, k); return true }
            }
            return false
          }
          const order = [...rows].sort((a, b) => (b.player.player_id === picked) - (a.player.player_id === picked))
          const show = new Set(order.filter((r) => named.has(r.player.player_id) && fits(sx(r.szn.pct) + nudge(r.player.player_id, 'x'), sy(r.l5.pct) + nudge(r.player.player_id, 'y'), surname(r.player.name), r.player.player_id)).map((r) => r.player.player_id))
          return rows.map((r) => {
          const id = r.player.player_id
          const x = sx(r.szn.pct) + nudge(id, 'x'), y = sy(r.l5.pct) + nudge(id, 'y')
          const up = r.trend > 0, on = picked === id
          return (
            <g key={id} onClick={() => onPick(id)} style={{ cursor: 'pointer' }}>
              <title>{`${r.player.name}: season ${r.szn.hit}/${r.szn.n}, last 5 ${r.l5.hit}/5`}</title>
              <circle cx={x} cy={y} r="11" fill="transparent" />
              <circle cx={x} cy={y} r={on ? 6 : 4} fill={on ? C.text : up ? C.green : alpha(C.text3, 0.7)} stroke={on ? C.green : 'none'} strokeWidth="2" />
              {show.has(id) && <text x={side.get(id) === 'l' ? x - 7 : x + 7} y={side.get(id) === 'rb' ? y + 13 : y - 6} textAnchor={side.get(id) === 'l' ? 'end' : 'start'} fontSize="10.5" fontWeight="800" fill={on ? C.text : C.text2}>{surname(r.player.name)}</text>}
            </g>
          )
          })
        })()}
      </svg>
      <figcaption style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
        <span>→ this season</span><span>↑ last 5</span><span><span style={{ color: C.green }}>●</span> rising</span>
      </figcaption>
    </figure>
  )
}

export function ValueBars({ row, bar, unit = '' }) {
  if (!row) return null
  const vals = row.last
  const max = Math.max(bar * 1.6, ...vals.map((g) => g.v), 1)
  const BW = 300, BH = 110, gap = 4, w = (BW - gap * (vals.length - 1)) / vals.length
  const y = (v) => BH - 18 - ((BH - 34) * v) / max
  return (
    <svg viewBox={`0 0 ${BW} ${BH}`} width="100%" role="img" aria-label={`${row.player.name}'s last ${vals.length} games against ${bar}${unit}`} style={{ display: 'block' }}>
      {vals.map((g, i) => {
        const x = i * (w + gap), hit = g.v >= bar
        return (
          <g key={i}>
            <rect x={x} y={y(g.v)} width={w} height={Math.max(2, BH - 18 - y(g.v))} rx="3" fill={hit ? C.green : alpha(C.text3, 0.55)} />
            <text x={x + w / 2} y={y(g.v) - 3} textAnchor="middle" fontSize="10" fill={hit ? C.text : C.text3} style={{ fontFamily: NUM_FONT }}>{Math.round(g.v * 10) / 10}</text>
            <text x={x + w / 2} y={BH - 5} textAnchor="middle" fontSize="9.5" fill={C.text3} style={{ fontFamily: NUM_FONT }}>{`W${g.w}`}</text>
          </g>
        )
      })}
      <line x1="0" x2={BW} y1={y(bar)} y2={y(bar)} stroke={C.text2} strokeDasharray="4 4" />
    </svg>
  )
}
