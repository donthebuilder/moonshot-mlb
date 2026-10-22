'use client'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { TOTALS_UNITS } from '../../lib/totals/core'
import TeamMark from '../TeamMark'

// THE SLATE ROW, EVERY PRODUCT'S HOME (2026-10-22; TUDDY's twin is components/nfl/NflSlateRow.js, which reads the week file's own
// team model). Each of the day's games as one small tile: both clubs' logos, the game's projected total when Top Totals has stored
// one for it (lib/totals, /api/totals -- only the games on that board; a game without one shows none, never a guess), and the start
// time or the score. The biggest projection is lit. Scrolls sideways in its own box; a tile opens its game.
// games: [{ id, away, home, start (ms), state 'pre'|'live'|'final', awayScore, homeScore }]; totals: Map-like object game id -> row.
export default function SlateRow({ sport, theme: C, numFont, games = [], totals = null, onOpenGame = null, title = 'THE SLATE' }) {
  const accent = SPORT_ACCENT[sport] || C.text
  const unit = TOTALS_UNITS[sport] || { short: '', dp: 1 }
  if (!games.length) return null
  const tot = (g) => { const r = totals?.[String(g.id)]; return r && Number.isFinite(Number(r.projected_total)) ? Number(r.projected_total) : null }
  const top = Math.max(0, ...games.map((g) => tot(g) || 0))
  const anyTotal = games.some((g) => tot(g) != null)
  const when = (g) => {
    if (g.state === 'live') return `${g.awayScore ?? 0}–${g.homeScore ?? 0} · live`
    if (g.state === 'final') return `${g.awayScore ?? 0}–${g.homeScore ?? 0} · final`
    return Number.isFinite(g.start) ? new Date(g.start).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''
  }
  return (
    <section aria-label="The day's games">
      <div style={{ font: `900 10px/1 ${numFont}`, letterSpacing: '.12em', color: accent, margin: '0 0 6px' }}>{title}{anyTotal ? ` · PROJECTED ${unit.short}` : ''}</div>
      <div className="home-slate-row" style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
        {games.map((g) => {
          const t = tot(g)
          const lit = t != null && t === top && top > 0
          return (
            <button key={g.id} type="button" data-tile="game" onClick={onOpenGame ? () => onOpenGame(g.id) : undefined} aria-label={`${g.away} at ${g.home}${t != null ? `, ${t.toFixed(unit.dp)} projected ${unit.unit || ''}` : ''}`}
              style={{ flex: '0 0 auto', minWidth: 92, padding: '7px 9px', borderRadius: 10, cursor: onOpenGame ? 'pointer' : 'default', textAlign: 'left', color: C.text,
                border: `1px solid ${lit ? accent : C.border}`, background: lit ? `color-mix(in srgb, ${accent} 8%, ${C.bg2})` : C.bg2, display: 'grid', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, font: `800 10px/1 ${numFont}`, color: C.text2 }}>
                <TeamMark sport={sport} abbr={g.away} variant="logo" px={14} />@<TeamMark sport={sport} abbr={g.home} variant="logo" px={14} />
                {t != null ? <b style={{ marginLeft: 'auto', paddingLeft: 6, font: `900 13px/1 ${numFont}`, color: lit ? accent : C.text }}>{t.toFixed(unit.dp)}</b> : null}
              </span>
              <span style={{ font: `600 10px/1 ${numFont}`, color: C.text3, whiteSpace: 'nowrap' }}>{when(g)}</span>
            </button>
          )
        })}
      </div>
      <style>{'.home-slate-row::-webkit-scrollbar{display:none}'}</style>
    </section>
  )
}
