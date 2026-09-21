'use client'
// GAME SCOREBOARD (2026-09-21) — pulled out of Live.js's own `Scoreboard`
// function, unchanged, so the Scores tab and the Live tab render the exact
// same tiles off the exact same `games` array instead of two copies of the
// same grid logic. See components/nfl/tabs/Scores.js for why this got its
// own tab: Donovan's page-by-page pass that day wanted a plain "just the
// score" page, separate from Slate's per-game analysis and Live's rung
// tracking, and this grid — with no market/card knowledge at all — already
// was that page in everything but name and a URL of its own.
import { C, NUM_FONT } from '../../lib/nfl/theme'

export const fmtKick = (t) => {
  try { return new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) } catch { return 'TBD' }
}

export default function GameScoreboard({ games }) {
  const sorted = [...games].sort((a, b) => {
    const rank = (g) => (g.state === 'in' ? 0 : g.completed || g.state === 'post' ? 2 : 1)
    return rank(a) - rank(b) || Date.parse(a.kickoff || 0) - Date.parse(b.kickoff || 0)
  })
  return (
    <div className="gsb-board">
      {sorted.map((g) => {
        const live = g.state === 'in'
        const done = g.completed || g.state === 'post'
        const pos = g.possession
        return (
          <div key={g.game_id} className={`gsb-game${live ? ' is-live' : ''}${g.redZone ? ' is-rz' : ''}`}>
            <div className="gsb-game-top">
              <span className="gsb-state">{live ? <><i />{g.detail || 'LIVE'}</> : done ? 'FINAL' : fmtKick(g.kickoff)}</span>
              {live && pos && <span className="gsb-pos">{pos} ball{g.downDistance ? ` · ${g.downDistance}` : ''}{g.redZone ? ' · RED ZONE' : ''}</span>}
            </div>
            <div className="gsb-score">
              <span className={pos === g.away ? 'has-ball' : ''}>{g.away}</span>
              <b>{live || done ? (g.away_score ?? 0) : ''}</b>
              <em>{live || done ? '–' : '@'}</em>
              <b>{live || done ? (g.home_score ?? 0) : ''}</b>
              <span className={pos === g.home ? 'has-ball' : ''}>{g.home}</span>
            </div>
          </div>
        )
      })}
      <style>{`
      .gsb-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
      .gsb-game{padding:10px 12px;border:1px solid ${C.border};border-radius:12px;background:${C.bg2}}
      .gsb-game.is-live{border-color:rgba(53,205,255,.45);background:linear-gradient(155deg,rgba(53,205,255,.09),${C.bg2} 60%)}
      .gsb-game.is-rz{border-color:${C.yellow};box-shadow:0 0 0 1px rgba(250,204,21,.25)}
      .gsb-game-top{display:flex;justify-content:space-between;gap:6px;margin-bottom:6px;font:800 9px/1 ${NUM_FONT};color:${C.text3}}
      .gsb-state{display:inline-flex;align-items:center;gap:5px}.gsb-game.is-live .gsb-state{color:${C.cyan}}
      .gsb-state i{width:6px;height:6px;border-radius:99px;background:${C.cyan};box-shadow:0 0 6px ${C.cyan}}
      .gsb-pos{color:${C.yellow};text-align:right}
      .gsb-score{display:grid;grid-template-columns:1fr auto auto auto 1fr;align-items:baseline;gap:8px;font-family:${NUM_FONT}}
      .gsb-score span{font-size:12px;font-weight:800;color:${C.text2}}.gsb-score span:last-child{text-align:right}
      .gsb-score span.has-ball{color:${C.yellow}}
      .gsb-score b{font-size:22px;font-weight:900;color:${C.text};min-width:26px;text-align:center}.gsb-score em{font-style:normal;color:${C.text3}}
      `}</style>
    </div>
  )
}
