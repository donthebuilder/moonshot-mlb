'use client'
import { useState } from 'react'
import LampTable from '../LampTable'
import ValueBars from '../../ValueBars'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { alpha, verdictInk, verdictWash } from '../../../lib/scales'
import { GOAL_MARKETS, WINDOWS, thresholdRow, marketOf, val } from '../../../lib/nhl/goalLog'

// 🎯 THE THRESHOLD GRID, HOCKEY EDITION (MOONSHOT components/ThresholdGrid.js).
// Every market x every window on one table, his own game log, nothing behind a
// click: 1+ goal, 2+ shots, 1+ point ... over his last 5 / 10 / 20 and the
// season. The same warm / cool verdict pair MOONSHOT's matrix wears (and its
// 40% / 25% rate bands), the same value chart under it (components/ValueBars,
// shared with MOONSHOT and TUDDY), a tap on a row picks the bar the run and the
// cold case read, a chip moves the line. Every cell prints its fraction, and a
// window of fewer than five games is dimmed and says so.
const rateInk = (pct) => (pct == null ? C.text3 : pct >= 40 ? verdictInk(true).color : pct >= 25 ? C.text2 : verdictInk(false).color)
const rateWash = (pct) => (pct == null ? 'transparent' : pct >= 60 ? verdictWash(true, 0.16) : pct >= 40 ? verdictWash(true, 0.09) : pct >= 25 ? 'transparent' : verdictWash(false, 0.08))

function Cell({ c, label, unit }) {
  if (!c) return <span style={{ color: C.text3 }}>—</span>
  const dim = c.thin
  return (
    <span title={`${label}: ${c.ok} of ${c.n} games${c.full ? '' : ` (all he has played: ${c.n})`}${dim ? ' -- a thin sample, read it lightly' : ''}.`}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1, minWidth: 38, padding: '2px 1px', borderRadius: 6, background: rateWash(c.pct), opacity: dim ? 0.6 : 1 }}>
      <b style={{ color: rateInk(c.pct), font: `800 12px/1.1 ${NUM_FONT}` }}>{c.pct.toFixed(0)}%</b>
      <span style={{ color: C.text3, font: `600 10px/1.2 ${NUM_FONT}` }}>{c.ok}/{c.n}</span>
    </span>
  )
}

export default function GoalGrid({ rows, bar, setBar, lines, setLines, seasonLabel }) {
  const [pin, setPin] = useState(null)
  const mk = marketOf(bar.mkt)
  const line = lines[mk.key] ?? mk.first
  const table = GOAL_MARKETS.map((m) => {
    const ln = lines[m.key] ?? m.first
    const row = thresholdRow(rows, m, ln)
    const out = { _key: m.key, mkt: m.key, label: row.label }
    WINDOWS.forEach(([w], i) => { out[w] = row.cells[i]?.pct ?? null; out[`_${w}`] = row.cells[i] })
    const run = rows.length ? (() => { let k = 0; const first = val(rows[0], m.stat) >= ln; for (const r of rows) { if ((val(r, m.stat) >= ln) === first) k += 1; else break } return first ? k : -k })() : 0
    out.stk = run
    return out
  })
  const columns = [
    { key: 'label', label: 'Market', group: 'BAR', w: 72, heat: false, sticky: true, fmt: (v, r) => <span style={{ fontWeight: r.mkt === mk.key ? 900 : 700, color: r.mkt === mk.key ? C.ice : C.text, whiteSpace: 'nowrap' }}>{v}</span> },
    ...WINDOWS.map(([w]) => ({ key: w, label: w === 'Season' ? 'Szn' : w, group: 'HIT RATE', w: 42, heat: false, fmt: (v, r) => <Cell c={r[`_${w}`]} label={`${r.label}, ${w === 'Season' ? seasonLabel : `last ${w.slice(1)}`}`} /> })),
    { key: 'stk', label: 'Run', group: 'RUN', w: 36, heat: false, fmt: (v) => <b style={{ font: `900 11px/1 ${NUM_FONT}`, color: v > 0 ? verdictInk(true).color : v < 0 ? verdictInk(false).color : C.text3 }} title={v > 0 ? `${v} straight games at this bar` : v < 0 ? `${-v} straight games without it` : ''}>{v > 0 ? `W${v}` : v < 0 ? `L${-v}` : '—'}</b> },
  ]
  // the chart: the active bar over his last 20 games (all of them when fewer), oldest left
  const seg = rows.slice(0, 20).reverse()
  const games = seg.map((g, i) => ({ key: `${g.gameId ?? g.date}-${i}`, val: val(g, mk.stat), title: `${g.date} ${g.home ? 'vs' : '@'} ${g.opp} -- ${val(g, mk.stat)} ${mk.label.toLowerCase()} (${g.g}G ${g.a}A, ${g.shots} shots)` }))
  const p = games.find((x) => x.key === pin)
  const pinRow = p ? seg[games.indexOf(p)] : null
  return (
    <div>
      <LampTable rows={table} columns={columns} bare tight heatMode="none" maxHeight={9999} maxRows={10}
        onRowClick={(r) => { setBar({ mkt: r.mkt }); setPin(null) }}
        caption="Hit rate at each bar over his last 5, 10, 20 games and the season, with the games it stands on. Tap a row to read it below." />
      {mk.lines.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0 0', flexWrap: 'wrap' }}>
          <span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{mk.label.toUpperCase()} BAR</span>
          {mk.lines.map((l) => {
            const on = l === line
            return <button key={l} type="button" onClick={() => setLines((s) => ({ ...s, [mk.key]: l }))} aria-pressed={on}
              style={{ minHeight: 44, minWidth: 44, cursor: 'pointer', padding: '0 12px', borderRadius: 8, border: `1px solid ${on ? C.ice : C.border}`, background: on ? alpha(C.ice, 0.18) : 'transparent', color: on ? C.ice : C.text3, font: `900 12px/1 ${NUM_FONT}` }}>{l}+</button>
          })}
        </div>
      )}
      {games.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: C.text3, font: `600 12px/1.4 ${NUM_FONT}`, marginBottom: 6 }}>{line}+ {mk.label.toLowerCase()} · {rows.length > 20 ? 'last 20' : `all ${games.length}`} games, newest right{games.length < 20 ? ' (a short log: the season so far)' : ''}</div>
          <ValueBars games={games} thr={line} numFont={NUM_FONT} avgColor={alpha(C.ice, 0.6)} selected={pin} onSelect={setPin} />
          {pinRow && (
            <div style={{ marginTop: 7, padding: '6px 10px', borderRadius: 8, font: `600 12px/1.5 ${NUM_FONT}`, color: C.text2, background: alpha(C.ice, 0.06), border: `1px solid ${C.border}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ color: C.text }}>{pinRow.date} {pinRow.home ? 'vs' : '@'} {pinRow.opp}</b>
              <span>{pinRow.g} G</span><span>{pinRow.a} A</span><span>{pinRow.shots} shots</span>{pinRow.toi ? <span>{pinRow.toi} TOI</span> : null}
              <button type="button" onClick={() => setPin(null)} aria-label="Unpin the game" style={{ marginLeft: 'auto', minHeight: 44, minWidth: 44, background: 'none', border: 'none', color: C.text3, cursor: 'pointer', font: 'inherit' }}>✕</button>
            </div>
          )}
        </div>
      )}
      <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
        Rates are cleared games over games played, from his own {seasonLabel} regular-season log, not a forecast. A dimmed cell stands on fewer than five games. Run: W is games in a row at the bar, L games in a row without it.
      </div>
    </div>
  )
}
