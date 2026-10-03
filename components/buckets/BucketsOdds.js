'use client'
// BUCKETS' ODDS TAB -- MOONSHOT's Odds page (components/tabs/OddsBoard.js) with
// sport="nba", as LAMP's (components/lamp/LampOdds.js): the board, the moves
// and the line shop, fed tonight's players off the points board (ids, names,
// clubs, the points score). Prices exist once BUCKETS opens (odds capture is
// closed until then), and the page says so.
import OddsBoard from '../tabs/OddsBoard'
import { useBucketsBoard } from '../../lib/nba/useBuckets'
import { C, NUM_FONT } from '../../lib/nba/theme'
import BucketsTable from './BucketsTable'

export default function BucketsOdds({ date, onOpenPlayer }) {
  const { data } = useBucketsBoard(date, 'pts')
  const players = data?.rows || []
  return <OddsBoard sport="nba" players={players} theme={C} numFont={NUM_FONT} Table={BucketsTable} onPlayerClick={(p) => onOpenPlayer?.(p?.playerId)} />
}
