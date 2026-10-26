'use client'
import NflTable from '../NflTable'
import TrendingBoard from '../../TrendingBoard'
import { C, NUM_FONT } from '../../../lib/nfl/theme'

// 🔥 TUDDY TRENDING (2026-10-25; one page for every product 2026-10-26): the shared page (components/TrendingBoard.js) opened on TUDDY. This week's props
// that keep clearing: every book line on file for a game not yet kicked off (receptions, receiving / rushing / passing yards, rush attempts, kicking
// points, anytime TD) and how often the man went OVER it. Rows come from /api/trending (lib/nfl/trending.js builds them from the week file, the bot's
// game logs and the fresh NFL odds). A man opens on his TUDDY card from the week file this shell already holds.
export default function Trending({ data, onPlayerClick }) {
  const open = (id, lane) => { const p = (data?.players || []).find((x) => String(x.player_id) === String(id)); if (p) onPlayerClick?.(p, lane) }
  return (
    <TrendingBoard sport="nfl" eyebrow="TUDDY · TRENDING" C={C} NUM_FONT={NUM_FONT} accent={C.green} Table={NflTable} onOpenPlayer={open}
      emptyNote="No lines on file for a game that has not started." />
  )
}
