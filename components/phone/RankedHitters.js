'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { fetchJSON, slateLooksReal, normalizeData } from '../../lib/data'
import { slatePaths } from '../../lib/dataSource'
import { boardRowContext, boardRows, boardColumns } from '../../lib/boardColumns'
import { scoreFor } from '../../lib/scoring'
import { callStatus, boardOfRows } from '../../lib/callStatus'
import { playerId, mlbId, nameOf } from '../../lib/player'
import { teamHref } from '../../lib/routes'
import { TeamNav } from '../../lib/teamNav'
import DenseTable from '../DenseTable'

// THE RANKED HITTERS, ON THE PHONE (2026-10-16, Research tab). The same DenseTable, the same board columns (lib/boardColumns.js: the full set) and the same
// call-status rule as the full site's Ranked board, without the full site's dashboard around it. The tonight slate is read the way the dashboard reads it
// (fetchJSON + slateLooksReal + normalizeData). Phone rules: 3 rows to start, one tap opens the rest ("Show N more of M"), wide columns scroll inside the
// table's own box with the name pinned, never the page.
const PREVIEW_ROWS = 3

export default function RankedHitters() {
  const router = useRouter()
  const [players, setPlayers] = useState(null)
  const [state, setState] = useState('loading')
  useEffect(() => {
    let alive = true
    fetchJSON(slatePaths('today'), slateLooksReal)
      .then((j) => { if (!alive) return; if (j) { setPlayers(normalizeData(j).players); setState('ok') } else setState('empty') })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [])

  const { rows, columns, statusOf, statusById } = useMemo(() => {
    const ranked = [...(players || [])].sort((a, b) => scoreFor(b, 'hr') - scoreFor(a, 'hr'))
    const ctx = boardRowContext(ranked)
    const boardOf = boardOfRows(ranked) || ranked.length
    const base = boardRows(ranked, ctx).map((r, i) => ({ ...r, _raw: ranked[i], _key: `${playerId(ranked[i])}-${ranked[i]?.game_pk ?? ''}-${i}` }))
    const status = (r) => callStatus({ role: r._raw?.game_pick_role, board_rank: r.rank, board_of: boardOf })
    return {
      rows: base,
      statusById: new Map(base.map((r) => [mlbId(r._raw), status(r)])),
      // the watch star needs the follow store the dashboard wires in; without it the star would be a dead control, so it is left out here (Watch is its own tab)
      columns: boardColumns().filter((c) => c.key !== 'watched'),
      statusOf: status,
    }
  }, [players])

  // A name opens HIS CARD in the phone app (the card, flipped, replaces the dashboard's player pop-up); a club opens its page on the full site.
  const openPlayer = useCallback((p) => {
    const id = mlbId(p)
    if (!id) return
    const status = statusById.get(id) || 'off'
    router.push(`/m?sport=mlb&tab=card&id=${id}&status=${status}&name=${encodeURIComponent(nameOf(p))}`)
  }, [router, statusById])
  const openTeam = useCallback((code) => { const to = teamHref('mlb', code); if (to) router.push(to) }, [router])

  const note = { margin: '4px 2px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.45 }
  if (state === 'loading') return <p style={note}>Loading tonight's hitters…</p>
  if (state === 'empty' || !rows.length) return <p style={note}>No board posted yet. It fills in when tonight's slate is built.</p>
  return (
    <section aria-label="Ranked hitters" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 2px 8px', fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text2 }}>
        <span>RANKED HITTERS</span><span>{rows.length} TONIGHT</span>
      </div>
      <TeamNav.Provider value={openTeam}>
        <DenseTable rows={rows} columns={columns} statusOf={statusOf} nameCell="player" heatMode="sorted" onRowClick={openPlayer}
          maxRows={PREVIEW_ROWS} moreStep={rows.length} maxHeight={560} initialSort={{ key: 'rank', dir: 'asc' }}
          caption="Tonight's hitters ranked by home run score, every board column" />
      </TeamNav.Provider>
    </section>
  )
}
