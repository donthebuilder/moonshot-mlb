'use client'
import { useMemo } from 'react'
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

export default function LuckReport({ players = [], onPlayerClick }) {
  const { unlucky, lucky } = useMemo(() => {
    const pool = players.filter((p) => n(p?.season_pa, 0) >= 100 && n(p?.recent_350_den, 0) >= 10)
    if (pool.length < 12) return { unlucky: [], lucky: [] }
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
      unlucky: [...scored].sort((a, b) => b.gap - a.gap).filter((x) => x.gap >= 0.2).slice(0, 8),
      lucky: [...scored].sort((a, b) => a.gap - b.gap).filter((x) => x.gap <= -0.2).slice(0, 8),
    }
  }, [players])

  if (!unlucky.length && !lucky.length) return null

  const Card = ({ x, color }) => (
    <div
      onClick={() => onPlayerClick?.(x.p)}
      style={{
        background: `linear-gradient(155deg, ${color}12, ${color}04)`,
        border: `1px solid ${color}35`, borderRadius: 10, padding: '7px 11px', minWidth: 0,
        cursor: onPlayerClick ? 'pointer' : 'default',
      }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(x.p)}</span>
        <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900, color }}>
          {x.gap > 0 ? '+' : ''}{Math.round(x.gap * 100)}
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {teamOf(x.p)} · xwOBA10 {n(x.p?.l10_xwoba, 0).toFixed(3).replace(/^0/, '')} · L10 AVG {n(x.p?.last10_avg, 0).toFixed(3).replace(/^0/, '')}
        {' '}· contact {Math.round(x.process * 100)}% vs results {Math.round(x.results * 100)}%
      </div>
    </div>
  )

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>⚖ Luck report</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          how the ball leaves the bat vs what the box score paid — slate percentiles, L10 window
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>
        Not a projection — a regression pointer built only from published fields. Gates: 100+ season PA,
        10+ tracked batted balls, and a 20-point gap before anyone makes a list. When a hitter shows on
        neither list, his results match his contact — which is most hitters, most of the time.
      </div>

      {unlucky.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#4ade80', letterSpacing: '.08em', fontFamily: NUM_FONT }}>💎 CRUSHING, NOT CASHING</span>
            <span style={{ fontSize: 9, color: C.text3 }}>loud contact the box score hasn&apos;t paid yet — the bet is with him</span>
          </div>
          <div className="bot-picks-grid" style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {unlucky.map((x) => <Card key={playerId(x.p)} x={x} color="#4ade80" />)}
          </div>
        </div>
      )}

      {lucky.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#f87171', letterSpacing: '.08em', fontFamily: NUM_FONT }}>🎈 CASHING, NOT CRUSHING</span>
            <span style={{ fontSize: 9, color: C.text3 }}>hot box score, ordinary contact — what a streak looks like right before it isn&apos;t</span>
          </div>
          <div className="bot-picks-grid" style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {lucky.map((x) => <Card key={playerId(x.p)} x={x} color="#f87171" />)}
          </div>
        </div>
      )}
    </div>
  )
}
