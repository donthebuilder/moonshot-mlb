'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../lib/nfl/theme'
import { quoteFor, fmtOdds } from '../../lib/nfl/oddsMatch'
import { matchupTag, alignedSignals } from '../../lib/nfl/dvpSignal'
import { injuryTag } from '../../lib/nfl/injury'

// ══ ⚖️ COMPARE TWO PLAYERS — TUDDY's half of MOONSHOT's PickCompare ══════════
//
// Donovan, 2026-09-16 ("Rebuild it like Props"): Touchdowns needed "a
// compare-two tool" to reach click-over parity with Props. MOONSHOT's own
// version (components/PickCompare.js) doesn't port line-for-line -- it reads
// off seven MLB-only fields (pitch_type_match_flag, weak_spot_flag, park_hr_
// factor...) that have no TD-market equivalent. This is the same STRUCTURE
// (pick two, read them side by side, a printed rule decides a verdict) built
// off TD's own four real signals instead of MLB's seven.
//
// NOTHING HERE IS A NEW MODEL, same discipline as the MLB page: every number
// is a field the bot published (components.TD, scores.TD) or a price the
// book posted (quoteFor). The verdict rule is the same shape too -- higher
// score by 8+ wins outright (the two products share one 0-100 scale, see
// ScoreAnatomy.js's header on why an NFL 78 means what an MLB 78 means);
// inside that, more real signals wins; inside that, the better price at the
// same bar; otherwise it says coin flip rather than inventing a favourite.
export const SIGNALS = [
  ['highconf', 'High-confidence flag', "the bot's own high-confidence TD flag", (p) => Boolean(p?.high_confidence_td_flag)],
  ['matchup', 'Matchup (TARGET)', 'faces a defence in the softest third of the league at his role/market', (p, matchup) => matchupTag(matchup, p, 'TD')?.tag === 'TARGET'],
  ['finisher', 'Red-zone finisher', 'red-zone opportunity in the 80th percentile or better', (p, matchup) => alignedSignals(matchup, p).finisherHit],
  ['rising', 'Snap share rising', 'snap share trending up 20+ points', (p, matchup) => alignedSignals(matchup, p).risingHit],
]

const pctOf = (comps, key) => (Number.isFinite(Number(comps?.[key])) ? `${Math.round(Number(comps[key]))}p` : '—')

function Picker({ players, value, onChange, placeholder }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    return players.filter((p) => String(p.name || '').toLowerCase().includes(needle) || String(p.team || '').toLowerCase() === needle).slice(0, 8)
  }, [players, q])
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 10, border: `1px solid ${C.green}66`, background: `${C.green}14`, minWidth: 0 }}>
        <b style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</b>
        <small style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{value.team} vs {value.opp}</small>
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
              <b>{p.name}</b><small style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9.5 }}>{p.team} vs {p.opp} · {p.position}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TdCompare({ rows = [], matchup, odds, onPlayerClick }) {
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const pool = useMemo(() => (rows || []).filter((p) => p?.player_id && p?.name), [rows])
  const qa = a ? quoteFor(odds, a, 'TD') : null
  const qb = b ? quoteFor(odds, b, 'TD') : null

  const ca = a ? SIGNALS.filter(([, , , f]) => f(a, matchup)).length : 0
  const cb = b ? SIGNALS.filter(([, , , f]) => f(b, matchup)).length : 0

  const verdict = useMemo(() => {
    if (!a || !b) return null
    const sa = Number(a.scores?.TD) || 0, sb = Number(b.scores?.TD) || 0
    const gap = sa - sb
    if (Math.abs(gap) >= 8) {
      const w = gap > 0 ? a : b
      return { who: w, why: `${Math.abs(gap).toFixed(0)} points clear on the TD score — outside the noise between two cards.` }
    }
    if (ca !== cb) {
      const w = ca > cb ? a : b
      return { who: w, why: `scores are within ${Math.abs(gap).toFixed(0)} points, so the signals decide: ${Math.max(ca, cb)} of ${SIGNALS.length} agree on him against ${Math.min(ca, cb)}.` }
    }
    const ia = qa?.matches ? qa.implied : null, ib = qb?.matches ? qb.implied : null
    if (ia != null && ib != null && Math.abs(ia - ib) >= 3) {
      const w = ia < ib ? a : b
      return { who: w, why: `same score, same signals — so take the price: ${fmtOdds((w === a ? qa : qb).over)} needs ${Math.min(ia, ib)}% to break even against ${Math.max(ia, ib)}% for the other.` }
    }
    return { who: null, why: `coin flip — ${Math.abs(gap).toFixed(0)} points apart, ${ca} signal${ca === 1 ? '' : 's'} each${ia != null && ib != null ? ', prices within 3 points' : ''}. Nothing here separates them.` }
  }, [a, b, ca, cb, qa, qb])

  const rowDefs = a && b ? [
    ['Grade', (p) => gradeFor(p.scores?.TD).label, false],
    ['TD score', (p) => Math.round(p.scores?.TD ?? 0), true],
    ['Price · needs', (p, q) => (q?.matches ? `${fmtOdds(q.over)} · ${Math.round(q.implied)}%` : q ? `book at ${q.line}` : '—'), false],
    ['Goal-line opp (pct)', (p) => pctOf(p.components?.TD, 'f_gl_opp'), false],
    ['Red-zone touches (pct)', (p) => pctOf(p.components?.TD, 'f_rz_opp'), false],
    ['Snap share (pct)', (p) => pctOf(p.components?.TD, 'f_snap_pct'), false],
    ['Matchup', (p) => matchupTag(matchup, p, 'TD')?.tag || 'EVEN', false],
    ['Injury', (p) => injuryTag(p) || '—', false],
  ] : []

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, background: `linear-gradient(155deg, ${C.bg2}, ${C.green}0a)` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>⚖️ Compare two players</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>the things that differ between two TD picks, side by side, and a verdict that says why</span>
      </div>
      <div className="tc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start' }}>
        <Picker players={pool} value={a} onChange={setA} placeholder="first player…" />
        <span style={{ alignSelf: 'center', fontSize: 10, fontWeight: 900, color: C.text3, fontFamily: NUM_FONT }}>vs</span>
        <Picker players={pool} value={b} onChange={setB} placeholder="second player…" />
      </div>
      {a && b && (
        <>
          <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
            {verdict.who ? <><span style={{ color: C.green }}>{verdict.who.name}</span> — {verdict.why}</> : verdict.why}
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rowDefs.map(([label, fn, big]) => {
              const va = fn(a, qa), vb = fn(b, qb)
              return (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 96px', gap: 8, padding: '4px 0', borderTop: `1px solid ${C.border}`, fontSize: 11, alignItems: 'baseline' }}>
                  <span style={{ color: C.text3 }}>{label}</span>
                  <em onClick={() => onPlayerClick?.(a, 'TD')} style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 800, fontSize: big ? 13 : 11, textAlign: 'right', color: C.text, cursor: 'pointer' }}>{va}</em>
                  <em onClick={() => onPlayerClick?.(b, 'TD')} style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 800, fontSize: big ? 13 : 11, textAlign: 'right', color: C.text, cursor: 'pointer' }}>{vb}</em>
                </div>
              )
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px 96px', gap: 8, padding: '6px 0 2px', borderTop: `1px solid ${C.border}`, fontSize: 11, alignItems: 'baseline' }}>
              <span style={{ color: C.text3 }} title="The four real signals this page tracks for a TD pick.">Signals agreeing</span>
              <em style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13, textAlign: 'right' }}>{ca} / {SIGNALS.length}</em>
              <em style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13, textAlign: 'right' }}>{cb} / {SIGNALS.length}</em>
            </div>
            {SIGNALS.map(([k, label, why, f]) => {
              const fa = f(a, matchup), fb = f(b, matchup)
              return (
                <div key={k} title={why} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 96px', gap: 8, padding: '2px 0 2px 10px', fontSize: 10.5, alignItems: 'baseline' }}>
                  <span style={{ color: C.text2 }}>{label}</span>
                  <em style={{ fontStyle: 'normal', textAlign: 'right', color: fa ? C.green : C.text3, fontWeight: 900 }}>{fa ? '●' : '·'}</em>
                  <em style={{ fontStyle: 'normal', textAlign: 'right', color: fb ? C.green : C.text3, fontWeight: 900 }}>{fb ? '●' : '·'}</em>
                </div>
              )
            })}
          </div>
        </>
      )}
      <style>{`@media(max-width:520px){.tc-grid{grid-template-columns:1fr !important}.tc-grid>span{justify-self:center}}`}</style>
    </div>
  )
}
