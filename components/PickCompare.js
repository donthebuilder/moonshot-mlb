'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, oppOf, txt, hrScore } from '../lib/player'
import { verdictInk, alpha } from '../lib/scales'
import { fmtOdds, quoteFor } from '../lib/odds'

// ══ ⚖️ COMPARE TWO PICKS ═════════════════════════════════════════════════════
//
// Donovan, 2026-09-01, on the cards site-wide: "I felt ours were repetitive
// and not informational or helpful in decision making or deciphering between
// two picks." This is the page for that one sentence. Pick two hitters and
// read them against each other on the things that actually differ between
// two homer picks, in one column each, with the verdict stated the way a
// friend would state it.
//
// THE SIGNALS ROW IS THE SAME SEVEN the bot's shadow lane counts
// (bots/hr_v3_shadow.py, SIGNALS, same date) — pitch, spot, mistake, pace,
// air, form, power — read off the same published fields, so what this page
// calls "5 of 7 agree" is the number the shadow record is grading nightly.
// When that record says convergence predicts, this row already means it;
// when it says it does not, this row is a checklist and nothing more, and
// the copy says which.
//
// NOTHING HERE IS A NEW MODEL. Every number is a field the bot published or
// a price the book posted. The verdict is a rule, printed: higher score by
// 8+ wins; inside that, more signals wins; inside that, the longer price at
// the same rate is the better bet; and when none of those separates them it
// says coin flip rather than inventing a favourite.

export const SIGNALS = [
  ['pitch', 'Pitch match', 'his damage pitch is what this arm throws most', (p) => Boolean(p?.pitch_type_match_flag)],
  ['spot', 'Weak spot', 'the arm bleeds to his lineup spot', (p) => Boolean(p?.weak_spot_flag)],
  ['mistake', 'Mistake pitch', 'the arm’s mistake pitch is one he punishes', (p) => Boolean(p?.pitcher_mistake_match)],
  ['pace', 'Due + HR-prone arm', 'real expected-HR gap on a real sample, against an arm allowing homers right now', (p) => Boolean(p?.hr_pace_flag)],
  ['air', 'Air / park', 'wind helping, or a park at 1.05+ for homers', (p) => (n(p?.weather_wind_boost, 0) > 0.02) || (n(p?.park_hr_factor, 0) >= 1.05)],
  ['form', 'Recent homer', 'went deep in his last five', (p) => n(p?.last5_hr, 0) >= 1],
  ['power', 'Power tell', 'the bot’s own power-watch or high-confidence flag', (p) => Boolean(p?.power_watch_flag) || Boolean(p?.high_confidence_hr_flag)],
]

const pct = (v, dp = 1) => (v == null ? '—' : `${(100 * v).toFixed(dp)}%`)

function Picker({ players, value, onChange, placeholder }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    return players.filter((p) => nameOf(p).toLowerCase().includes(needle) || String(teamOf(p)).toLowerCase() === needle).slice(0, 8)
  }, [players, q])
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 10, border: `1px solid ${C.orange}66`, background: alpha(C.orange, 0.08), minWidth: 0 }}>
        <b style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(value)}</b>
        <small style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{teamOf(value)} vs {oppOf(value)}</small>
        <button onClick={() => { onChange(null); setQ('') }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer' }}>✕</button>
      </div>
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={{
        width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`,
        background: 'transparent', color: C.text, fontSize: 12, outline: 'none', fontFamily: NUM_FONT,
      }} />
      {hits.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 6, marginTop: 4, borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg, overflow: 'hidden' }}>
          {hits.map((p) => (
            <button key={p.player_id} onClick={() => { onChange(p); setQ('') }} style={{ display: 'flex', gap: 8, width: '100%', padding: '7px 9px', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', textAlign: 'left', fontSize: 12, alignItems: 'baseline' }}>
              <b>{nameOf(p)}</b><small style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}>{teamOf(p)} vs {oppOf(p)} · {String(p.game_pick_role || '').split('/')[0] || 'no badge'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function verdictFor(a, b, qa, qb) {
  const sa = hrScore(a), sb = hrScore(b)
  const ca = SIGNALS.filter(([, , , f]) => f(a)).length, cb = SIGNALS.filter(([, , , f]) => f(b)).length
  const gap = sa - sb
  if (Math.abs(gap) >= 8) {
    const w = gap > 0 ? a : b
    return { who: w, why: `${Math.abs(gap).toFixed(0)} points clear on the HR score — that is outside the noise between two cards.` }
  }
  if (ca !== cb) {
    const w = ca > cb ? a : b
    return { who: w, why: `scores are within ${Math.abs(gap).toFixed(0)} points, so the signals decide: ${Math.max(ca, cb)} of 7 agree on him against ${Math.min(ca, cb)}. Read that as a checklist until the shadow record says convergence predicts.` }
  }
  const ia = qa?.matches ? qa.implied : null, ib = qb?.matches ? qb.implied : null
  if (ia != null && ib != null && Math.abs(ia - ib) >= 3) {
    const w = ia < ib ? a : b
    return { who: w, why: `same score, same signals — so take the price: ${fmtOdds((w === a ? qa : qb).over)} needs ${Math.min(ia, ib)}% to break even against ${Math.max(ia, ib)}% for the other.` }
  }
  return { who: null, why: `coin flip — ${Math.abs(gap).toFixed(0)} points apart, ${ca} signals each${ia != null && ib != null ? ', prices within 3 points' : ''}. Nothing on this page separates them; pick the lineup spot you trust.` }
}

export default function PickCompare({ players = [], odds = null, onPlayerClick }) {
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const pool = useMemo(() => (players || []).filter((p) => p?.player_id && nameOf(p)), [players])
  const qa = a ? quoteFor(odds, a, 'HR') : null
  const qb = b ? quoteFor(odds, b, 'HR') : null
  const v = a && b ? verdictFor(a, b, qa, qb) : null

  const rows = a && b ? [
    ['Badge', (p) => String(p.game_pick_role || '').split('/')[0] || 'none', false],
    ['HR score', (p) => hrScore(p).toFixed(0), true],
    ['Model P(HR tonight)', (p) => pct(n(p.season_hr_game_probability, null)), true],
    ['Price · needs', (p, q) => (q?.matches ? `${fmtOdds(q.over)} · ${Math.round(q.implied)}%` : q ? `book at ${q.line}` : '—'), false],
    ['HR last 5 / 10 / szn', (p) => `${n(p.last5_hr, 0)} / ${n(p.last10_hr, 0)} / ${n(p.season_hr, 0)}`, false],
    ['ISO · HR/PA', (p) => `${n(p.season_iso, 0).toFixed(3).replace(/^0/, '')} · ${pct(n(p.hr_per_pa, null), 1)}`, false],
    ['Arm HR/9 · last 3', (p) => `${n(p.pitcher_hr9, 0).toFixed(2)} · ${p.pitcher_l3_hr9 != null ? Number(p.pitcher_l3_hr9).toFixed(2) : '—'}`, false],
    ['Park HR · wind', (p) => `${n(p.park_hr_factor, 1).toFixed(2)} · ${n(p.weather_wind_boost, 0) > 0.02 ? 'helping' : n(p.weather_wind_boost, 0) < -0.02 ? 'hurting' : 'flat'}`, false],
    ['Lineup spot', (p) => (p.lineup_spot ? `${p.lineup_spot}${p.lineup_confirmed ? ' ✓' : ' (proj)'}` : '—'), false],
    ['Trap flag', (p) => (p.trap_flag ? 'yes' : 'no'), false],
  ] : []

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, background: `linear-gradient(155deg, ${C.bg2}, ${alpha(C.orange, 0.04)})` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>⚖️ Compare two picks</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>the things that differ between two homer picks, side by side, and a verdict that says why</span>
      </div>
      <div className="pc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start' }}>
        <Picker players={pool} value={a} onChange={setA} placeholder="first hitter…" />
        <span style={{ alignSelf: 'center', fontSize: 10, fontWeight: 900, color: C.text3, fontFamily: NUM_FONT }}>vs</span>
        <Picker players={pool} value={b} onChange={setB} placeholder="second hitter…" />
      </div>
      {a && b && (
        <>
          <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
            {v.who ? <><span style={{ color: verdictInk(true).color }}>{nameOf(v.who)}</span> — {v.why}</> : v.why}
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map(([label, fn, big]) => {
              const va = fn(a, qa), vb = fn(b, qb)
              return (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 96px', gap: 8, padding: '4px 0', borderTop: `1px solid ${C.border}`, fontSize: 11, alignItems: 'baseline' }}>
                  <span style={{ color: C.text3 }}>{label}</span>
                  <em onClick={() => onPlayerClick?.(a)} style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 800, fontSize: big ? 13 : 11, textAlign: 'right', color: C.text, cursor: 'pointer' }}>{va}</em>
                  <em onClick={() => onPlayerClick?.(b)} style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 800, fontSize: big ? 13 : 11, textAlign: 'right', color: C.text, cursor: 'pointer' }}>{vb}</em>
                </div>
              )
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px 96px', gap: 8, padding: '6px 0 2px', borderTop: `1px solid ${C.border}`, fontSize: 11, alignItems: 'baseline' }}>
              <span style={{ color: C.text3 }} title="The seven signals the bot's shadow lane counts nightly. A checklist until that record says convergence predicts.">Signals agreeing</span>
              <em style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13, textAlign: 'right' }}>{SIGNALS.filter(([, , , f]) => f(a)).length} / 7</em>
              <em style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13, textAlign: 'right' }}>{SIGNALS.filter(([, , , f]) => f(b)).length} / 7</em>
            </div>
            {SIGNALS.map(([k, label, why, f]) => {
              const fa = f(a), fb = f(b)
              return (
                <div key={k} title={why} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 96px', gap: 8, padding: '2px 0 2px 10px', fontSize: 10.5, alignItems: 'baseline' }}>
                  <span style={{ color: C.text2 }}>{label}</span>
                  <em style={{ fontStyle: 'normal', textAlign: 'right', color: fa ? verdictInk(true).color : C.text3, fontWeight: 900 }}>{fa ? '●' : '·'}</em>
                  <em style={{ fontStyle: 'normal', textAlign: 'right', color: fb ? verdictInk(true).color : C.text3, fontWeight: 900 }}>{fb ? '●' : '·'}</em>
                </div>
              )
            })}
          </div>
          {(txt(a.matchup_reason) || txt(b.matchup_reason)) && (
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.5 }}>
              <div><b style={{ color: C.text2 }}>{nameOf(a).split(' ').slice(-1)[0]}:</b> {txt(a.matchup_reason).split(/\s*·\s*/).join(' · ')}</div>
              <div><b style={{ color: C.text2 }}>{nameOf(b).split(' ').slice(-1)[0]}:</b> {txt(b.matchup_reason).split(/\s*·\s*/).join(' · ')}</div>
            </div>
          )}
        </>
      )}
      <style>{`@media(max-width:520px){.pc-grid{grid-template-columns:1fr !important}.pc-grid>span{justify-self:center}}`}</style>
    </div>
  )
}
