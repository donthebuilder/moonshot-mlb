'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, playerId, clean } from '../lib/player'

// ⚖ LUCK REPORT — process vs results, the expected-outcomes read built from
// what the bot already publishes (2026-08-06, from the xHR-graphics teardown).
//
// PROCESS = how the ball leaves his bat lately: L10 xwOBA leading, barrel and
// hard-hit rates behind it. RESULTS = what the box score paid him: L10 average
// and homers. Both become percentiles WITHIN TONIGHT'S SLATE, and the gap is
// the read:
//   💎 CRUSHING, NOT CASHING  process ≫ results — the ball is loud and the
//      hits haven't landed yet. The regression bet is WITH him.
//   🎈 CASHING, NOT CRUSHING  results ≫ process — box score hot, contact
//      quality ordinary. What a hot streak looks like right before it isn't.
//
// This is deliberately NOT an expected-HR model — no invented probabilities,
// just published fields ranked against each other. The true xHR machinery
// (per-ball EV/LA buckets, park expected-vs-actual, no-doubter classes) is
// bot-side work, specced as docket #20.

const pctOf = (xs, v) => {
  if (v == null || !xs.length) return null
  let i = 0; while (i < xs.length && xs[i] <= v) i++
  return i / xs.length
}

// `defaultOpen` (2026-08-15): the Power page was four stacked sections above
// the board you came for. Fixing that moved this one BELOW the board, where a
// permanently-expanded sixteen-row ladder is the last thing between the reader
// and the bottom of the page. Folded, its header still names the read and the
// most-robbed hitter, so the summary carries the headline fact rather than
// being a wall with a door in it. Every row is one tap away; nothing is gone.
export default function LuckReport({ players = [], onPlayerClick, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const { unlucky, lucky, calibrated } = useMemo(() => {
    const pool = players.filter((p) => n(p?.season_pa, 0) >= 100 && n(p?.recent_350_den, 0) >= 10)
    if (pool.length < 12) return { unlucky: [], lucky: [], calibrated: false }

    // CALIBRATED MODE (docket #20 shipped): when the bot publishes true
    // expected-HRs, the percentile pointer retires and this becomes the real
    // thing — actual homers minus xHR from contact, the ±numbers themselves.
    const xPool = pool.filter((p) => n(p?.xhr_bbe, 0) >= 50 && n(p?.season_xhr, 0) > 0)
    if (xPool.length >= 12) {
      const scored = xPool.map((p) => ({ p, luck: n(p?.season_hr_luck, 0), xhr: n(p?.season_xhr, 0) }))
      return {
        calibrated: true,
        unlucky: [...scored].sort((a, b) => a.luck - b.luck).filter((x) => x.luck <= -1.5).slice(0, 8)
          .map((x) => ({ ...x, gap: -x.luck / 10 })),
        lucky: [...scored].sort((a, b) => b.luck - a.luck).filter((x) => x.luck >= 1.5).slice(0, 8)
          .map((x) => ({ ...x, gap: -x.luck / 10 })),
      }
    }
    const sortedVals = (get) => pool.map(get).filter((v) => v != null).sort((a, b) => a - b)
    const xw = sortedVals((p) => n(p?.l10_xwoba, null))
    const brl = sortedVals((p) => n(p?.recent_barrel_rate, null))
    const hh = sortedVals((p) => n(p?.recent_hard_hit_rate, null))
    const avg = sortedVals((p) => n(p?.last10_avg, null))
    const hr10 = sortedVals((p) => n(p?.last10_hr, null))

    const scored = pool.map((p) => {
      const proc = [
        [pctOf(xw, n(p?.l10_xwoba, null)), 0.5],
        [pctOf(brl, n(p?.recent_barrel_rate, null)), 0.25],
        [pctOf(hh, n(p?.recent_hard_hit_rate, null)), 0.25],
      ].filter(([v]) => v != null)
      const res = [
        [pctOf(avg, n(p?.last10_avg, null)), 0.6],
        [pctOf(hr10, n(p?.last10_hr, null)), 0.4],
      ].filter(([v]) => v != null)
      if (!proc.length || !res.length) return null
      const wsum = (xs) => xs.reduce((a, [v, w]) => a + v * w, 0) / xs.reduce((a, [, w]) => a + w, 0)
      const process = wsum(proc), results = wsum(res)
      return { p, process, results, gap: process - results }
    }).filter(Boolean)

    return {
      calibrated: false,
      unlucky: [...scored].sort((a, b) => b.gap - a.gap).filter((x) => x.gap >= 0.2).slice(0, 8),
      lucky: [...scored].sort((a, b) => a.gap - b.gap).filter((x) => x.gap <= -0.2).slice(0, 8),
    }
  }, [players])

  if (!unlucky.length && !lucky.length) return null

  // one ladder: unlucky first (most robbed on top), then lucky (most inflated last)
  const ladder = [
    ...unlucky.map((x) => ({ ...x, side: 'u' })),
    ...[...lucky].reverse().map((x) => ({ ...x, side: 'l' })),
  ].map((x) => ({ ...x, mag: Math.abs(x.luck != null ? x.luck : x.gap * 10) }))
  const maxMag = Math.max(...ladder.map((x) => x.mag), 1e-9)

  const mostRobbed = ladder.find((x) => x.side === 'u')

  return (
    <div style={{ marginTop: 20 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, paddingTop: 12, borderTop: `1px solid ${C.border}`, cursor: 'pointer', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 13, fontWeight: 900 }}>⚖ Luck report {open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {calibrated
            ? 'actual homers vs expected-from-contact (bot xHR machine, season)'
            : 'how the ball leaves the bat vs what the box score paid — slate percentiles, L10 window'}
        </span>
        {!open && (
          <span style={{ fontSize: 10, color: C.text3 }}>
            <b style={{ color: '#4ade80', fontFamily: NUM_FONT }}>{unlucky.length}</b> crushing without cashing,{' '}
            <b style={{ color: '#f87171', fontFamily: NUM_FONT }}>{lucky.length}</b> cashing without crushing
            {mostRobbed && <> — most robbed is <b style={{ color: C.text2 }}>{nameOf(mostRobbed.p)}</b></>}
          </span>
        )}
      </div>
      {!open ? null : (
      <>
      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>
        {calibrated
          ? 'Calibrated: the number on each card is HRs above or below what his contact quality should have produced, from the league (EV, LA) table the bot builds off its own statcast data. Minimum 50 tracked balls and a ±1.5 HR gap to make a list.'
          : 'Not a projection — a regression pointer built only from published fields. Gates: 100+ season PA, 10+ tracked batted balls, and a 20-point gap before anyone makes a list. When a hitter shows on neither list, his results match his contact — which is most hitters, most of the time.'}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9.5, fontFamily: NUM_FONT }}>
          <b style={{ color: '#4ade80' }}>◀ 💎 CRUSHING, NOT CASHING</b>
          <span style={{ color: C.text3 }}> — loud contact, unpaid; the bet is with him</span>
        </span>
        <span style={{ fontSize: 9.5, fontFamily: NUM_FONT }}>
          <span style={{ color: C.text3 }}>hot box score, ordinary contact — </span>
          <b style={{ color: '#f87171' }}>🎈 CASHING, NOT CRUSHING ▶</b>
        </span>
      </div>

      {/* the ladder — one zero line, both stories */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, padding: '8px 12px' }}>
        {ladder.map((x, i) => {
          const isU = x.side === 'u'
          const color = isU ? '#4ade80' : '#f87171'
          const w = Math.max(4, (50 * x.mag) / maxMag)
          const valTxt = x.luck != null
            ? `${x.luck > 0 ? '+' : ''}${x.luck.toFixed(2)}`
            : `${x.gap > 0 ? '+' : ''}${Math.round(x.gap * 100)}`
          const detail = x.luck != null
            ? `${n(x.p?.season_hr, 0)} HR vs ${x.xhr.toFixed(1)} expected · ${n(x.p?.xhr_bbe, 0)} tracked`
            : `contact ${Math.round(x.process * 100)}% vs results ${Math.round(x.results * 100)}%`
          return (
            <div
              key={playerId(x.p)}
              onClick={() => onPlayerClick?.(x.p)}
              title={detail}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: onPlayerClick ? 'pointer' : 'default',
                padding: '3px 0', borderBottom: i < ladder.length - 1 ? `1px solid ${C.border}` : 'none', minWidth: 0,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, width: 148, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nameOf(x.p)} <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{teamOf(x.p)}</span>
              </span>
              <div style={{ flex: 1, position: 'relative', height: 12, minWidth: 60 }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: C.border2 }} />
                <div style={{
                  position: 'absolute', top: 2, bottom: 2, borderRadius: 3,
                  background: `linear-gradient(90deg, ${color}55, ${color})`,
                  ...(isU ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }),
                }} />
              </div>
              <span style={{ fontFamily: NUM_FONT, fontSize: 11.5, fontWeight: 900, color, width: 46, textAlign: 'right', flexShrink: 0 }}>{valTxt}</span>
              <span className="l5col" style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, width: 205, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</span>
            </div>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}
