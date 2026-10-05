'use client'
// TUDDY's TONIGHT strip (2026-10-04): today's games only. The slate already carries
// the live scores (withLive); `liveSnap` is the dashboard's own snapshot (useNflLive,
// passed down -- no new fetch). WENT = live + graded touchdowns (TdWatch's rule);
// STILL TO GO = the week's TD board, CALLED by the ladder, ON THE BOARD = its top
// third (tdCallStatus); LINING UP = the Numerology tab's own call for today's date.
import { useMemo } from 'react'
import TonightStrip from '../TonightStrip'
import { tonightNfl } from '../../lib/tonight'
import { tdPool } from '../../lib/nfl/tdPool'
import { tdsIn, lineFor } from '../../lib/nfl/liveSlate'
import { slateAlignments, alignedWith, dateDigitRoot } from '../../lib/nfl/alignments'
import { tdStatusFor } from '../../lib/nfl/tdStatus'
import { useGameCalls } from '../nfl/GameCalls'
import { easternToday, easternDate } from '../../lib/data'

export default function NflTonight({ data, picks, results, liveSnap, onPlayerClick, setTab }) {
  const todayET = easternToday()
  // the week's game calls (nfl_game_calls.json, ~12 KB): a game call is a call -- the write-up says CALLED
  const gameCalls = useGameCalls()
  const out = useMemo(() => {
    const games = (data?.games || []).filter((g) => easternDate(Date.parse(g.kickoff || '')) === todayET)
    const stateOfTeam = new Map()
    for (const g of games) {
      const st = g.state === 'in' ? 'in' : (g.completed || g.state === 'post') ? 'post' : 'pre'
      stateOfTeam.set(g.home, st); stateOfTeam.set(g.away, st)
    }
    if (!stateOfTeam.size) return null
    const graded = results && data && results.season === data.season && results.week === data.week ? results.lines || null : null
    const pool = tdPool(data)
    const todayPlayers = (data?.players || []).filter((p) => stateOfTeam.has(p.team))
    const root = dateDigitRoot(todayET)
    const aligned = alignedWith(root, slateAlignments(todayPlayers).rows)?.byBotScore || []
    // CALLED = the TD ladder, then his game's call (lib/nfl/tdStatus, shared with the TD board)
    const { onBotOf } = tdStatusFor({ picksCard: picks?.card, gameCalls, games: data?.games, board: pool.rows })
    return tonightNfl({
      rows: pool.rows, today: (p) => stateOfTeam.has(p.team), onBotOf,
      tdsOf: (p) => Math.max(Number(graded?.[p.player_id]?.TD) || 0, tdsIn(lineFor(liveSnap, p)) || 0),
      stateOf: (p) => stateOfTeam.get(p.team) || 'pre', aligned, root,
    })
  }, [data, picks, results, liveSnap, todayET, gameCalls])
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [String(p.player_id), p])), [data])
  return <TonightStrip data={out} onOpen={(id) => { const p = byId.get(String(id)); if (p) onPlayerClick?.(p, 'TD') }} onLedger={setTab ? () => setTab('ledger') : null} />
}
