'use client'
import { useMemo } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { firstTdBoard, clubFirstRate, FIRST_NOTE } from '../../../lib/nfl/firstTd'
import { kickoffFor } from '../../../lib/nfl/kickoff'
import { roleLabel } from '../../../lib/nfl/roles'
import { useLiveFetch } from '../../../lib/useLiveFetch'
import NflTable from '../NflTable'
import CallStatusBadge from '../../CallStatusBadge'

// FIRST TD -- WHO SCORES THE GAME'S FIRST TOUCHDOWN (2026-10-27, Donovan: "I want these players ranked for first touchdowns and first
// anything"). The Anytime TD board's twin for the first score: one ranked table, built from the week file and this season's openings
// (lib/nfl/firstTd.js, first_td_site_v1). #1 in each game is first on the table; ON THE BOARD = #1-#3 in the game. A ranking, never a chance.
// No record yet: it is frozen at the lock from now on (lib/boardLock.js) and says so.
const MARKET = 'FTD'
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—')
const pctText = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—')

export default function FirstTouchdowns({ data, onPlayerClick }) {
  // the clubs' first-score counts: the openings read the other pages use, this season (games on file; a club with none is 50%)
  const { data: od } = useLiveFetch('/api/nfl/openings?season=this')
  const counts = useMemo(() => new Map((od?.teams || []).map((t) => [t.team, { games: t.gp, firsts: Number.isFinite(t.firstPct) ? Math.round((t.firstPct * t.gp) / 100) : 0 }])), [od])
  const board = useMemo(() => firstTdBoard(data, counts), [data, counts])
  const rows = useMemo(() => {
    const ko = (p) => kickoffFor(data?.games, p) || 0
    return [...board.rows]
      .sort((a, b) => (ko(a) - ko(b)) || String([a.team, a.opp].sort().join()).localeCompare([b.team, b.opp].sort().join()) || a.first.rank - b.first.rank)
      .map((p) => ({
        _id: String(p.player_id), _raw: p, player_id: p.player_id, name: p.name, pos: p.position, team: p.team, opp: p.opp,
        rank: p.first.rank, status: p.first_on_board ? 'board' : 'off', role: roleLabel(p),
        share: p.first.share, club: p.first.club * 2, xtd: Number(p.stats?.xTD), td: Number(p.scores?.TD), score: p.first.score,
        espn_id: p.espn_id, tip: ko(p) || null,
      }))
  }, [board, data])

  if (!rows.length) return <div style={{ color: C.text3, fontSize: TYPE.body, padding: 18 }}>No players have the inputs for the first-TD ranking in this week&apos;s payload yet.</div>

  const columns = [
    { key: 'rank', label: '#', group: 'Player', w: 36, heat: false, mono: true, dim: true, title: 'His place in his game for the first touchdown' },
    { key: 'name', label: 'Player', group: 'Player', w: 150, heat: false, bold: true, sticky: true },
    { key: 'pos', label: 'Pos', group: 'Player', w: 36, heat: false, mono: true, dim: true },
    { key: 'team', label: 'Tm', group: 'Player', w: 52, heat: false, mono: true, teamMark: 'nfl' },
    { key: 'opp', label: 'Opp', group: 'Player', w: 52, heat: false, mono: true, dim: true, subOnly: true },
    { key: 'score', label: 'Score', group: 'Call', w: 54, dp: 0, primary: true, scale: 'seq', domain: [0, 100], title: 'Where his first-TD number sits among this week’s ranked players: a rank, not a chance' },
    { key: 'status', label: 'Status', group: 'Call', w: 120, heat: false, fmt: (v) => <CallStatusBadge status={v} accent={C.green} short /> },
    { key: 'share', label: 'TD share', group: 'Why', w: 64, heat: false, mono: true, title: 'His slice of his club’s expected touchdowns this season (RB, WR, TE)', fmt: pctText },
    { key: 'club', label: 'CLUB ×', group: 'Why', w: 60, heat: false, mono: true, title: 'How his club leans at scoring first this season: 1.00 is a coin flip', fmt: f2 },
    { key: 'xtd', label: 'xTD', group: 'Why', w: 48, dp: 1, mono: true, title: 'Expected touchdowns this season' },
    { key: 'td', label: 'Any TD', group: 'Why', w: 54, dp: 0, mono: true, title: 'His anytime-TD score (the TD board’s)' },
  ]
  return (
    <div>
      <p style={{ margin: '8px 0 10px', fontSize: 12, lineHeight: 1.4, color: C.text2 }}>{FIRST_NOTE}</p>
      <NflTable rows={rows} columns={columns} nameCell="player" faceOf={(r) => ({ sport: 'nfl', espnId: r.espn_id, team: r.team, name: r.name })}
        onRowClick={onPlayerClick ? (r) => onPlayerClick((r?._raw ?? r), MARKET) : undefined} heatMode="sorted" maxHeight={620} maxRows={Math.max(rows.length, 1)}
        caption="Every ranked player, game by game in kickoff order, #1 in each game first. Each row opens that player." />
      <p style={{ margin: '13px 0 0', maxWidth: 620, fontSize: 12, lineHeight: 1.55, color: C.text3 }}>
        Ranked inside each game by his share of his club&apos;s expected touchdowns times how often his club scores first this season (the game&apos;s first score, a field goal counts).
        A ranking, not a probability. ON THE BOARD is the top three in the game. There is no record for this model yet: it is saved before kickoff from now on and graded on the game&apos;s first touchdown.
      </p>
    </div>
  )
}
