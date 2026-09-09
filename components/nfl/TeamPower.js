'use client'
import { useMemo, useState } from 'react'
import NflTeamMark from '../fantasy/NflTeamMark'
import { projectedFantasyPoints } from '../../lib/fantasy/scoring'

// ══ TEAM POWER RANKINGS ══════════════════════════════════════════════════════
//
// Requested secondhand (2026-08-23) by a fresh, football-literate user via
// Donovan — "fantasy, pick-helper, power-rankings" — and confirmed 2026-09-01:
// "Power rankings, Pick helper." The Home page's per-market top-tens already
// wore the words POWER RANKINGS; what did not exist anywhere was the thing a
// football fan means by it: the 32 TEAMS, ranked.
//
// WHAT RANKS THEM. Offensive fantasy output, from the same projection every
// Franchise lineup already uses (lib/fantasy/scoring.js, PPR): each team's
// best QB, two RBs, three WRs and one TE by projected points, summed. That is
// a ranking of how much a team's skill players produce — the number a lineup
// decision cares about — and it is stated as such rather than dressed up as a
// win-probability model it is not. There is no defence term because the feed
// publishes no defensive stat line yet (see nflFeed.js's D/ST note).
//
// The stats behind it are per-game and, until the regular season publishes,
// LAST season's — the payload says so (stat_season), and so does the header.
//
// Tap a team for the seven men and their projected points, which is the
// start/sit reference the same user asked for, one row per player.

const SLOTS = [['QB', 1], ['RB', 2], ['WR', 3], ['TE', 1]]

export function projectPlayer(p, scoring = 'ppr') {
  return projectedFantasyPoints({ position: p.position, source_payload: { stats: p.stats || {} } }, scoring)
}

export function teamPowerRows(players, scoring = 'ppr') {
  const byTeam = new Map()
  ;(players || []).forEach((p) => {
    if (!p?.team || !p?.position) return
    const list = byTeam.get(p.team) || (byTeam.set(p.team, []), byTeam.get(p.team))
    list.push({ ...p, proj: projectPlayer(p, scoring) })
  })
  const rows = []
  byTeam.forEach((list, team) => {
    const starters = []
    SLOTS.forEach(([pos, k]) => {
      list.filter((p) => p.position === pos).sort((a, b) => b.proj - a.proj).slice(0, k).forEach((p) => starters.push({ ...p, slot: pos }))
    })
    const total = starters.reduce((a, p) => a + p.proj, 0)
    const pass = starters.filter((p) => p.position === 'QB').reduce((a, p) => a + p.proj, 0)
    const ground = starters.filter((p) => p.position === 'RB').reduce((a, p) => a + p.proj, 0)
    const air = starters.filter((p) => p.position === 'WR' || p.position === 'TE').reduce((a, p) => a + p.proj, 0)
    const missing = SLOTS.reduce((a, [pos, k]) => a + Math.max(0, k - starters.filter((p) => p.position === pos).length), 0)
    rows.push({ team, total: Math.round(total * 10) / 10, pass, ground, air, starters, missing })
  })
  return rows.sort((a, b) => b.total - a.total)
}

export default function TeamPower({ players = [], statSeason, onPlayerClick }) {
  const rows = useMemo(() => teamPowerRows(players), [players])
  const [open, setOpen] = useState(null)
  const [showAll, setShowAll] = useState(false)
  if (!rows.length) return null
  const max = rows[0].total || 1
  const shown = showAll ? rows : rows.slice(0, 12)
  return (
    <section className="tuddy-team-power">
      <div className="tp-head">
        <div>
          <small>POWER RANKINGS · TEAMS</small>
          <h2>Offense, ranked</h2>
        </div>
        <span>{statSeason ? `${statSeason} per-game stats` : 'per-game stats'} · PPR projection of QB + 2 RB + 3 WR + TE</span>
      </div>
      {shown.map((r, i) => {
        const isOpen = open === r.team
        return (
          <div key={r.team} className={`tp-row${isOpen ? ' open' : ''}`}>
            <button onClick={() => setOpen(isOpen ? null : r.team)} title={`${r.team}: passing ${r.pass.toFixed(1)} · rushing ${r.ground.toFixed(1)} · receiving ${r.air.toFixed(1)}${r.missing ? ` · ${r.missing} slot${r.missing === 1 ? '' : 's'} unfilled in the feed` : ''}`}>
              <span className="tp-rank">{i + 1}</span>
              <NflTeamMark size={24} team={r.team} />
              <b>{r.team}</b>
              <span className="tp-bar"><span style={{ width: `${(100 * r.total) / max}%` }} /></span>
              <em>{r.total.toFixed(1)}</em>
              <i>{r.missing ? '·' : ''}{isOpen ? '▲' : '▼'}</i>
            </button>
            {isOpen && (
              <div className="tp-starters">
                {r.starters.map((p) => (
                  <button key={p.player_id} onClick={() => onPlayerClick?.(p, 'TD')}>
                    <span>{p.slot}</span>
                    <b>{p.name}</b>
                    <small>{p.questionable ? 'Q · ' : ''}{p.low_sample ? 'thin sample' : ''}</small>
                    <em>{p.proj.toFixed(1)}</em>
                  </button>
                ))}
                {r.missing > 0 && <p>{r.missing} starting slot{r.missing === 1 ? '' : 's'} not in the feed for {r.team} — the total is understated by that much.</p>}
              </div>
            )}
          </div>
        )
      })}
      {rows.length > 12 && (
        <button className="tp-more" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Top 12 only' : `All ${rows.length} teams`}</button>
      )}
      <style>{`
        .tuddy-team-power{border:1px solid rgba(34,197,94,.22);border-radius:16px;padding:14px 14px 10px;background:linear-gradient(160deg,rgba(34,197,94,.06),transparent 60%)}
        .tp-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
        .tp-head small{display:block;font:900 9px/1 var(--num-font,ui-monospace,monospace);letter-spacing:.1em;opacity:.65}
        .tp-head h2{margin:4px 0 0;font-size:17px}
        .tp-head>span{font:700 9.5px/1.3 var(--num-font,ui-monospace,monospace);opacity:.6}
        .tp-row{border-top:1px solid rgba(255,255,255,.06)}
        .tp-row>button{display:flex;align-items:center;gap:9px;width:100%;padding:7px 2px;background:transparent;border:none;color:inherit;cursor:pointer;text-align:left;min-width:0}
        .tp-rank{width:20px;text-align:right;font:900 11px/1 var(--num-font,ui-monospace,monospace);opacity:.55}
        .tp-row b{width:36px;font-size:12px}
        .tp-bar{flex:1;height:8px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;min-width:40px}
        .tp-bar>span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#22c55e,#06b6d4)}
        .tp-row em{font:900 12px/1 var(--num-font,ui-monospace,monospace);font-style:normal;min-width:40px;text-align:right}
        .tp-row i{font-style:normal;font-size:9px;opacity:.5;width:14px;text-align:right}
        .tp-starters{padding:2px 0 9px 30px;display:flex;flex-direction:column;gap:2px}
        .tp-starters>button{display:flex;align-items:baseline;gap:8px;background:transparent;border:none;color:inherit;cursor:pointer;text-align:left;padding:3px 0;font-size:11.5px;min-width:0}
        .tp-starters>button>span{width:24px;font:900 9px/1 var(--num-font,ui-monospace,monospace);opacity:.6}
        .tp-starters>button>b{font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tp-starters>button>small{font-size:9px;opacity:.55}
        .tp-starters>button>em{margin-left:auto;font:900 11px/1 var(--num-font,ui-monospace,monospace);font-style:normal}
        .tp-starters>p{margin:4px 0 0;font-size:10px;opacity:.6}
        .tp-more{margin-top:8px;padding:5px 12px;border-radius:999px;border:1px solid rgba(34,197,94,.4);background:transparent;color:inherit;font:800 10px/1 var(--num-font,ui-monospace,monospace);cursor:pointer}
        @media(max-width:520px){.tp-starters{padding-left:12px}}
      `}</style>
    </section>
  )
}
