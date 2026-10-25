'use client'
import LampTable from '../LampTable'
import TrendingBoard from '../../TrendingBoard'
import { C, NUM_FONT } from '../../../lib/nhl/theme'

// 🔥 LAMP TRENDING (2026-10-25): the shared page (components/TrendingBoard.js) with LAMP's route, lanes, filter and words.
// Data: /api/lamp/trending (lamp_box: his games, and the forwards / defensemen with 15+ minutes against tonight's defense).

const LANE_PILLS = [['all', 'All'], ['g', 'GOAL'], ['pts', 'PTS'], ['a', 'AST'], ['sog', 'SOG']]
const FILTERS = [
  // ICE TIME: only games of that much ice time, his and the defense's skaters (?min=)
  { param: 'min', pills: [[null, 'Any TOI'], [15, '15+ min'], [18, '18+ min'], [20, '20+ min']], note: (v) => ` Only games of ${v}+ minutes on the ice.` },
]

export default function Trending({ onOpenPlayer }) {
  return (
    <TrendingBoard sport="nhl" route="/api/lamp/trending" brandName="LAMP" eyebrow="LAMP · TRENDING" C={C} NUM_FONT={NUM_FONT} accent={C.ice}
      Table={LampTable} onOpenPlayer={onOpenPlayer} lanePills={LANE_PILLS} filters={FILTERS} sinceLabel="SINCE 25-26" dLongLabel="D 30 GMS"
      dTitle="Skaters at his spot (forwards or defensemen, 15+ minutes) against tonight’s defense, its last ~30 games: how many went over his line"
      dNote="D = skaters at his spot (F / D) vs tonight’s defense, its last ~30 games, at his line."
      emptyNote="The books’ lines land in the morning; each game’s again before puck drop." />
  )
}
