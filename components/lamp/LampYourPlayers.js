'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useFollowing } from '../../lib/dash/follow'
import YourPlayersView, { KEYS } from '../YourPlayersView'
import { STATUS, fmtPuckDrop } from './ui'

// ⭐ YOUR PLAYERS ON LAMP (2026-10-03, parity) -- MOONSHOT's section
// (components/YourPlayersView.js) on LAMP's Home, which had none. Fed by what
// Home already reads, so no new request: the followed skaters
// (lib/dash/follow.js, sport nhl -- the Follow button on his page), tonight's
// scores (every goal with its scorer and assists) and tonight's goal board
// (his score and whether he was called).

const RANK = { live: 0, pre: 1, final: 2, off: 3 }

export default function LampYourPlayers({ games = [], board = null, onOpenPlayer = null }) {
  const { rows: followed } = useFollowing('nhl')
  const rows = useMemo(() => {
    const boardRow = new Map()
    for (const g of board?.games || []) for (const r of g.rows || []) boardRow.set(Number(r.playerId), r)
    return followed.map((f) => {
      const id = Number(f.id)
      const b = boardRow.get(id) || null
      const team = b?.team || f.team
      const g = games.find((x) => x.away?.abbrev === team || x.home?.abbrev === team) || null
      const goals = (g?.goals || []).filter((x) => x.scorer?.id === id).length
      const assists = (g?.goals || []).filter((x) => (x.assists || []).some((a) => a.id === id)).length
      const status = !g ? 'off' : g.state === 'live' ? 'live' : g.state === 'final' ? 'final' : 'pre'
      const bars = []
      if (goals) bars.push(goals > 1 ? `${goals} goals` : 'goal')
      if (goals + assists >= 2) bars.push('multi-point')
      else if (assists) bars.push('assist')
      const opp = g ? (g.home?.abbrev === team ? g.away?.abbrev : g.home?.abbrev) : (b?.opp || '')
      return {
        id: String(f.id), name: f.name, starred: false, p: { id }, status, bars, hr: goals,
        role: b?.status === 'called' ? STATUS.called : Number.isFinite(b?.score) ? `G ${Math.round(b.score)}` : '',
        matchup: `${team || ''}${opp ? ` vs ${opp}` : ''}`.trim(),
        lineNode: goals + assists
          ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{goals > 0 && <b style={{ color: C.lamp }}>{goals} G</b>}{goals > 0 && assists > 0 ? ' · ' : ''}{assists > 0 && `${assists} A`}</span>
          : <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{status === 'off' ? 'not playing tonight' : status === 'pre' ? 'puck not dropped' : 'no points'}</span>,
        clock: status === 'live' ? (g.statusLine || 'live') : status === 'final' ? 'final' : status === 'pre' ? fmtPuckDrop(g.startUtc) : '',
      }
    }).sort((a, b) => (RANK[a.status] - RANK[b.status]) || (b.hr - a.hr) || String(a.name).localeCompare(String(b.name)))
  }, [followed, games, board])

  return (
    <YourPlayersView sport="nhl" rows={rows} onPlayerClick={onOpenPlayer ? (p) => onOpenPlayer(p.id) : null}
      theme={C} numFont={NUM_FONT} accent={C.ice} liveInk={C.lamp} keys={KEYS.nhl}
      eventWord={(k) => `${k} goal${k > 1 ? 's' : ''} tonight`} hiddenEventWord={(k) => `${k} with a goal`}
      emptyNote={<>Follow a skater from his page and he lands here, with tonight&apos;s
          goals and assists beside him.</>} />
  )
}
