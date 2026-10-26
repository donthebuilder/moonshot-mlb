'use client'
import LampTable from '../LampTable'
import TrendingBoard from '../../TrendingBoard'
import { C, NUM_FONT } from '../../../lib/nhl/theme'

// 🔥 LAMP TRENDING (2026-10-25; one page for every product 2026-10-26): the shared page (components/TrendingBoard.js) opened on LAMP, with LAMP's
// ice-time filter for when it is the only sport on. Data: /api/trending; with the filter picked, /api/lamp/trending (lamp_box: his games, and the
// forwards / defensemen with 15+ minutes against tonight's defense).
const PRODUCT = {
  route: '/api/lamp/trending',
  // ICE TIME: only games of that much ice time, his and the defense's skaters (?min=)
  filters: [{ param: 'min', label: 'Ice time', pills: [[null, 'Any TOI'], [15, '15+ min'], [18, '18+ min'], [20, '20+ min']] }],
}

export default function Trending({ onOpenPlayer }) {
  return (
    <TrendingBoard sport="nhl" eyebrow="LAMP · TRENDING" C={C} NUM_FONT={NUM_FONT} accent={C.ice} Table={LampTable} onOpenPlayer={onOpenPlayer} product={PRODUCT}
      emptyNote="The books’ lines land in the morning; each game’s again before puck drop." />
  )
}
