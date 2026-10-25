'use client'
import BucketsTable from '../BucketsTable'
import TrendingBoard from '../../TrendingBoard'
import { C, NUM_FONT } from '../../../lib/nba/theme'

// 🔥 BUCKETS TRENDING (2026-10-25): the shared page (components/TrendingBoard.js) with BUCKETS' route, lanes, filters and words.
// Data: /api/buckets/trending (buckets_box: his games, and the STARTERS at his spot G / F / C against tonight's defense).

const LANE_PILLS = [['all', 'All'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['3pm', '3PM'], ['pra', 'PRA']]
const FILTERS = [
  // MINUTES: only games he (and the defense's starters) played that long (?min=)
  { param: 'min', pills: [[null, 'Any min'], [20, '20+ min'], [25, '25+ min'], [30, '30+ min']], note: (v) => ` Only games of ${v}+ minutes.` },
  // SHOT ATTEMPTS: only games with that many field-goal attempts (?fga=)
  { param: 'fga', pills: [[null, 'Any FGA'], [10, '10+ FGA'], [15, '15+ FGA'], [20, '20+ FGA']], note: (v) => ` Only games of ${v}+ shots.` },
]

export default function Trending({ onOpenPlayer }) {
  return (
    <TrendingBoard sport="nba" route="/api/buckets/trending" brandName="BUCKETS" eyebrow="BUCKETS · TRENDING" C={C} NUM_FONT={NUM_FONT} accent={C.purple}
      Table={BucketsTable} onOpenPlayer={onOpenPlayer} lanePills={LANE_PILLS} filters={FILTERS} sinceLabel="SINCE 25-26"
      dTitle="Starter games at his spot (G / F / C) against tonight’s defense: how many went over his line"
      dNote="D = starters at his spot vs tonight’s defense, at his line."
      emptyNote="The books’ lines land at noon ET; each game’s again an hour before tip." />
  )
}
