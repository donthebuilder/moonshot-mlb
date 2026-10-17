'use client'
import { useRef, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'

// ══ FIND / FILTER ROW, EVERY PRODUCT (2026-10-17, Donovan: "we are mainly going for the LOOK") ═════════════
// MOONSHOT's top row on the Props page (components/Controls.js): one pill search box and a ⚙ Filter button,
// the team / game selects opening under it, the button lighting and counting while a filter is in force.
// Controls itself is MOONSHOT's and is left exactly as it was (it also carries the pitcher search, the
// spotlight manager and the "/" key); this is the same row, measure for measure, for the sports whose
// Props page is PropCards: the product's accent and greys in place of MOONSHOT's, the product's own words.
// It holds no data and decides nothing: PropCards owns the query and the three selects and does the filtering.
const FIND_CSS = `
  .pf-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
  .pf-row .pf-search-wrap { flex: 1 1 0; min-width: 0; position: relative; }
  .pf-row .pf-search { min-height: 44px; }
  .pf-row .pf-search::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
  .pf-row .pf-btn { flex: none; display: inline-flex; }
  .pf-row .pf-more { display: none; flex: 1 1 100%; flex-wrap: wrap; gap: 8px; }
  .pf-row.open .pf-more { display: flex; }
  .pf-row .pf-more > * { flex: 1 1 120px; }
  .pf-row .pf-select { min-height: 44px; }
`

export default function PropFind({
  query, setQuery, team, setTeam, game, setGame, market, setMarket,
  teams = [], games = [], markets = [], placeholder = 'Search player or team…',
  C = MLB_C, NUM_FONT = MLB_NUM, accent = MLB_C.orange,
}) {
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const wash = (p) => `color-mix(in srgb, ${accent} ${p}%, transparent)`
  const active = (team ? 1 : 0) + (game ? 1 : 0) + (market && market !== 'picks' ? 1 : 0)
  const lit = active > 0 || open
  const sel = (on) => ({
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    background: on ? `linear-gradient(135deg, ${wash(16)}, ${wash(5)})` : C.bg3,
    border: `1px solid ${on ? wash(55) : C.border2}`,
    color: on ? accent : C.text, fontWeight: on ? 800 : 500,
    borderRadius: 999, padding: '9px 30px 9px 14px', fontSize: 12, fontFamily: NUM_FONT,
    outline: 'none', width: '100%', minWidth: 0, boxSizing: 'border-box', cursor: 'pointer',
  })
  const caret = (on) => ({ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: on ? accent : C.text3, pointerEvents: 'none' })
  return (
    <div className={`pf-row${open ? ' open' : ''}`}>
      <div className="pf-search-wrap">
        <span aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.55, pointerEvents: 'none' }}>🔍</span>
        <input
          ref={inputRef} type="search" className="pf-search" aria-label="Search the cards by player or team"
          placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)}
          style={{
            background: C.bg3, border: `1px solid ${query ? wash(45) : C.border2}`, color: C.text,
            borderRadius: 999, padding: '9px 44px 9px 34px', fontSize: 12, outline: 'none',
            width: '100%', minWidth: 0, boxSizing: 'border-box',
          }}
        />
        {query ? (
          <button type="button" aria-label="Clear search" title="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus() }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, background: 'transparent', border: 'none', color: accent, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0 }}>✕</button>
        ) : null}
      </div>
      <button type="button" className="pf-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        aria-label={active ? `Filter: ${active} active` : 'Filter by team, game or market'}
        style={{
          alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
          fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT,
          border: `1px solid ${lit ? wash(55) : C.border2}`, background: lit ? wash(14) : C.bg3, color: lit ? accent : C.text2,
        }}>
        <span aria-hidden="true">⚙</span>Filter{active ? ` · ${active}` : ''}
      </button>
      <div className="pf-more">
        <div style={{ position: 'relative', minWidth: 0 }}>
          <select className="pf-select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Show one team's players only" style={sel(!!team)}>
            <option value="">All teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span aria-hidden="true" style={caret(!!team)}>▾</span>
        </div>
        {games.length > 0 ? (
          <div style={{ position: 'relative', minWidth: 0 }}>
            <select className="pf-select" value={game} onChange={(e) => setGame(e.target.value)} aria-label="Show one game only" style={sel(!!game)}>
              <option value="">All games</option>
              {games.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
            <span aria-hidden="true" style={caret(!!game)}>▾</span>
          </div>
        ) : null}
        {markets.length > 0 ? (
          <div style={{ position: 'relative', minWidth: 0 }}>
            <select className="pf-select" value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Show one market only" style={sel(market !== 'picks')}>
              {markets.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <span aria-hidden="true" style={caret(market !== 'picks')}>▾</span>
          </div>
        ) : null}
      </div>
      <style>{FIND_CSS}</style>
    </div>
  )
}
