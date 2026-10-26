'use client'
import BucketsTable from '../BucketsTable'
import TrendingBoard from '../../TrendingBoard'
import { C, NUM_FONT } from '../../../lib/nba/theme'

// 🔥 BUCKETS TRENDING (2026-10-25; one page for every product 2026-10-26): the shared page (components/TrendingBoard.js) opened on BUCKETS,
// with BUCKETS' own filters for when it is the only sport on. Data: /api/trending (every product's rows); with a BUCKETS-only filter picked,
// /api/buckets/trending (buckets_box: his games, and the STARTERS at his spot G / F / C against tonight's defense).
const PRODUCT = {
  route: '/api/buckets/trending',
  filters: [
    // MINUTES: only games he (and the defense's starters) played that long (?min=)
    { param: 'min', label: 'Minutes', pills: [[null, 'Any min'], [20, '20+ min'], [25, '25+ min'], [30, '30+ min']] },
    // SHOT ATTEMPTS: only games with that many field-goal attempts (?fga=)
    { param: 'fga', label: 'Shot attempts', pills: [[null, 'Any FGA'], [10, '10+ FGA'], [15, '15+ FGA'], [20, '20+ FGA']] },
  ],
}

export default function Trending({ onOpenPlayer }) {
  return (
    <TrendingBoard sport="nba" eyebrow="BUCKETS · TRENDING" C={C} NUM_FONT={NUM_FONT} accent={C.purple} Table={BucketsTable} onOpenPlayer={onOpenPlayer} product={PRODUCT}
      emptyNote="The books’ lines land at noon ET; each game’s again an hour before tip." />
  )
}
