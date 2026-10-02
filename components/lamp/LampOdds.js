'use client'
// LAMP'S ODDS TAB (2026-10-02): MOONSHOT's Odds page (components/tabs/
// OddsBoard.js) with sport="nhl" -- the same board, moves and line shop, fed
// tonight's skaters off the goal board (their ids, names, clubs and goal
// score). OddsBoard fetches the NHL prices itself (/api/odds/latest?sport=nhl).
import OddsBoard from '../tabs/OddsBoard'
import { useLampBoardOnce } from '../../lib/nhl/useLamp'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import LampTable from './LampTable'

export default function LampOdds({ onOpenPlayer }) {
  const { data } = useLampBoardOnce()
  const players = (data?.games || []).flatMap((g) => g.rows || [])
  return (
    <OddsBoard sport="nhl" players={players} theme={C} numFont={NUM_FONT} Table={LampTable}
      onPlayerClick={(p) => onOpenPlayer?.(p?.playerId)} />
  )
}
