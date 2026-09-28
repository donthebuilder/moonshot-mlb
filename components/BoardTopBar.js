'use client'
import { useRef } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { useAccent } from './Filters'

// ══ THE BOARD TOP BAR, TUDDY + LAMP (2026-09-27) ════════════════════════════
// Donovan: "there need to be a filter by game not just by team ... the new
// pages don't feel anything like the mlb pages". MOONSHOT's boards open on
// Controls.js -- one big rounded search, a team dropdown, the whole width --
// and TUDDY / LAMP opened on a 150px search box and two grey native selects
// in a row of labels. This is Controls' chrome (same radius, padding, font,
// the ▾, the lit state while filtering) in the product's accent, with the
// GAME beside the team: a filter you can see, not one inside a drawer.
// Desktop: search | team | game on one line. Phone: search on its own row,
// team and game half and half under it, every control 44px tall.

/** A Controls-style dropdown. options: [{ key, label }]; '' is "all". */
export function TopSelect({ value, onChange, options, allLabel, ariaLabel, accent: accentProp }) {
  const ctx = useAccent()
  const accent = accentProp || ctx
  const on = !!value
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="moon-select top-select"
        aria-label={ariaLabel}
        title={ariaLabel}
        style={{
          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          background: on ? `linear-gradient(135deg, ${alpha(accent, 0.16)}, ${alpha(accent, 0.05)})` : C.bg3,
          border: `1px solid ${on ? alpha(accent, 0.55) : C.border2}`,
          color: on ? accent : C.text, fontWeight: on ? 800 : 500,
          borderRadius: 999, padding: '9px 30px 9px 14px', fontSize: 12, fontFamily: NUM_FONT,
          outline: 'none', width: '100%', minWidth: 0, boxSizing: 'border-box', cursor: 'pointer',
          textOverflow: 'ellipsis',
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: on ? accent : C.text3, pointerEvents: 'none' }}>▾</span>
    </div>
  )
}

export default function BoardTopBar({ query, setQuery, placeholder = 'Search player or team…', team, setTeam, teams = [], game, setGame, games = [], teamLabel = 'All teams', gameLabel = 'All games' }) {
  const accent = useAccent()
  const ref = useRef(null)
  return (
    <div className="board-topbar" style={{ display: 'grid', gridTemplateColumns: '1fr 170px 200px', gap: 8, margin: '4px 0 12px' }}>
      <div className="board-topbar-search" style={{ position: 'relative', minWidth: 0 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.55, pointerEvents: 'none' }}>🔍</span>
        <input ref={ref} type="search" className="moon-search" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ background: C.bg3, border: `1px solid ${query ? alpha(accent, 0.45) : C.border2}`, color: C.text, borderRadius: 999,
            padding: '9px 40px 9px 34px', fontSize: 12, outline: 'none', width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
        {query ? (
          <button type="button" onClick={() => { setQuery(''); ref.current?.focus() }} aria-label="Clear search"
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <span style={{ display: 'inline-block', width: 20, height: 20, lineHeight: '18px', borderRadius: 999, background: alpha(accent, 0.14), border: `1px solid ${alpha(accent, 0.4)}`, color: accent, fontSize: 11, fontWeight: 800 }}>✕</span>
          </button>
        ) : null}
      </div>
      <TopSelect value={team} onChange={setTeam} options={teams.map((t) => ({ key: t, label: t }))} allLabel={teamLabel} ariaLabel="Filter the board to one team" />
      <TopSelect value={game} onChange={setGame} options={games} allLabel={gameLabel} ariaLabel="Filter the board to one game" />
      <style jsx>{`
        @media (max-width: 640px) {
          .board-topbar { grid-template-columns: 1fr 1fr !important; }
          .board-topbar-search { grid-column: 1 / -1; }
        }
        @media (max-width: 640px), (pointer: coarse) {
          .board-topbar :global(input), .board-topbar :global(select) { min-height: 44px; }
        }
      `}</style>
    </div>
  )
}
