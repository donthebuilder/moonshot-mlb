'use client'
// MOONSHOT's TONIGHT strip (2026-10-04): the shared live snapshot (lib/liveSlate,
// the same 15 s cache MiniWire and the rail read -- no new poll; re-read on a ↻ or a
// return to the tab), the board in its own order, and the Numerology page's own
// alignment call (components/Alignments.js) -> lib/tonight tonightMlb -> TonightStrip.
import { useEffect, useMemo, useState } from 'react'
import TonightStrip from '../TonightStrip'
import { tonightMlb } from '../../lib/tonight'
import { fetchLiveSlate } from '../../lib/liveSlate'
import { onLiveRefresh } from '../../lib/liveRefresh'
import { boardOrder, boardScore } from '../../lib/boardOrder'
import { boardOfRows } from '../../lib/callStatus'
import { nameOf, teamOf } from '../../lib/player'
import { usePeople, slateAlignments, alignedWith, dateDigitRoot } from '../../lib/alignments'

export default function MlbTonight({ players = [], results = null, slateDate = '', onPlayerClick, onNavigate }) {
  const [snap, setSnap] = useState(null)
  useEffect(() => {
    let alive = true
    const ask = () => fetchLiveSlate().then((s) => { if (alive && s) setSnap(s) }).catch(() => {})
    ask()
    const stop = onLiveRefresh(ask)
    return () => { alive = false; stop() }
  }, [])
  const { people, loaded } = usePeople(players)   // a Map filled in place: `loaded` is what changes
  const root = useMemo(() => dateDigitRoot(slateDate), [slateDate])
  const aligned = useMemo(() => alignedWith(root, slateAlignments(players, people).rows)?.byBotScore || [], [root, players, people, loaded])   // eslint-disable-line react-hooks/exhaustive-deps
  const data = useMemo(() => {
    const board = boardOrder(players)
    const homers = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    return tonightMlb({ board, of: boardOfRows(players) || players.length, lines: snap?.lines || null, games: snap?.games || null,
      homers, scoreOf: boardScore, aligned, root, nameOf, teamOf })
  }, [players, results, snap, aligned, root])
  const byId = useMemo(() => new Map(players.map((p) => [String(p.player_id ?? p.id), p])), [players])
  return (
    <TonightStrip data={data}
      onOpen={(id) => { const p = byId.get(String(id)); if (p) onPlayerClick?.(p); else if (typeof window !== 'undefined') window.location.hash = `sport=mlb&p=${id}` }}
      onLedger={onNavigate ? () => onNavigate('ledger') : null} />
  )
}
