'use client'
import { useState } from 'react'
import PropsMatrix from '../../player/PropsMatrix'
import { Pills } from '../ui'
import ValueBars from '../../ValueBars'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { alpha } from '../../../lib/scales'
import { GOAL_MARKETS, WINDOWS, THIN_N, thresholdRow, marketOf, val } from '../../../lib/nhl/goalLog'

// 🎯 THE THRESHOLD GRID, HOCKEY EDITION (MOONSHOT components/ThresholdGrid.js).
// Every market x every window on one table, his own game log, nothing behind a
// click: 1+ goal, 2+ shots, 1+ point ... over his last 5 / 10 / 20 and the
// season. The same warm / cool verdict pair MOONSHOT's matrix wears (and its
// 40% / 25% rate bands), the same value chart under it (components/ValueBars,
// shared with MOONSHOT and TUDDY), a tap on a row picks the bar the run and the
// cold case read, a chip moves the line. Every cell prints its fraction, and a
// window of fewer than five games is dimmed and says so.
export default function GoalGrid({ rows, bar, setBar, lines, setLines, seasonLabel }) {
  const [pin, setPin] = useState(null)
  const mk = marketOf(bar.mkt)
  const line = lines[mk.key] ?? mk.first
  const table = GOAL_MARKETS.map((m) => {
    const ln = lines[m.key] ?? m.first
    const row = thresholdRow(rows, m, ln)
    const out = { key: m.key, mkt: m.key, label: row.label, cells: row.cells }
    const run = rows.length ? (() => { let k = 0; const first = val(rows[0], m.stat) >= ln; for (const r of rows) { if ((val(r, m.stat) >= ln) === first) k += 1; else break } return first ? k : -k })() : 0
    out.stk = run
    return out
  })
  // the chart: the active bar over his last 20 games (all of them when fewer), oldest left
  const seg = rows.slice(0, 20).reverse()
  const games = seg.map((g, i) => ({ key: `${g.gameId ?? g.date}-${i}`, val: val(g, mk.stat), title: `${g.date} ${g.home ? 'vs' : '@'} ${g.opp} -- ${val(g, mk.stat)} ${mk.label.toLowerCase()} (${g.g}G ${g.a}A, ${g.shots} shots)` }))
  const p = games.find((x) => x.key === pin)
  const pinRow = p ? seg[games.indexOf(p)] : null
  return (
    <div>
      <PropsMatrix rows={table} windows={WINDOWS.map(([w]) => w)} C={C} NUM_FONT={NUM_FONT} accent={C.ice} look="dense" thin={THIN_N}
        activeKey={mk.key} onPick={(r) => { setBar({ mkt: r.mkt }); setPin(null) }}
        cellTitle={(c, r) => (c ? `${r.label}: ${c.ok} of ${c.n} games${c.full ? '' : ` (all he has played: ${c.n})`}${c.thin ? ' -- a thin sample, read it lightly' : ''}.` : 'no games in this window')} />
      <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, margin: '4px 0 0' }}>Hit rate at each bar over his last 5, 10, 20 games and the season, with the games it stands on. Tap a row to read it below.</div>
      {mk.lines.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0 0', flexWrap: 'wrap' }}>
          <span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{mk.label.toUpperCase()} BAR</span>
          <Pills ariaLabel={`${mk.label} bar`} value={line} onChange={(l) => setLines((st) => ({ ...st, [mk.key]: l }))} options={mk.lines.map((l) => ({ key: l, text: `${l}+` }))} />
        </div>
      )}
      {games.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: C.text3, font: `600 12px/1.4 ${NUM_FONT}`, marginBottom: 6 }}>{line}+ {mk.label.toLowerCase()} · {rows.length > 20 ? 'last 20' : `all ${games.length}`} games, newest right{games.length < 20 ? ' (a short log: the season so far)' : ''}</div>
          <ValueBars games={games} thr={line} numFont={NUM_FONT} avgColor={alpha(C.ice, 0.6)} ink={{ warm: C.ice, cool: C.text3 }} selected={pin} onSelect={setPin} />
          {pinRow && (
            <div style={{ marginTop: 7, padding: '6px 10px', borderRadius: 8, font: `600 12px/1.5 ${NUM_FONT}`, color: C.text2, background: alpha(C.ice, 0.06), border: `1px solid ${C.border}`, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ color: C.text }}>{pinRow.date} {pinRow.home ? 'vs' : '@'} {pinRow.opp}</b>
              <span>{pinRow.g} G</span><span>{pinRow.a} A</span><span>{pinRow.shots} {pinRow.shots === 1 ? 'shot' : 'shots'}</span>{pinRow.toi ? <span>{pinRow.toi} TOI</span> : null}
              <button type="button" onClick={() => setPin(null)} aria-label="Unpin the game" style={{ marginLeft: 'auto', minHeight: 44, minWidth: 44, background: 'none', border: 'none', color: C.text3, cursor: 'pointer', font: 'inherit' }}>✕</button>
            </div>
          )}
        </div>
      )}
      <div style={{ color: C.text3, fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
        Rates are cleared games over games played, from his own {seasonLabel} regular-season log, not a forecast. A grey cell stands on fewer than five games; a cell glows at 60% or more and a flame marks three or more in a row. Run: W is games in a row at the bar, L games in a row without it.
      </div>
    </div>
  )
}
