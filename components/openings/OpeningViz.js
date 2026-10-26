'use client'
import { useState } from 'react'
import TeamMark from '../TeamMark'

// 🌀 THE OPENING, DRAWN (mock, 10-25, Donovan: "this is wack, how can we make it avant garde or more abstract" -> "1 2 and 4 and
// maybe a combo"). Three abstract reads of one game's two clubs, every mark a real count from the opening records:
//   JumpCircle  centre court: one ring per opening stat, split between the clubs by their share; the better side glows
//   FirstRain   0:00 to 2:00 of Q1: each game on file is a dot at the second the first basket fell; lit = his club got it
//   DotWall     each game on file is a dot; lit = his club scored first. The percent is the wall, not a number
// Shared: a product hands the matchup rows (FirstBasketMatchup's `versus`), the two clubs' logs ([first, tip, t] newest first),
// its theme and accent. Nothing is a chance; the captions say so.

const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

function Clubs({ game, sport, C, NUM_FONT }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.06em', color: C.text }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TeamMark sport={sport} abbr={game.away} variant="logo" px={20} />{game.away}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{`@ ${game.home}`}<TeamMark sport={sport} abbr={game.home} variant="logo" px={20} /></span>
    </div>
  )
}

const frame = (C) => ({ border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 12px 12px', display: 'grid', gap: 10 })

/** 1 · THE JUMP CIRCLE. Away fills the left of each ring from 6 o'clock, home the right; even = split at 12 and 6. Tap a ring. */
export function JumpCircle({ game, rows, sport, C, NUM_FONT, accent, bare = false }) {
  const ringRows = rows.filter((r) => r.pullA != null)
  const [on, setOn] = useState(() => Math.max(0, ringRows.findIndex((r) => r._id === 'firstPct')))
  const S = 300, cx = S / 2, cy = S / 2, outer = 140, step = 10, sw = 6
  const arc = (r, a0, a1) => {   // angles in turns, 0 = 6 o'clock, clockwise
    const pt = (a) => [cx - r * Math.sin(2 * Math.PI * a), cy + r * Math.cos(2 * Math.PI * a)]
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1)
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
  }
  const cur = ringRows[on] || null
  const body = (
    <>
      <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 320, justifySelf: 'center', display: 'block' }} role="img" aria-label={`${game.away} against ${game.home}, one ring per opening stat`}>
        <line x1={cx} y1={cy - outer - 8} x2={cx} y2={cy + outer + 8} stroke={C.border} strokeWidth={1} />
        {ringRows.map((r, i) => {
          const rad = outer - i * step
          const a = Math.min(0.999, Math.max(0.001, r.pullA))
          const lit = (s) => r.better === s
          const sel = i === on
          return (
            <g key={r._id} onClick={() => setOn(i)} style={{ cursor: 'pointer' }}>
              {/* away: clockwise from 6 o'clock up the left side; home: the rest */}
              <path d={arc(rad, 0, a)} fill="none" stroke={lit('away') ? accent : C.text3} strokeOpacity={lit('away') ? (sel ? 1 : 0.8) : (sel ? 0.7 : 0.3)} strokeWidth={sel ? sw + 2 : sw} strokeLinecap="butt" />
              <path d={arc(rad, a, 1)} fill="none" stroke={lit('home') ? accent : C.text3} strokeOpacity={lit('home') ? (sel ? 1 : 0.8) : (sel ? 0.7 : 0.3)} strokeWidth={sel ? sw + 2 : sw} strokeLinecap="butt" />
              <circle cx={cx} cy={cy} r={rad} fill="none" stroke="transparent" strokeWidth={step} />
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r={outer - ringRows.length * step - 2} fill="none" stroke={C.border} />
      </svg>
      {cur ? (
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center' }}>
          <button type="button" aria-label="Previous ring" onClick={() => setOn((on - 1 + ringRows.length) % ringRows.length)} style={{ height: 44, background: 'none', border: 0, color: C.text2, fontSize: 20 }}>‹</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', gap: 8 }}>
            <span style={{ font: `${cur.better === 'away' ? 900 : 600} 15px/1.2 ${NUM_FONT}`, color: cur.better === 'away' ? accent : C.text2 }}>{cur.clubA}</span>
            <span style={{ fontSize: 12, color: C.text2, textAlign: 'center' }}>{cur.stat}</span>
            <span style={{ font: `${cur.better === 'home' ? 900 : 600} 15px/1.2 ${NUM_FONT}`, color: cur.better === 'home' ? accent : C.text2, textAlign: 'right' }}>{cur.clubB}</span>
          </div>
          <button type="button" aria-label="Next ring" onClick={() => setOn((on + 1) % ringRows.length)} style={{ height: 44, background: 'none', border: 0, color: C.text2, fontSize: 20 }}>›</button>
        </div>
      ) : null}
    </>
  )
  if (bare) return body
  return <div style={frame(C)}><Clubs game={game} sport={sport} C={C} NUM_FONT={NUM_FONT} />{body}<div style={{ fontSize: 11, color: C.text3 }}>Outer ring: the tip. Inner: Q1. Tap a ring. Counts, not a chance.</div></div>
}

/** 2 · FIRST-SCORE RAIN. Away's games fall above the line, home's below; a dot sits at the second the game's first basket fell. */
export function FirstRain({ game, logs, sport, C, NUM_FONT, accent, bare = false }) {
  const W = 340, mid = 74, H = mid * 2, CAP = 120, x0 = 8, x1 = W - 8, d = 6
  const x = (t) => x0 + (Math.min(t, CAP) / CAP) * (x1 - x0)
  const lay = (log, dir) => {
    const stack = new Map()
    return (log || []).filter((g) => g[2] != null && g[0] != null).map((g) => {
      const bin = Math.round(x(g[2]) / d)
      const k = stack.get(bin) || 0; stack.set(bin, k + 1)
      return { cx: bin * d, cy: mid + dir * (8 + k * d), lit: g[0] === 1 }
    }).filter((p) => p.cy > 2 && p.cy < H - 2)
  }
  const med = (log) => { const ts = (log || []).filter((g) => g[0] === 1 && g[2] != null).map((g) => g[2]).sort((a, b) => a - b); return ts.length ? ts[Math.floor(ts.length / 2)] : null }
  const A = lay(logs.away, -1), Hm = lay(logs.home, 1), mA = med(logs.away), mH = med(logs.home)
  const body = (
    <>
      <svg viewBox={`0 0 ${W} ${H + 16}`} width="100%" style={{ display: 'block' }} role="img" aria-label={`When the first basket fell in each club's games`}>
        <line x1={x0} y1={mid} x2={x1} y2={mid} stroke={C.border} />
        {[0, 30, 60, 90, 120].map((t) => (
          <g key={t}><line x1={x(t)} y1={mid - 3} x2={x(t)} y2={mid + 3} stroke={C.text3} /><text x={x(t)} y={H + 12} textAnchor={t === 0 ? 'start' : t === CAP ? 'end' : 'middle'} fill={C.text3} style={{ font: `10px ${NUM_FONT}` }}>{t === CAP ? '2:00+' : fmtT(t)}</text></g>
        ))}
        {[...A, ...Hm].map((p, i) => <circle key={i} cx={p.cx} cy={p.cy} r={2.4} fill={p.lit ? accent : 'none'} stroke={p.lit ? accent : C.text3} strokeOpacity={p.lit ? 1 : 0.6} strokeWidth={1} />)}
        {mA != null ? <line x1={x(mA)} y1={4} x2={x(mA)} y2={mid} stroke={accent} strokeDasharray="2 3" /> : null}
        {mH != null ? <line x1={x(mH)} y1={mid} x2={x(mH)} y2={H - 4} stroke={accent} strokeDasharray="2 3" /> : null}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', font: `600 12px/1.2 ${NUM_FONT}`, color: C.text2 }}>
        <span>{`${game.away} ${mA != null ? fmtT(mA) : '—'}`}</span><span style={{ color: C.text3, fontWeight: 400 }}>typical first basket</span><span>{`${game.home} ${mH != null ? fmtT(mH) : '—'}`}</span>
      </div>
    </>
  )
  if (bare) return body
  return <div style={frame(C)}><Clubs game={game} sport={sport} C={C} NUM_FONT={NUM_FONT} />{body}<div style={{ fontSize: 11, color: C.text3 }}>Each dot a game: lit = they got it, hollow = the other club did. Dashes: their typical second.</div></div>
}

/** 4 · THE DOT WALL. One dot a game, newest top-left; lit = his club scored first. */
export function DotWall({ game, logs, rows, sport, C, NUM_FONT, accent, bare = false }) {
  const first = rows.find((r) => r._id === 'firstPct')
  const wall = (log, s) => {
    const g = (log || []).filter((x) => x[0] != null)
    const n = g.length, k = g.filter((x) => x[0] === 1).length
    return (
      <div style={{ display: 'grid', gap: 6, justifyItems: s === 'away' ? 'start' : 'end' }}>
        <div style={{ font: `900 28px/1 ${NUM_FONT}`, color: first?.better === s ? accent : C.text2 }}>{n ? `${Math.round((100 * k) / n)}%` : '—'}</div>
        <div style={{ font: `600 10px/1 ${NUM_FONT}`, color: C.text3 }}>{`${k}/${n}`}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 10px)', gap: 4, direction: s === 'home' ? 'rtl' : 'ltr' }}>
          {g.map((x, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: x[0] === 1 ? accent : 'transparent', border: `1px solid ${x[0] === 1 ? accent : C.text3}`, opacity: x[0] === 1 ? 1 : 0.5 }} />)}
        </div>
      </div>
    )
  }
  const body = <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{wall(logs.away, 'away')}{wall(logs.home, 'home')}</div>
  if (bare) return body
  return <div style={frame(C)}><Clubs game={game} sport={sport} C={C} NUM_FONT={NUM_FONT} />{body}<div style={{ fontSize: 11, color: C.text3 }}>Scored the first basket. One dot a game on file, newest first.</div></div>
}

/** THE COMBO: the circle, then the rain, then the wall, in one frame. */
export function OpeningCombo(props) {
  const { game, sport, C, NUM_FONT } = props
  return (
    <div style={frame(C)}>
      <Clubs game={game} sport={sport} C={C} NUM_FONT={NUM_FONT} />
      <JumpCircle {...props} bare />
      <div style={{ height: 1, background: C.border }} />
      <FirstRain {...props} bare />
      <div style={{ height: 1, background: C.border }} />
      <DotWall {...props} bare />
      <div style={{ fontSize: 11, color: C.text3 }}>Rings: tip outside, Q1 inside. Dots: games on file. Counts, not a chance.</div>
    </div>
  )
}
