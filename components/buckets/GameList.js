'use client'
import { useState } from 'react'
import GameRow from '../GameRow'
import TeamMark from '../TeamMark'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { RimDot, fmtTip, SEASON_TYPE } from './ui'

// One row a game -- MOONSHOT's GameRow (Boxes, TUDDY's Scores, LAMP's
// Scores): tap for the line, the game page one tap further. Live first, then
// the slate by tip, then finals.
const ORDER = { live: 0, pre: 1, final: 2 }
export const sortGames = (games) => [...games].sort((a, b) => (ORDER[a.state] ?? 1) - (ORDER[b.state] ?? 1) || String(a.start).localeCompare(String(b.start)))

export default function GameList({ games, onOpenGame, extra = null }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return <div>{sortGames(games).map((g) => <BucketsGameRow key={g.id} g={g} open={open.has(g.id)} onToggle={toggle} onOpenGame={onOpenGame} extra={extra} />)}</div>
}

function BucketsGameRow({ g, open, onToggle, onOpenGame, extra }) {
  const live = g.state === 'live', done = g.state === 'final', scored = live || done
  const winner = done && g.away.score !== g.home.score ? (Number(g.away.score) > Number(g.home.score) ? 'away' : 'home') : null
  const status = live || done ? g.detail : fmtTip(g.start)
  return (
    <GameRow id={g.id} open={open} onToggle={onToggle} theme={C} numFont={NUM_FONT} accent={C.purple}
      openBg={`color-mix(in srgb, ${C.purple} 3%, transparent)`} winner={winner}
      status={{ text: <>{live && <RimDot />}{status}</>, tone: live ? C.rim : done ? C.text2 : C.text3 }}
      sub={g.seasonType && g.seasonType !== 2 ? <div style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, marginTop: 2 }}>{SEASON_TYPE[g.seasonType]}</div> : null}
      sides={[['away', g.away], ['home', g.home]].map(([key, t]) => ({
        key, label: t.name || t.abbrev, score: scored ? (t.score ?? 0) : null,
        mark: <TeamMark sport="nba" abbr={t.abbrev} variant="logo" px={28} dim={Boolean(winner) && winner !== key} />,
      }))}>
      <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {g.venue ? <div style={{ fontSize: 12, color: C.text3 }}>{g.venue}</div> : null}
        {extra ? extra(g) : null}
        <button type="button" onClick={() => onOpenGame?.(g.id)} style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${C.border2}`, background: 'transparent', color: C.purple, font: `800 11px/1 ${NUM_FONT}` }}>Open game →</button>
      </div>
    </GameRow>
  )
}
