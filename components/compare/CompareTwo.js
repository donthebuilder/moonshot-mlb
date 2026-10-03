'use client'
import { useMemo, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'

// ⚖️ COMPARE TWO, EVERY SPORT (2026-10-03, parity). MOONSHOT's PickCompare
// shell lifted out markup for markup: two name pickers, the verdict line, the
// side-by-side rows, the signals checklist and an optional footer. Each sport
// passes its own content -- the rows, the signals and the verdict rule ARE
// the sport (MLB's seven homer signals, TUDDY's four TD signals) -- and the
// look is MOONSHOT's. Nothing here computes a number; every value comes from
// the sport's row functions.
//
//   players       the pool to pick from
//   nameOf/teamOf/metaSel/metaHit  how a row reads in the picker
//   rows          [[label, (p, quote) => value, big]]
//   signals       [[key, label, why, (p) => bool]]
//   quoteOf       (p) => price quote or null
//   verdictFor    (a, b, qa, qb, ca, cb) => { who, why }
//   footer        (a, b) => node (optional)

function Picker({ players, value, onChange, placeholder, nameOf, teamOf, metaSel, metaHit, accent, accentBg, C, numFont }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    return players.filter((p) => nameOf(p).toLowerCase().includes(needle) || String(teamOf(p)).toLowerCase() === needle).slice(0, 8)
  }, [players, q, nameOf, teamOf])
  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 10, border: `1px solid ${accent}66`, background: accentBg, minWidth: 0 }}>
        <b style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(value)}</b>
        <small style={{ fontSize: 9.5, color: C.text3, fontFamily: numFont, flexShrink: 0 }}>{metaSel(value)}</small>
        <button onClick={() => { onChange(null); setQ('') }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer' }}>✕</button>
      </div>
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={{
        width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`,
        background: 'transparent', color: C.text, fontSize: 12, outline: 'none', fontFamily: numFont,
      }} />
      {hits.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 6, marginTop: 4, borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg, overflow: 'hidden' }}>
          {hits.map((p) => (
            <button key={p.player_id} onClick={() => { onChange(p); setQ('') }} style={{ display: 'flex', gap: 8, width: '100%', padding: '7px 9px', background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', textAlign: 'left', fontSize: 12, alignItems: 'baseline' }}>
              <b>{nameOf(p)}</b><small style={{ color: C.text3, fontFamily: numFont, fontSize: 9.5 }}>{metaHit(p)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CompareTwo({
  players = [], nameOf, teamOf, metaSel, metaHit,
  rows: rowDefs, signals, quoteOf, verdictFor, footer = null, onPlayerClick,
  title, sub, placeholders = ['first…', 'second…'], signalsTitle,
  accent, accentBg, bgTint, winInk, gridClass = 'pc-grid',
  theme = MLB_C, numFont = MLB_NUM,
}) {
  const C = theme
  const NUM_FONT = numFont
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const pool = useMemo(() => (players || []).filter((p) => p?.player_id && nameOf(p)), [players, nameOf])
  const qa = a ? quoteOf(a) : null
  const qb = b ? quoteOf(b) : null
  const ca = a ? signals.filter(([, , , f]) => f(a)).length : 0
  const cb = b ? signals.filter(([, , , f]) => f(b)).length : 0
  const v = a && b ? verdictFor(a, b, qa, qb, ca, cb) : null
  const rows = a && b ? rowDefs : []
  const pick = { players: pool, nameOf, teamOf, metaSel, metaHit, accent, accentBg, C, numFont }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, background: `linear-gradient(155deg, ${C.bg2}, ${bgTint})` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>{title}</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{sub}</span>
      </div>
      <div className={gridClass} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start' }}>
        <Picker {...pick} value={a} onChange={setA} placeholder={placeholders[0]} />
        <span style={{ alignSelf: 'center', fontSize: 10, fontWeight: 900, color: C.text3, fontFamily: NUM_FONT }}>vs</span>
        <Picker {...pick} value={b} onChange={setB} placeholder={placeholders[1]} />
      </div>
      {a && b && (
        <>
          <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
            {v.who ? <><span style={{ color: winInk }}>{nameOf(v.who)}</span> — {v.why}</> : v.why}
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
              <span style={{ color: C.text3 }} title={signalsTitle}>Signals agreeing</span>
              <em style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13, textAlign: 'right' }}>{ca} / {signals.length}</em>
              <em style={{ fontStyle: 'normal', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13, textAlign: 'right' }}>{cb} / {signals.length}</em>
            </div>
            {signals.map(([k, label, why, f]) => {
              const fa = f(a), fb = f(b)
              return (
                <div key={k} title={why} style={{ display: 'grid', gridTemplateColumns: '1fr 96px 96px', gap: 8, padding: '2px 0 2px 10px', fontSize: 10.5, alignItems: 'baseline' }}>
                  <span style={{ color: C.text2 }}>{label}</span>
                  <em style={{ fontStyle: 'normal', textAlign: 'right', color: fa ? winInk : C.text3, fontWeight: 900 }}>{fa ? '●' : '·'}</em>
                  <em style={{ fontStyle: 'normal', textAlign: 'right', color: fb ? winInk : C.text3, fontWeight: 900 }}>{fb ? '●' : '·'}</em>
                </div>
              )
            })}
          </div>
          {footer ? footer(a, b) : null}
        </>
      )}
      <style>{`@media(max-width:520px){.${gridClass}{grid-template-columns:1fr !important}.${gridClass}>span{justify-self:center}}`}</style>
    </div>
  )
}
