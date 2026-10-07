'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { alpha } from '../../../lib/scales'
import { rollingSeries } from '../../../lib/nhl/goalLog'

// 📈 ROLLING FORM. MOONSHOT's RollingForm is the site's pick backtest, not a
// per-player chart; the per-player form chart on MOONSHOT's card is the prop
// grid's bars (GoalGrid carries those). This is the missing view of the same
// log: his trailing goals (or shots) a game, one point per game, over a window
// you pick. A point exists only once a full window of games stands behind it:
// the first games of the season are drawn as faint bars and carry no line.
const STATS = [['g', 'Goals', 'goals'], ['shots', 'Shots', 'shots']]
const WINS = [5, 10]
const W = 360; const H = 130; const PAD = { l: 26, r: 8, t: 8, b: 16 }

export default function GoalForm({ rows }) {
  const [stat, setStat] = useState('g')
  const [win, setWin] = useState(10)
  const series = rollingSeries(rows, stat, win)
  const word = STATS.find((s) => s[0] === stat)[2]
  const full = series.filter((p) => p.v != null)
  if (series.length < win + 2 || !full.length) {
    return <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5 }}>{series.length} games on file: a {win}-game form line needs at least {win + 2}. Shown once he has them.</div>
  }
  const season = series.reduce((t, p) => t + p.x, 0) / series.length
  const maxY = Math.max(1, ...series.map((p) => p.x), ...full.map((p) => p.v)) * 1.1
  const x = (i) => PAD.l + (i / Math.max(1, series.length - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - v / maxY) * (H - PAD.t - PAD.b)
  const path = full.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const last = full[full.length - 1]
  const barW = Math.max(2, ((W - PAD.l - PAD.r) / series.length) * 0.6)
  const ticks = [0, maxY / 2, maxY].map((v) => Math.round(v * 10) / 10)
  const chip = (on) => ({ minHeight: 44, minWidth: 44, padding: '0 12px', cursor: 'pointer', borderRadius: 8, border: `1px solid ${on ? C.ice : C.border}`, background: on ? alpha(C.ice, 0.18) : 'transparent', color: on ? C.ice : C.text3, font: `900 12px/1 ${NUM_FONT}` })
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {STATS.map(([k, label]) => <button key={k} type="button" aria-pressed={stat === k} onClick={() => setStat(k)} style={chip(stat === k)}>{label}</button>)}
        {WINS.map((w) => <button key={w} type="button" aria-pressed={win === w} onClick={() => setWin(w)} style={chip(win === w)}>{w}-game</button>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`His trailing ${win}-game ${word} per game, now ${last.v.toFixed(2)}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={C.border} strokeWidth="1" />
            <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fill={C.text3} fontSize="10" fontFamily={NUM_FONT}>{t}</text>
          </g>
        ))}
        {series.map((p) => <rect key={p.i} x={x(p.i) - barW / 2} y={y(p.x)} width={barW} height={Math.max(0, y(0) - y(p.x))} fill={alpha(C.ice, 0.18)}><title>{`${p.date} ${p.home ? 'vs' : '@'} ${p.opp}: ${p.x} ${word}`}</title></rect>)}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(season)} y2={y(season)} stroke={C.text3} strokeWidth="1" strokeDasharray="4 3" />
        <path d={path} fill="none" stroke={C.ice} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.i)} cy={y(last.v)} r="3.5" fill={C.ice} />
      </svg>
      <div style={{ color: C.text2, fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
        Last {win} games: <b style={{ color: C.text, fontFamily: NUM_FONT }}>{last.v.toFixed(2)}</b> {word} a game, against <b style={{ color: C.text, fontFamily: NUM_FONT }}>{season.toFixed(2)}</b> over his {series.length} on file. Faint bars are single games; the dashed rule is the season average. The line starts at game {win}, once a full window stands behind it.
      </div>
    </div>
  )
}
