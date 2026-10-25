'use client'
// ADD A LEG (2026-10-25, Donovan: no screenshot scanner, "plug and play the people" instead). A search box at the top of the slip sheet: type a
// name, see the players the books price tonight in ANY product, tap a market chip to put that bet on the one shared slip. Nothing is uploaded and
// nothing is guessed: a market with no real price on its bar has no chip (lib/slip/candidates.js). Each product's player index and prices load
// the first time the box is focused (the global search's own indexes + /api/odds/latest), once per page load, never polled.
import { useMemo, useState } from 'react'
import { loadPlayers } from '../../lib/search/sources'
import { findLegs } from '../../lib/slip/candidates'
import { SLIP_SPORTS } from '../../lib/slip/core'
import { slipToggle } from '../../lib/slip/store'
import { fmtOdds } from '../../lib/odds'
import { BRAND } from '../../lib/routes'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'

const oddsOf = {}   // sport -> Promise<payload|null>, once per page load
const loadOdds = (sport) => (oddsOf[sport] ||= fetch(`/api/odds/latest?sport=${sport}`).then((r) => (r.ok ? r.json() : null)).catch(() => null))

export default function AddLeg({ all = [], C, NUM_FONT, accent }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState({ idx: {}, odds: {}, state: 'idle' })
  const load = () => {
    if (data.state !== 'idle') return
    setData((d) => ({ ...d, state: 'loading' }))
    Promise.all(SLIP_SPORTS.map(async (s) => [s, await loadPlayers(s).catch(() => []), await loadOdds(s)])).then((rows) => {
      const idx = {}; const odds = {}
      for (const [s, p, o] of rows) { if (p?.length) idx[s] = p; if (o && !o.empty && o.by_player_id) odds[s] = o }
      setData({ idx, odds, state: 'ready' })
    })
  }
  const hits = useMemo(() => findLegs(q, data.idx, data.odds), [q, data])
  const on = (l) => all.some((x) => x.key === l.key && x.sport === l.sport)
  const typed = q.trim().length >= 2
  const quiet = { fontSize: 12, lineHeight: 1.5, color: C.text2 }
  return (
    <div data-pm="add-leg" style={{ margin: '4px 0 10px' }}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onFocus={load} placeholder="Add a player to the slip" autoComplete="off" autoCorrect="off" spellCheck={false}
        aria-label="Search a player to add to your slip"
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, fontSize: 16, background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 12px' }} />
      {typed && data.state === 'loading' && <div role="status" style={{ ...quiet, marginTop: 6 }}>Reading tonight&apos;s prices…</div>}
      {typed && data.state === 'ready' && !hits.length && <div style={{ ...quiet, marginTop: 6 }}>No one by that name has a posted price tonight.</div>}
      {hits.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {hits.map((h) => (
            <div key={`${h.sport}-${h.id}`} style={{ borderTop: `1px solid ${C.border}`, padding: '6px 0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 24 }}>
                <b style={{ fontSize: 13, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</b>
                <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: SPORT_ACCENT[h.sport] || accent, whiteSpace: 'nowrap' }}>{BRAND[h.sport]?.name}{h.team ? ` · ${h.team}` : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {h.legs.map((l) => (
                  <button key={l.key} type="button" className={FLAT_CHIP_CLASS} aria-pressed={on(l)} onClick={() => slipToggle(l.sport, l)}
                    aria-label={`${on(l) ? 'Take' : 'Add'} ${l.name} ${l.market}${on(l) ? ' off' : ' to'} the slip, ${fmtOdds(l.price)}`}
                    style={flatChip(on(l), SPORT_ACCENT[h.sport] || accent, C, NUM_FONT)}>
                    {on(l) ? '✓' : '+'} {l.market} {fmtOdds(l.price)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
