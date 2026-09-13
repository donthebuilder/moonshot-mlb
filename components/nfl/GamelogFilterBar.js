'use client'

import { C, NUM_FONT } from '../../lib/nfl/theme'
import { useGamelogFilters, OPS, enumValues, describeFilter } from '../../lib/gamelogFilter'

// NFL's presentation on top of the sport-agnostic engine in
// lib/gamelogFilter.js. Deliberately its own small control set rather than
// components/Filters.js's universal pills -- those draw their active state
// from lib/scales.js's STATE.on(), which is hard-coded to lib/theme.js's
// C.orange (MLB's accent) regardless of which sport's page it renders on.
// Wiring this new control through that would put an orange chip on a jade/
// cyan NFL page. Not this file's job to fix that site-wide; just not worth
// repeating it here.
//
// Render-prop shape: children(filteredRows, filters) -- callers keep their
// own row markup (StatPortal's .portal-log-row today) instead of this file
// guessing at one, matching how differently NFL and MLB will want to show a
// game row.
export default function GamelogFilterBar({ rows, fields, children }) {
  const f = useGamelogFilters(rows, fields)
  if (!f.live.length) return children ? children(rows, f.filters) : null

  return (
    <div className="glf">
      <div className="glf-build">
        <select value={f.draftField} onChange={(e) => f.setDraftField(e.target.value)}>
          {f.live.map((field) => <option key={field.field} value={field.field}>{field.label}</option>)}
        </select>
        {f.draft?.kind === 'enum' ? (
          <select value={f.draftValue} onChange={(e) => f.setDraftValue(e.target.value)}>
            <option value="">choose…</option>
            {enumValues(rows, f.draft.field).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <>
            <select value={f.draftOp} onChange={(e) => f.setDraftOp(e.target.value)}>
              {OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <input
              type="number" inputMode="decimal" placeholder="value" value={f.draftValue}
              onChange={(e) => f.setDraftValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') f.add() }}
            />
          </>
        )}
        <button onClick={f.add} disabled={f.draftValue === ''}>+ Slice</button>
      </div>
      {f.filters.length > 0 && (
        <div className="glf-active">
          <div className="glf-chips">
            {f.filters.map((cond) => (
              <button key={cond.id} className="glf-chip" onClick={() => f.remove(cond.id)} title="remove this condition">
                {describeFilter(cond)} ✕
              </button>
            ))}
            {f.filters.length > 1 && <button className="glf-clear" onClick={f.clearAll}>clear all</button>}
          </div>
          <span className="glf-rate">{f.matched} of {f.total} games · {Math.round(f.rate * 100)}%</span>
        </div>
      )}
      {children ? children(f.filtered, f.filters) : null}
      <style>{`
        .glf{display:flex;flex-direction:column;gap:8px;margin-bottom:11px}
        .glf-build{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
        .glf-build select,.glf-build input{height:28px;padding:0 7px;border:1px solid ${C.border};border-radius:7px;background:#0b0b0d;color:${C.text2};font-size:9.5px;font-family:${NUM_FONT}}
        .glf-build input{width:64px}
        .glf-build button{height:28px;padding:0 10px;border:1px solid ${C.green}66;border-radius:7px;background:${C.green}14;color:${C.green};font:900 9px/1 ${NUM_FONT};letter-spacing:.03em;cursor:pointer;white-space:nowrap}
        .glf-build button:disabled{opacity:.35;cursor:default}
        .glf-active{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
        .glf-chips{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
        .glf-chip{padding:3px 8px;border:1px solid ${C.cyan}55;border-radius:999px;background:${C.cyan}16;color:${C.cyan};font:800 9px/1 ${NUM_FONT};cursor:pointer}
        .glf-clear{background:transparent;border:none;padding:0;color:${C.text3};font:800 9px/1 ${NUM_FONT};text-decoration:underline;cursor:pointer}
        .glf-rate{color:${C.text3};font:800 8.5px/1 ${NUM_FONT};white-space:nowrap}
        @media(max-width:560px){.glf-build select,.glf-build input,.glf-build button{height:30px;font-size:10.5px}}
      `}</style>
    </div>
  )
}
